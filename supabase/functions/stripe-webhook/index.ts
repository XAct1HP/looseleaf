/**
 * ── The only thing that decides who has paid ────────────────────────────────
 *
 * Under the old subscription model this function wrote one column that
 * everything else trusted. It still does, but the column is different: what
 * matters now is `partner_credit`, the record of whether a business actually
 * settles its invoices, because that is what decides how much credit Loose
 * Leaf will extend it next month.
 *
 * Four properties it has to hold:
 *
 *   Signed. An unsigned POST to this URL changes nothing — the body is only
 *   parsed after `constructEventAsync` verifies it against the endpoint secret.
 *
 *   Idempotent. Stripe retries, sometimes for days. Every event id is written
 *   to `partner_billing_events` first; a duplicate returns 200 and stops.
 *   This matters more than it used to: `invoice.paid` *increments* a counter,
 *   so a redelivery that got through would buy a partner a rung on the ladder.
 *
 *   Ordered-ish. Webhooks arrive out of order. Rather than applying deltas to
 *   subscription state we re-read it from Stripe and write the whole current
 *   picture, so a late `updated` cannot resurrect a cancelled account.
 *
 *   Quiet about $0. Stripe raises a zero invoice when the subscription starts
 *   and again for any month a business had no redemptions. Those arrive as
 *   `invoice.paid` like any other, and `record_partner_invoice_paid()` is
 *   written to ignore them — a partner must not climb the credit ladder by
 *   being open and selling nothing.
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
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.marked_uncollectible',
  'payment_method.attached',
  'payment_method.detached',
  'customer.updated',
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
    /* ── the card arrives ──────────────────────────────────────────────── */

    case 'checkout.session.completed': {
      if (!object.subscription) return
      const sub = await stripe.subscriptions.retrieve(object.subscription as string, {
        expand: ['default_payment_method'],
      })
      const partnerId = await syncSubscription(db, sub, object.metadata?.partner_id)
      if (partnerId) await syncDefaultCard(db, partnerId, sub.customer as string)
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // Re-read rather than trusting the payload, so an out-of-order delivery
      // can't write stale state over fresh state.
      const sub = await stripe.subscriptions.retrieve(object.id as string)
      const partnerId = await syncSubscription(db, sub, object.metadata?.partner_id)

      // A cancelled subscription is a business that can no longer be billed,
      // which under this model means it can no longer hand out Date Passes.
      // Its Date Spot is untouched — being listed was always free.
      if (event.type === 'customer.subscription.deleted' && partnerId) {
        await db
          .from('partner_subscriptions')
          .update({ payment_method_at: null, updated_at: new Date().toISOString() })
          .eq('partner_id', partnerId)
      }
      return
    }

    case 'payment_method.attached':
    case 'payment_method.detached':
    case 'customer.updated': {
      const customerId = (object.customer ?? object.id) as string
      const partnerId = await partnerForCustomer(db, customerId)
      if (partnerId) await syncDefaultCard(db, partnerId, customerId)
      return
    }

    /* ── the money ─────────────────────────────────────────────────────── */

    case 'invoice.finalized': {
      // Stripe has decided what this month's bill is. Stamping the invoice id
      // onto the redemptions it covers is what lets a restaurant check the
      // total against the scans its own staff made.
      const partnerId = await partnerForCustomer(db, object.customer as string)
      if (!partnerId) return

      await db.rpc('attach_redemptions_to_invoice', {
        p_partner: partnerId,
        p_invoice_id: object.id as string,
        p_period_end: object.period_end
          ? new Date((object.period_end as number) * 1000).toISOString()
          : null,
      })
      await tag(db, event.id, partnerId)
      return
    }

    case 'invoice.paid': {
      const partnerId = await partnerForCustomer(db, object.customer as string)
      if (!partnerId) return

      // `amount_paid` is what actually cleared, in cents. The $0 invoices
      // Stripe raises for quiet months land here too and are discarded by the
      // function itself rather than by a check that could drift out of sync.
      await db.rpc('record_partner_invoice_paid', {
        p_partner: partnerId,
        p_invoice_id: object.id as string,
        p_amount_cents: Number(object.amount_paid ?? 0),
      })

      await db
        .from('partner_subscriptions')
        .update({ latest_invoice_status: 'paid', updated_at: new Date().toISOString() })
        .eq('partner_id', partnerId)

      await tag(db, event.id, partnerId)
      return
    }

    case 'invoice.payment_failed':
    case 'invoice.marked_uncollectible': {
      const partnerId = await partnerForCustomer(db, object.customer as string)
      if (!partnerId) return

      const uncollectible = event.type === 'invoice.marked_uncollectible'

      // A first decline is not a suspension — cards expire, and switching a
      // restaurant off overnight over an expiring card would be both rude and
      // bad business. What contains the risk in the meantime is the credit
      // ceiling: the failed invoice still counts as outstanding, so their
      // headroom shrinks by exactly what they owe.
      await db.rpc('record_partner_invoice_failed', {
        p_partner: partnerId,
        p_invoice_id: object.id as string,
        p_attempt_count: Number(object.attempt_count ?? 1),
        p_uncollectible: uncollectible,
      })

      await db
        .from('partner_subscriptions')
        .update({
          latest_invoice_status: uncollectible ? 'uncollectible' : 'payment_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('partner_id', partnerId)

      await tag(db, event.id, partnerId)
      return
    }
  }
}

/* ── writers ───────────────────────────────────────────────────────────── */

/** Writes the whole current state of one subscription. Returns the partner. */
async function syncSubscription(db, sub, metadataPartnerId?: string): Promise<string | null> {
  const partnerId =
    sub.metadata?.partner_id ??
    metadataPartnerId ??
    (await partnerForCustomer(db, sub.customer as string))

  if (!partnerId) return null

  const status = sub.status === 'canceled' && sub.cancel_at_period_end ? 'canceled' : sub.status

  const { error } = await db.from('partner_subscriptions').upsert(
    {
      partner_id: partnerId,
      // There is one plan now, and it is free. The column is kept because
      // `partner_plans` is still where entitlements live.
      plan_id: 'free',
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
  return partnerId
}

/**
 * Mirrors whichever card Stripe would actually charge.
 *
 * `payment_method_at` is the column `partner_has_card()` reads, and therefore
 * the single thing standing between a business and being able to hand out
 * Date Passes. It is set from what Stripe says is on the customer, never from
 * a redirect — someone can type `?billing=ok` into an address bar.
 */
async function syncDefaultCard(db, partnerId: string, customerId: string) {
  let brand: string | null = null
  let last4: string | null = null
  let email: string | null = null

  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    })
    if (!('deleted' in customer && customer.deleted)) {
      email = (customer.email as string | null) ?? null
      const pm = customer.invoice_settings?.default_payment_method as
        | { card?: { brand?: string; last4?: string } }
        | string
        | null

      if (pm && typeof pm !== 'string' && pm.card) {
        brand = pm.card.brand ?? null
        last4 = pm.card.last4 ?? null
      }
    }

    // No default set on the customer? A subscription can carry its own, and
    // Stripe charges that one first — so it is the one worth mirroring.
    if (!last4) {
      const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all' })
      const subPm = subs.data[0]?.default_payment_method
      if (subPm) {
        const pm = await stripe.paymentMethods.retrieve(
          typeof subPm === 'string' ? subPm : (subPm as { id: string }).id
        )
        brand = pm.card?.brand ?? brand
        last4 = pm.card?.last4 ?? last4
      }
    }

    // Still nothing? Fall back to any card attached to the customer, because
    // Stripe will find it at collection time even if no default is named.
    if (!last4) {
      const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
      brand = methods.data[0]?.card?.brand ?? brand
      last4 = methods.data[0]?.card?.last4 ?? last4
    }
  } catch {
    // Reading the card is best effort; the subscription state above is not.
  }

  await db
    .from('partner_subscriptions')
    .update({
      payment_method_brand: brand,
      payment_method_last4: last4,
      // Null when there is no card at all, which is what switches Date Passes
      // back off — the same column, in both directions.
      payment_method_at: last4 ? new Date().toISOString() : null,
      billing_email: email,
      updated_at: new Date().toISOString(),
    })
    .eq('partner_id', partnerId)
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

/** Files the event under the business it belonged to, for later forensics. */
async function tag(db, eventId: string, partnerId: string) {
  await db.from('partner_billing_events').update({ partner_id: partnerId }).eq('stripe_event_id', eventId)
}
