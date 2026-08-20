/**
 * Starts a Stripe Checkout session for a partner subscription, or moves an
 * existing subscription onto a different plan.
 *
 * What this function does NOT do is mark anybody as paid. It hands back a URL.
 * The subscription becomes real when `stripe-webhook` says it did — because a
 * `?checkout=success` redirect is a string in somebody's address bar.
 */

import { stripe, serviceClient, requirePartnerRole, safeReturnTo, json, CORS } from '../_shared/stripe.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected JSON.' }, 400)
  }

  const partnerId = String(body.partner_id ?? '')
  const planId = String(body.plan_id ?? '')
  if (!partnerId || !planId) return json({ error: 'partner_id and plan_id are required.' }, 400)

  // Only an owner starts a subscription. Checked with the caller's own token.
  const auth = await requirePartnerRole(req, partnerId, 'owner')
  if (auth instanceof Response) return auth

  const db = serviceClient()

  const [{ data: plan }, { data: partner }, { data: existing }] = await Promise.all([
    db.from('partner_plans').select('id, name, monthly_cents, stripe_price_id').eq('id', planId).maybeSingle(),
    db.from('partners').select('id, name').eq('id', partnerId).maybeSingle(),
    db.from('partner_subscriptions').select('*').eq('partner_id', partnerId).maybeSingle(),
  ])

  if (!plan) return json({ error: 'No such plan.' }, 404)
  if (!partner) return json({ error: 'No such business.' }, 404)
  if (!plan.stripe_price_id) {
    // Said plainly rather than as a 500, because this is a setup step someone
    // still has to do, not a bug.
    return json(
      {
        error:
          `The ${plan.name} plan has no Stripe price attached yet. Set partner_plans.stripe_price_id for "${plan.id}" and try again.`,
      },
      409
    )
  }

  const returnTo = safeReturnTo(body.return_to, Deno.env.get('PARTNER_SITE_URL') ?? '')

  try {
    // Reuse the customer if there is one, so a plan change doesn't strand the
    // old subscription under a second customer record.
    let customerId = existing?.stripe_customer_id ?? null
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: partner.name,
        metadata: { partner_id: partnerId },
      })
      customerId = customer.id
    }

    // Already subscribed? Send them to the portal to switch, so proration is
    // Stripe's problem and not ours.
    if (existing?.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(existing.status)) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnTo,
      })
      return json({ url: portal.url, mode: 'portal' })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${returnTo}${returnTo.includes('?') ? '&' : '?'}checkout=success`,
      cancel_url: `${returnTo}${returnTo.includes('?') ? '&' : '?'}checkout=cancelled`,
      // Both places, because webhooks arrive for the session and for the
      // subscription and each needs to find its way home.
      metadata: { partner_id: partnerId, plan_id: planId },
      subscription_data: { metadata: { partner_id: partnerId, plan_id: planId } },
    })

    // A row so the customer id survives even if they abandon the checkout.
    await db.from('partner_subscriptions').upsert(
      {
        partner_id: partnerId,
        plan_id: planId,
        status: existing?.status ?? 'incomplete',
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'partner_id' }
    )

    return json({ url: session.url, mode: 'checkout' })
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
