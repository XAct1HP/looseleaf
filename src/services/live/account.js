import { supabase } from '../../lib/supabase'

/**
 * ── Leaving ─────────────────────────────────────────────────────────────────
 *
 * One module for the deletions, because they share the shape that makes them
 * dangerous: half of each one happens in Postgres and half in an Edge
 * Function, and a caller that treats the first half as the whole job leaves
 * somebody with a deleted profile and a live login.
 *
 * So nothing in here reports success until the function has answered. The
 * failure mode we are guarding against is the one this code replaced — a
 * confirmation, a redirect, and no deletion — and it is worth being noisy
 * about.
 */

/** Unwraps the JSON error an Edge Function returns, which `error.message` hides. */
async function callDelete(scope) {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { scope },
  })
  if (error) {
    const detail = await error?.context?.json?.().catch(() => null)
    throw new Error(
      detail?.error ||
        error.message ||
        'We could not finish deleting your account. Nothing has been removed — please try again.'
    )
  }
  if (!data?.ok) throw new Error(data?.error || 'We could not finish deleting your account.')
  return data
}

/**
 * What the confirmation sheet is allowed to say. Read before the sheet opens,
 * so the numbers on it are this account's rather than a description of
 * accounts in general.
 */
export async function deletePreview() {
  const { data, error } = await supabase.rpc('delete_my_account_preview')
  if (error) throw new Error(error.message)
  return data ?? {}
}

/**
 * Delete a student account. Returns `{ kept_partner_login }` — true when the
 * same email also holds a Loose Leaf Partner login, which survives on purpose
 * so a business is never left without an owner. The sheet says so.
 */
export async function deleteAccount() {
  const data = await callDelete('student')
  // The session is now attached to a user that may no longer exist. Clearing
  // it locally is the last step rather than the first: sign out before the
  // call and the call has no token to authenticate with.
  await supabase.auth.signOut().catch(() => {})
  return { keptPartnerLogin: Boolean(data.kept_partner_login) }
}

/** Delete a partner login. Refuses while they solely own a business. */
export async function deletePartnerLogin() {
  await callDelete('partner')
  await supabase.auth.signOut().catch(() => {})
}

/** Which businesses, if any, are standing in the way of that. */
export async function partnerLoginBlockers() {
  const { data, error } = await supabase.rpc('partner_login_delete_blockers')
  if (error) throw new Error(error.message)
  return data ?? []
}
