import { supabase } from '../../lib/supabase'

/**
 * Email-code auth, matching the six-box screen the product already had.
 *
 * Setup note: Supabase's default "Magic Link" email template sends a link, not
 * a code. For these boxes to be fillable, the template must include
 * {{ .Token }} — see docs/DEPLOY.md.
 */

/** Turns Supabase's error text into something a person should read. */
function readable(error) {
  const raw = error?.message ?? 'Something went wrong.'

  // The Before User Created hook rejects off-campus addresses. Its message is
  // already written for a human, so pass it straight through.
  if (/campus|university email/i.test(raw)) return raw

  if (/failed to fetch|network|load failed|timeout/i.test(raw)) {
    return 'Couldn’t reach Looseleaf just now. Check your connection and try again.'
  }
  if (/rate limit|too many/i.test(raw)) {
    return 'Too many codes requested. Give it a minute and try again.'
  }
  if (/expired|invalid/i.test(raw)) {
    return 'That code didn’t work. It may have expired — request a new one.'
  }
  if (/signups not allowed|disabled/i.test(raw)) {
    return 'Signups are closed right now.'
  }
  return raw
}

/** Sends a fresh six-digit code, creating the account if it's a new address. */
export async function sendCode(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  })
  if (error) throw new Error(readable(error))
}

/** Sends a code only to people who already exist — used by the login screen. */
export async function sendLoginCode(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  })
  if (error) {
    if (/not found|signups/i.test(error.message)) {
      throw new Error('No Looseleaf account for that address yet.')
    }
    throw new Error(readable(error))
  }
}

export async function verifyCode(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  })
  if (error) throw new Error(readable(error))
  return data.session
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session ?? null
}

/** Fires on sign-in, sign-out, and token refresh. Returns an unsubscribe fn. */
export function onAuthChange(handler) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session))
  return () => data.subscription.unsubscribe()
}

export async function signOut() {
  await supabase.auth.signOut()
}
