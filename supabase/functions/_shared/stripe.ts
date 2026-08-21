// Shared setup for the three billing functions.
//
// Everything secret lives in the function environment. Nothing in this folder
// is ever bundled into the browser — that's the whole reason these exist, since
// Looseleaf is a static site on Vercel with no server of its own.
//
// Required secrets (supabase secrets set --env-file supabase/functions/.env):
//   STRIPE_SECRET_KEY      sk_live_… or sk_test_…
//   STRIPE_WEBHOOK_SECRET  whsec_…  (from the webhook endpoint, not the CLI)
//
// Supplied automatically by the platform:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
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
 * Confirms the caller may act for this business, using *their* token so the
 * answer comes from the same policies the app runs under. Returns the user id.
 *
 * `p_role` picks the bar: 'owner' for anything that touches money, 'member'
 * for reads. A function that skipped this would let anyone with an anon key
 * start a checkout against somebody else's business.
 */
export async function requirePartnerRole(
  req: Request,
  partnerId: string,
  role: 'owner' | 'admin' = 'owner'
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)

  const supabase = callerClient(authHeader)
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) return json({ error: 'Not signed in.' }, 401)

  const fn = role === 'owner' ? 'is_partner_owner' : 'is_partner_admin'
  const { data, error } = await supabase.rpc(fn, { p_partner: partnerId })
  if (error) return json({ error: error.message }, 400)
  if (!data) return json({ error: 'Not authorised for this business.' }, 403)

  return { userId: userData.user.id }
}

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
