// ── The bits every edge function needs, whether or not it talks to Stripe ───
//
// Extracted from `stripe.ts` when the invitation mailer arrived and became the
// first function here with no interest in payments at all. Importing the whole
// Stripe SDK to borrow a CORS header would have been silly; copying the header
// into a second file would have been worse, because the copies drift and the
// one that drifts is always the one nobody is looking at.
//
// `stripe.ts` re-exports everything below under the same names, so nothing
// that already imports from it has to change.
//
// Supplied automatically by the platform:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

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
 * Where a Loose Leaf link is allowed to point.
 *
 * `PARTNER_SITE_URL` takes a comma-separated list rather than a single value —
 * otherwise testing from `localhost:5173` silently lands the developer on
 * production, which looks exactly like a bug in the webhook and is not.
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
