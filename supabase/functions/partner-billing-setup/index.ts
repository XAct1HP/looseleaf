/**
 * ── Putting a card behind a business ────────────────────────────────────────
 *
 * Replaces `partner-checkout`. There is no plan to choose any more, so there
 * is nothing to sell here — this function exists only to get a card on file
 * so that redemptions can be billed at the end of the month.
 *
 * What it creates in Stripe is a subscription, and it is worth being precise
 * about why, because "no subscription" is the promise being made to partners:
 *
 *   The subscription costs $0/month. It carries exactly one item, a metered
 *   price of $1.50 per Date Pass redemption, and a month with no redemptions
 *   produces a $0 invoice and no charge. What Loose Leaf gets from wrapping
 *   it in a subscription rather than raising invoices by hand is Stripe's
 *   whole billing apparatus — monthly invoice generation, Smart Retries when
 *   a card fails, dunning email, and an invoice history the partner can read
 *   in the billing portal. None of that exists for one-off invoices without
 *   building it.
 *
 *   The partner never picks it, never sees a recurring line, and cannot be
 *   charged for a quiet month. It is a container for invoicing, not a plan.
 *
 * As with the old checkout, this function does not mark anybody as ready to
 * trade. It hands back a URL. `stripe-webhook` writes `payment_method_at`,
 * and that column is what `partner_has_card()` reads — because a
 * `?billing=ok` redirect is a string in somebody's address bar.
 */

import {
  stripe,
  serviceClient,
  requirePartner,
  safeReturnTo,
  billingConfig,
  json,
  CORS,
} from '../_shared/stripe.ts'

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
  if (!partnerId) return json({ error: 'partner_id is required.' }, 400)

  // Billing is a page, not a rank. A manager the owner trusted with billing
  // can add a card; a manager they didn't, can't.
  const auth = await requirePartner(req, partnerId, 'billing')
  if (auth instanceof Response) return auth

  const db = serviceClient()

  const [config, { data: partner }, { data: existing }] = await Promise.all([
    billingConfig(db),
    db.from('partners').select('id, name').eq('id', partnerId).maybeSingle(),
    db.from('partner_subscriptions').select('*').eq('partner_id', partnerId).maybeSingle(),
  ])

  if (!partner) return json({ error: 'No such business.' }, 404)

  if (!config?.stripe_metered_price_id) {
    // Said plainly rather than as a 500, because this is a setup step somebody
    // still has to do once, not a bug.
    return json(
      {
        error:
          'Billing is not configured yet. Create the redemption meter and its metered ' +
          'price in Stripe, then set platform_billing.stripe_metered_price_id.',
      },
      409
    )
  }

  const returnTo = safeReturnTo(body.return_to)

  try {
    // Reuse the customer if there is one, so a second attempt after an
    // abandoned checkout doesn't strand the business under two customers.
    let customerId = existing?.stripe_customer_id ?? null
    if (!customerId) {
      const { data: owner } = await db
        .from('partner_members')
        .select('partner_users(email, full_name)')
        .eq('partner_id', partnerId)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle()

      const ownerEmail = (owner?.partner_users as { email?: string } | null)?.email ?? undefined

      const customer = await stripe.customers.create({
        name: partner.name,
        email: ownerEmail,
        metadata: { partner_id: partnerId },
      })
      customerId = customer.id

      await db.from('partner_subscriptions').upsert(
        {
          partner_id: partnerId,
          plan_id: 'free',
          status: existing?.status ?? 'incomplete',
          stripe_customer_id: customerId,
          billing_email: ownerEmail ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'partner_id' }
      )
    }

    // Already set up? Then this is "change my card", which is the portal's
    // job — it handles 3DS, wallets, and every card brand we'd otherwise be
    // responsible for getting right.
    if (existing?.stripe_subscription_id && existing.status !== 'canceled') {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnTo,
      })
      return json({ url: portal.url, mode: 'portal' })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      // A metered price takes no quantity — usage decides the amount.
      line_items: [{ price: config.stripe_metered_price_id }],
      // The subscription total is $0, and Stripe would happily skip asking
      // for a card. Collecting one is the entire point of this flow.
      payment_method_collection: 'always',
      success_url: `${returnTo}${returnTo.includes('?') ? '&' : '?'}billing=ok`,
      cancel_url: `${returnTo}${returnTo.includes('?') ? '&' : '?'}billing=cancelled`,
      // Both places, because webhooks arrive for the session and for the
      // subscription and each needs to find its way home.
      metadata: { partner_id: partnerId },
      subscription_data: {
        metadata: { partner_id: partnerId },
        description: `Loose Leaf — ${partner.name}`,
      },
    })

    return json({ url: session.url, mode: 'checkout' })
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
