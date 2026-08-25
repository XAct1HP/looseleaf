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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

export const stripe = new Stripe(SECRET_KEY, {
  apiVersion: '2024-06-20',
  // Deno has no Node http stack; Stripe needs to be told to use fetch.
  httpClient: Stripe.createFetchHttpClient(),
})

/** Verifying a webhook signature in Deno needs the async, WebCrypto path. */
export const cryptoProvider = Stripe.createSubtleCryptoProvider()

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''

/** Bypasses RLS. Only ever used after the caller has been checked. */
export function serviceClient() {
  return createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })
}

/** Acts as the person who called. Their RLS applies, which is the point. */
export function callerClient(authHeader: string) {
  return createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

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
 * Where Stripe is allowed to send somebody back to.
 *
 * An open redirect on a billing flow is worth avoiding, so the origin has to
 * be one we listed. `PARTNER_SITE_URL` takes a comma-separated list rather
 * than a single value — otherwise testing a checkout from `localhost:5173`
 * silently lands the developer on production, which looks exactly like a bug
 * in the webhook and is not.
 *
 *   PARTNER_SITE_URL=https://hellolooseleaf.com,http://localhost:5173
 *
 * The first entry is the fallback, so production stays the default.
 */
export function allowedOrigins(): string[] {
  return (Deno.env.get('PARTNER_SITE_URL') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function defaultReturnTo(): string {
  return allowedOrigins()[0] ?? ''
}

export function safeReturnTo(value: unknown, fallback?: string) {
  const allowed = allowedOrigins()
  const home = fallback || defaultReturnTo()

  if (typeof value !== 'string' || !value) return home
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return home
    if (allowed.length && !allowed.includes(url.origin)) return home
    return url.toString()
  } catch {
    return home
  }
}

/**
 * ── What card would Stripe actually charge? ─────────────────────────────────
 *
 * One implementation, used by the webhook and by the reconcile endpoint. Two
 * copies of "is there a card on file" would drift, and the column they write
 * is the single thing standing between a business and being able to hand out
 * Date Passes.
 *
 * `reached` is the important field, and its absence was a real bug: the first
 * version swallowed a Stripe error and then wrote `last4 ?? null` anyway, so a
 * timeout while *asking* about the card was recorded as *there is no card* —
 * silently switching a paying partner off. "Stripe says no card" and "we could
 * not ask Stripe" are different facts and the caller has to be able to tell
 * them apart.
 *
 * Three places are checked because Stripe puts the answer in different ones
 * depending on how the card arrived: Checkout sets the subscription's default,
 * the billing portal sets the customer's invoice default, and a bare
 * `payment_method.attached` sets neither.
 */
export async function readDefaultCard(customerId: string): Promise<{
  reached: boolean
  brand: string | null
  last4: string | null
  email: string | null
  error?: string
}> {
  let brand: string | null = null
  let last4: string | null = null
  let email: string | null = null

  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    })

    if ('deleted' in customer && customer.deleted) {
      // A deleted customer genuinely has no card. That is an answer, not a
      // failure, so it is reported as one.
      return { reached: true, brand: null, last4: null, email: null }
    }

    email = (customer.email as string | null) ?? null
    const pm = customer.invoice_settings?.default_payment_method as
      | { card?: { brand?: string; last4?: string } }
      | string
      | null

    if (pm && typeof pm !== 'string' && pm.card) {
      brand = pm.card.brand ?? null
      last4 = pm.card.last4 ?? null
    }

    // Checkout in subscription mode sets the *subscription's* default and does
    // not always set the customer's, so this branch is the one that fires on a
    // first sign-up rather than a rare fallback.
    if (!last4) {
      const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all' })
      const subPm = subs.data[0]?.default_payment_method
      if (subPm) {
        const method = await stripe.paymentMethods.retrieve(
          typeof subPm === 'string' ? subPm : (subPm as { id: string }).id
        )
        brand = method.card?.brand ?? brand
        last4 = method.card?.last4 ?? last4
      }
    }

    // Still nothing? Any card attached to the customer will be found at
    // collection time even with no default named, so it counts.
    if (!last4) {
      const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
      brand = methods.data[0]?.card?.brand ?? brand
      last4 = methods.data[0]?.card?.last4 ?? last4
    }

    return { reached: true, brand, last4, email }
  } catch (e) {
    // Carried out rather than swallowed. The first version of this caught and
    // discarded, which is how a card that Stripe was perfectly willing to talk
    // about came to read as "no card on file" with nothing anywhere saying
    // why. Whatever Stripe objected to, somebody needs to be able to see it.
    return {
      reached: false,
      brand: null,
      last4: null,
      email: null,
      error: (e as Error)?.message ?? 'Unknown Stripe error',
    }
  }
}

/**
 * Writes what `readDefaultCard` found. **Never called when `reached` is false**
 * — leaving the columns exactly as they were is the correct response to not
 * knowing, because the alternative is switching somebody off over a network
 * blip.
 */
export async function writeCardState(
  db: ReturnType<typeof serviceClient>,
  partnerId: string,
  card: { reached: boolean; brand: string | null; last4: string | null; email: string | null }
) {
  if (!card.reached) return false

  const { error } = await db
    .from('partner_subscriptions')
    .update({
      payment_method_brand: card.brand,
      payment_method_last4: card.last4,
      // Null when Stripe says there is no card, which is what switches Date
      // Passes back off — the same column, in both directions.
      payment_method_at: card.last4 ? new Date().toISOString() : null,
      billing_email: card.email,
      updated_at: new Date().toISOString(),
    })
    .eq('partner_id', partnerId)

  if (error) throw new Error(error.message)
  return true
}

/** The one place that reads how billing is configured. */
export async function billingConfig(db: ReturnType<typeof serviceClient>) {
  const { data } = await db
    .from('platform_billing')
    .select('redemption_fee_cents, currency, stripe_meter_event_name, stripe_metered_price_id')
    .eq('id', true)
    .maybeSingle()
  return data
}
