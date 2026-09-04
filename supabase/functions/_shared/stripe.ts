// Shared setup for the billing functions.
//
// Everything secret lives in the function environment. Nothing in this folder
// is ever bundled into the browser — that's the whole reason these exist, since
// Looseleaf is a static site on Vercel with no server of its own.
//
// Required secrets (supabase secrets set --env-file supabase/functions/.env):
//   STRIPE_SECRET_KEY      sk_live_… or sk_test_…
//   STRIPE_WEBHOOK_SECRET  whsec_…  (from the webhook endpoint, not the CLI)
//   METER_WORKER_TOKEN     any long random string; guards partner-meter-redemptions
//
// Supplied automatically by the platform:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext'

// Everything that is not about Stripe lives in `edge.ts` and is re-exported
// here under the same names, so the four functions that already import
// `serviceClient`, `json` or `safeReturnTo` from this file keep working
// untouched. Extracted when the invitation mailer became the first function
// with no interest in payments at all.
export {
  serviceClient,
  callerClient,
  CORS,
  json,
  allowedOrigins,
  defaultReturnTo,
  safeReturnTo,
} from './edge.ts'
import { serviceClient, callerClient, json } from './edge.ts'

const SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

export const stripe = new Stripe(SECRET_KEY, {
  apiVersion: '2024-06-20',
  // Deno has no Node http stack; Stripe needs to be told to use fetch.
  httpClient: Stripe.createFetchHttpClient(),
})

/** Verifying a webhook signature in Deno needs the async, WebCrypto path. */
export const cryptoProvider = Stripe.createSubtleCryptoProvider()

/**
 * ── Reporting a redemption to Stripe ────────────────────────────────────────
 *
 * Deliberately a raw fetch rather than an SDK call. The SDK pinned here
 * predates `stripe.billing.meterEvents`, and the meter endpoint is a stable
 * v1 route that takes four form fields — bumping the whole SDK (and with it
 * the pinned API version that the webhook's event shapes depend on) to gain
 * one method would be a much larger change than this function is worth.
 *
 * `identifier` is Stripe's own deduplication key for meter events, and it is
 * derived from the redemption's row id — so the same scan reported twice is
 * one billable unit, whatever happens to this worker mid-run.
 */
export async function meterEvent(opts: {
  eventName: string
  customerId: string
  value: number
  identifier: string
  at?: Date
}): Promise<void> {
  const form = new URLSearchParams()
  form.set('event_name', opts.eventName)
  form.set('identifier', opts.identifier)
  form.set('payload[stripe_customer_id]', opts.customerId)
  form.set('payload[value]', String(opts.value))
  if (opts.at) form.set('timestamp', String(Math.floor(opts.at.getTime() / 1000)))

  const res = await fetch('https://api.stripe.com/v1/billing/meter_events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Stripe treats a repeat of the same identifier as the same event, so
      // this is belt and braces — but a network timeout on the first attempt
      // is exactly the case where both matter.
      'Idempotency-Key': `meter-${opts.identifier}`,
    },
    body: form,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`meter_events ${res.status}: ${detail.slice(0, 300)}`)
  }
}

/**
 * Confirms the caller may act for this business, using *their* token so the
 * answer comes from the same policies the app runs under. Returns the user id.
 *
 * `need` is either a role — 'owner' for anything that changes who owns the
 * money, 'admin' for anything that changes the Date Spot — or the name of a
 * dashboard page, which is checked with `partner_can()`. Billing is a page:
 * an owner who hands it to their manager expects that manager to be able to
 * fix a declined card without being made an owner to do it.
 */
export async function requirePartner(
  req: Request,
  partnerId: string,
  need: 'owner' | 'admin' | string = 'owner'
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)

  const supabase = callerClient(authHeader)
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) return json({ error: 'Not signed in.' }, 401)

  const call =
    need === 'owner'
      ? supabase.rpc('is_partner_owner', { p_partner: partnerId })
      : need === 'admin'
        ? supabase.rpc('is_partner_admin', { p_partner: partnerId })
        : supabase.rpc('partner_can', { p_partner: partnerId, p_page: need })

  const { data, error } = await call
  if (error) return json({ error: error.message }, 400)
  if (!data) return json({ error: 'Not authorised for this business.' }, 403)

  return { userId: userData.user.id }
}

/** Kept under the old name so nothing that still calls it has to change. */
export const requirePartnerRole = requirePartner

/**
 * ── What payment method would Stripe actually charge? ───────────────────────
 *
 * One implementation, used by the webhook and by the reconcile endpoint. Two
 * copies of "is there a payment method on file" would drift, and the column
 * they write is the single thing standing between a business and being able to
 * hand out Date Passes.
 *
 * Two bugs are fixed here, and both had the same shape — reporting "no payment
 * method" when the truth was something else:
 *
 *   **`reached`.** The first version swallowed a Stripe error and then wrote
 *   `last4 ?? null` anyway, so a timeout while *asking* was recorded as *there
 *   is nothing on file*, silently switching a paying partner off. "Stripe says
 *   there is nothing" and "we could not ask Stripe" are different facts and
 *   the caller has to be able to tell them apart.
 *
 *   **Not everything is a card.** The second version looked only at `.card`
 *   and listed only `type: 'card'`, so a customer who checked out with Link, a
 *   US bank account, or Cash App had a perfectly chargeable payment method
 *   that read as none at all. Stripe Checkout offers those by default. The
 *   list call now passes no `type` filter — "without the filter, the list
 *   includes all current and future payment method types" — and presence is
 *   decided by *a payment method existing*, never by a `last4` being parseable.
 *
 * Three places are checked because Stripe puts the answer in different ones
 * depending on how it arrived: Checkout sets the subscription's default, the
 * billing portal sets the customer's invoice default, and a bare
 * `payment_method.attached` sets neither.
 */
export type PaymentMethodState = {
  reached: boolean
  id: string | null
  type: string | null
  brand: string | null
  last4: string | null
  label: string | null
  email: string | null
  error?: string
}

const NOTHING: PaymentMethodState = {
  reached: true,
  id: null,
  type: null,
  brand: null,
  last4: null,
  label: null,
  email: null,
}

/**
 * How to say a payment method out loud. Deliberately covers the wallets rather
 * than falling through to "card" — telling somebody who paid with their bank
 * account that their *card* is on file is a small lie that makes them doubt
 * everything else on the page.
 */
function describe(pm): { type: string; brand: string | null; last4: string | null; label: string } {
  const type = pm?.type ?? 'unknown'

  if (type === 'card' && pm.card) {
    const brand = pm.card.brand ?? null
    const last4 = pm.card.last4 ?? null
    const name = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card'
    return { type, brand, last4, label: last4 ? `${name} ····${last4}` : name }
  }

  if (type === 'us_bank_account' && pm.us_bank_account) {
    const bank = pm.us_bank_account.bank_name ?? 'Bank account'
    const last4 = pm.us_bank_account.last4 ?? null
    return { type, brand: bank, last4, label: last4 ? `${bank} ····${last4}` : bank }
  }

  if (type === 'link') {
    const email = pm.link?.email ?? null
    return { type, brand: 'Link', last4: null, label: email ? `Link (${email})` : 'Link' }
  }

  if (type === 'cashapp') return { type, brand: 'Cash App Pay', last4: null, label: 'Cash App Pay' }
  if (type === 'paypal')  return { type, brand: 'PayPal',       last4: null, label: 'PayPal' }

  // Anything Stripe adds later still reads as *something*, which is the whole
  // point — an unrecognised type must never come back as "nothing on file".
  const pretty = type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
  return { type, brand: pretty, last4: null, label: pretty }
}

export async function readDefaultPaymentMethod(customerId: string): Promise<PaymentMethodState> {
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    })

    if ('deleted' in customer && customer.deleted) {
      // A deleted customer genuinely has nothing. That is an answer, not a
      // failure, so it is reported as one.
      return NOTHING
    }

    const email = (customer.email as string | null) ?? null

    const asState = (pm): PaymentMethodState => ({
      reached: true,
      id: pm.id ?? null,
      email,
      ...describe(pm),
    })

    // 1 · the customer's invoice default — what the billing portal sets
    const invoiceDefault = customer.invoice_settings?.default_payment_method
    if (invoiceDefault && typeof invoiceDefault !== 'string') return asState(invoiceDefault)

    // 2 · the subscription's own default — what Checkout sets, and therefore
    //     the branch that fires on a first sign-up rather than a rare fallback
    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all' })
    const subPm = subs.data[0]?.default_payment_method
    if (subPm) {
      const pm = await stripe.paymentMethods.retrieve(
        typeof subPm === 'string' ? subPm : (subPm as { id: string }).id
      )
      return asState(pm)
    }

    // 3 · anything attached at all. No `type` filter on purpose: filtering to
    //     'card' is exactly what made a Link or bank customer look empty.
    const methods = await stripe.paymentMethods.list({ customer: customerId, limit: 1 })
    if (methods.data[0]) return asState(methods.data[0])

    return { ...NOTHING, email }
  } catch (e) {
    // Carried out rather than swallowed. The first version caught and
    // discarded, which is how a payment method Stripe was perfectly willing to
    // talk about came to read as "none on file" with nothing anywhere saying
    // why. Whatever Stripe objected to, somebody needs to be able to see it.
    return {
      reached: false,
      id: null,
      type: null,
      brand: null,
      last4: null,
      label: null,
      email: null,
      error: (e as Error)?.message ?? 'Unknown Stripe error',
    }
  }
}

/** Kept under the old name so nothing that still calls it has to change. */
export const readDefaultCard = readDefaultPaymentMethod

/**
 * Writes what `readDefaultPaymentMethod` found. **Never called when `reached`
 * is false** — leaving the columns exactly as they were is the correct
 * response to not knowing, because the alternative is switching somebody off
 * over a network blip.
 *
 * Presence is `id`, not `last4`. A Link wallet has no last four digits and is
 * entirely chargeable; keying off the digits is what made one look like no
 * payment method at all.
 */
export async function writePaymentMethodState(
  db: ReturnType<typeof serviceClient>,
  partnerId: string,
  pm: PaymentMethodState
) {
  if (!pm.reached) return false

  const { error } = await db
    .from('partner_subscriptions')
    .update({
      payment_method_type: pm.type,
      payment_method_brand: pm.label ?? pm.brand,
      payment_method_last4: pm.last4,
      // Null when Stripe says there is nothing, which is what switches Date
      // Passes back off — the same column, in both directions.
      payment_method_at: pm.id ? new Date().toISOString() : null,
      billing_email: pm.email,
      updated_at: new Date().toISOString(),
    })
    .eq('partner_id', partnerId)

  if (error) throw new Error(error.message)
  return true
}

export const writeCardState = writePaymentMethodState

/** The one place that reads how billing is configured. */
export async function billingConfig(db: ReturnType<typeof serviceClient>) {
  const { data } = await db
    .from('platform_billing')
    .select('redemption_fee_cents, currency, stripe_meter_event_name, stripe_metered_price_id')
    .eq('id', true)
    .maybeSingle()
  return data
}
