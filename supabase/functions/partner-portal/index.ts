/**
 * Hands a partner to Stripe's own billing portal — cards, invoices, receipts,
 * and closing the account. Every one of those is something we'd otherwise
 * have to build, get wrong, and then be responsible for.
 *
 * Configure the portal to offer *no plan switching*: there is one plan, it is
 * free, and a "change plan" button that leads nowhere is worse than no button.
 * See docs/STRIPE-PAY-PER-REDEMPTION.md.
 */

import { stripe, serviceClient, requirePartner, safeReturnTo, json, CORS } from '../_shared/stripe.ts'

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

  // Billing is a page the owner grants, not a rank — the same bar as adding
  // the card in the first place.
  const auth = await requirePartner(req, partnerId, 'billing')
  if (auth instanceof Response) return auth

  const db = serviceClient()
  const { data: sub } = await db
    .from('partner_subscriptions')
    .select('stripe_customer_id')
    .eq('partner_id', partnerId)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return json({ error: 'No card on file for this business yet.' }, 409)
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: safeReturnTo(body.return_to),
    })
    return json({ url: session.url })
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
