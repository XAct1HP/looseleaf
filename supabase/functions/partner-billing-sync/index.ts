/**
 * ── Asking Stripe directly, on demand ───────────────────────────────────────
 *
 * The webhook is the fast path. It is not a *reliable* path, and treating it
 * as one produced the bug this function exists to close: a partner added a
 * card on Stripe's page, came back to a "Stripe is confirming your card"
 * banner, and sat there indefinitely because the one event that would have
 * cleared it never arrived. Nothing in the product could recover — the only
 * fix was somebody reading the database.
 *
 * So the redirect back from Stripe now *triggers a reconcile* rather than
 * waiting to be told. The important part, and the reason this is not the same
 * mistake as trusting `?billing=ok`:
 *
 *   The redirect decides only that we should go and look.
 *   Stripe decides what is true.
 *
 * A person who types `?billing=ok` into their address bar causes exactly one
 * thing to happen: we ask Stripe about their customer, Stripe says there is no
 * card, and we write that there is no card. The URL is a prompt to check, never
 * evidence.
 *
 * The webhook still matters — it catches everything that happens with nobody
 * looking at a browser: a card expiring, a payment method being removed from
 * the portal, an invoice failing at 3am. This just means a partner is never
 * *stuck* waiting for it.
 */

import {
  serviceClient,
  requirePartner,
  readDefaultPaymentMethod,
  writePaymentMethodState,
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

  // Same bar as adding the card in the first place: billing is a page the
  // owner grants, not a rank.
  const auth = await requirePartner(req, partnerId, 'billing')
  if (auth instanceof Response) return auth

  const db = serviceClient()

  const { data: sub } = await db
    .from('partner_subscriptions')
    .select('stripe_customer_id')
    .eq('partner_id', partnerId)
    .maybeSingle()

  // No customer means nobody has ever started the card flow. That is a
  // perfectly ordinary state, not an error — say so and let the page render
  // its "add a card" prompt rather than an alarm.
  if (!sub?.stripe_customer_id) {
    return json({ synced: false, has_card: false, reason: 'no_customer' })
  }

  const pm = await readDefaultPaymentMethod(sub.stripe_customer_id)

  if (!pm.reached) {
    // Stripe is having a moment. Change nothing, and be honest that the answer
    // is unknown rather than reporting "no card" — the caller shows a "try
    // again" rather than telling a partner their card vanished.
    return json(
      {
        synced: false,
        has_card: null,
        reason: 'stripe_unreachable',
        // Their own billing, and the alternative is a support thread that
        // starts "it just doesn't work".
        detail: pm.error ?? null,
      },
      503
    )
  }

  await writePaymentMethodState(db, partnerId, pm)

  return json({
    synced: true,
    // Presence is the payment method existing, not a last4 being parseable —
    // a Link wallet has no digits and is entirely chargeable.
    has_card: Boolean(pm.id),
    type: pm.type,
    label: pm.label,
    last4: pm.last4,
  })
})
