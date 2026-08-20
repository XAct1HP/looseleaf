/**
 * ── The only thing that decides who has paid ────────────────────────────────
 *
 * Everything else in the partner platform reads `partner_subscriptions.status`
 * and trusts it. This function is what writes it, and it is the reason a
 * redirect back from Checkout is treated as a hint rather than a receipt.
 *
 * Three properties it has to hold:
 *
 *   Signed. An unsigned POST to this URL changes nothing — the body is only
 *   parsed after `constructEventAsync` verifies it against the endpoint secret.
 *
 *   Idempotent. Stripe retries, sometimes for days. Every event id is written
 *   to `partner_billing_events` first; a duplicate returns 200 and stops.
 *
 *   Ordered-ish. Webhooks arrive out of order. Rather than applying deltas we
 *   re-read the subscription from Stripe and write the whole current state, so
 *   a late `updated` cannot resurrect a cancelled plan.
 *
 * Deploy with JWT verification off — Stripe does not carry a Supabase token:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 */

import { stripe, cryptoProvider, serviceClient, json } from '../_shared/stripe.ts'

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
])

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405)

  const signature = req.headers.get('stripe-signature')
  if (!signature || !WEBHOOK_SECRET) return json({ error: 'Unsigned.' }, 400)

  const raw = await req.text()

  let event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, WEBHOOK_SECRET, undefined, cryptoProvider)
  } catch (e) {
    return json({ error: `Bad signature: ${(e as Error).message}` }, 400)
  }

  const db = serviceClient()

  // Idempotency gate. The primary key does the work — a redelivery collides
  // and we stop here having changed nothing.
  const { error: seenError } = await db
    .from('partner_billing_events')
    .insert({ stripe_event_id: event.id, type: event.type, payload: event.data.object })

  if (seenError) {
    if (seenError.code === '23505') return json({ received: true, duplicate: true })
    return json({ error: seenError.message }, 500)
  }

  if (!HANDLED.has(event.type)) return json({ received: true, ignored: true })

  try {
    await apply(db, event)
    return json({ received: true })
  } catch (e) {
    // A 500 makes Stripe retry, which is what we want — but the event row is
    // already written, so clear it or the retry no-ops on the idempotency gate.
    await db.from('partner_billing_events').delete().eq('stripe_event_id', event.id)
    return json({ error: (e as Error).message }, 500)
  }
})

/* ── applying an event ──────────────────────────────────────────────────── */

async function apply(db: ReturnType<typeof serviceClient>, event) {
  const object = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      if (!object.subscription) return
      const sub = await stripe.subscriptions.retrieve(object.subscription as string)
      await syncSubscription(db, sub, object.metadata?.partner_id)
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // Re-read rather than trusting the payload, so an out-of-order delivery
      // can't write stale state over fresh state.
      const sub = await stripe.subscriptions.retrieve(object.id as string)
      await syncSubscription(db, sub, object.metadata?.partner_id)
      return
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const partnerId = await partnerForCustomer(db, object.customer as string)
      if (!partnerId) return

      await db
        .from('partner_subscriptions')
        .update({
          latest_invoice_status: event.type === 'invoice.paid' ? 'paid' : 'payment_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('partner_id', partnerId)

      if (object.subscription) {
        const sub = await stripe.subscriptions.retrieve(object.subscription as string)
        await syncSubscription(db, sub, partnerId)
      }

      await db.from('partner_billing_events').update({ partner_id: partnerId }).eq('stripe_event_id', event.id)
      return
    }
  }
}

/** Writes the whole current state of one subscription. */
async function syncSubscription(db, sub, metadataPartnerId?: string) {
  const partnerId =
    sub.metadata?.partner_id ??
    metadataPartnerId ??
    (await partnerForCustomer(db, sub.customer as string))

  if (!partnerId) return

  // The plan is identified by the price, not by whatever metadata says, so a
  // plan changed inside the Stripe dashboard still lands correctly here.
  const priceId = sub.items?.data?.[0]?.price?.id ?? null
  let planId = sub.metadata?.plan_id ?? null
  if (priceId) {
    const { data: plan } = await db
      .from('partner_plans')
      .select('id')
      .eq('stripe_price_id', priceId)
      .maybeSingle()
    if (plan) planId = plan.id
  }

  const status = sub.status === 'canceled' && sub.cancel_at_period_end ? 'canceled' : sub.status

  const { error } = await db.from('partner_subscriptions').upsert(
    {
      partner_id: partnerId,
      plan_id: planId,
      status,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'partner_id' }
  )
  if (error) throw new Error(error.message)
}

async function partnerForCustomer(db, customerId: string | null) {
  if (!customerId) return null
  const { data } = await db
    .from('partner_subscriptions')
    .select('partner_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return data?.partner_id ?? null
}
