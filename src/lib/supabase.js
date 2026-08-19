import { createClient } from '@supabase/supabase-js'

/**
 * The Supabase client, created only when the environment actually has
 * credentials. Everything downstream checks `isSupabaseConfigured` first, so a
 * missing key degrades to demo mode instead of crashing the app — which is what
 * keeps a fresh clone (and a fresh Vercel preview) working with zero setup.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/**
 * "demo"     — the bundled campus, no network at all
 * "supabase" — live data
 *
 * Asking for supabase mode without keys falls back to demo and says so, rather
 * than shipping a blank app.
 */
function resolveMode() {
  const requested = import.meta.env.VITE_DATA_MODE ?? 'demo'
  if (requested !== 'supabase') return 'demo'
  if (!isSupabaseConfigured) {
    console.warn(
      '[looseleaf] VITE_DATA_MODE=supabase but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing — falling back to demo data.'
    )
    return 'demo'
  }
  return 'supabase'
}

export const DATA_MODE = resolveMode()
export const isDemo = DATA_MODE === 'demo'

/**
 * How many digits are in an emailed sign-in code.
 *
 * Supabase decides this, not us — it's `GOTRUE_MAILER_OTP_LENGTH`, exposed in
 * the dashboard under Authentication → Email provider settings. The default is
 * not consistent: some projects send 6, some send 8, and it has differed
 * between the signup and magic-link flows. So this is configurable, and the
 * Verify screen also accepts a shorter code via its button rather than only
 * auto-submitting at exactly this length. Hard-coding 6 is how sign-in breaks
 * silently.
 */
const requestedOtpLength = Number(import.meta.env.VITE_OTP_LENGTH)
export const OTP_LENGTH =
  Number.isInteger(requestedOtpLength) && requestedOtpLength >= 6 && requestedOtpLength <= 10
    ? requestedOtpLength
    : 8

/** Shortest code we'll let someone submit, whatever the box count is. */
export const OTP_MIN_LENGTH = 6
