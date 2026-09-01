/**
 * ── Finishing a deletion the database cannot finish on its own ──────────────
 *
 * `delete_my_account()` and `delete_my_partner_login()` remove everything in
 * the `public` schema. Two things are left over afterwards and neither is
 * reachable from SQL run as the person leaving:
 *
 *   · the files. A bucket is not a foreign key — deleting `profile_photos`
 *     removes the rows that point at the photos and leaves the photos.
 *   · the auth user. Supabase revoked write access to the `auth` schema, which
 *     is the same wall that turned the signup domain check into a hook instead
 *     of a trigger. Only the service role can delete a user, and the service
 *     role only exists out here.
 *
 * So the account is not gone until this has run, and the client is written to
 * treat a failure here as a failed deletion rather than a cosmetic one.
 *
 * Deliberately no import from `_shared/stripe.ts`. It exports the two client
 * helpers this needs, but it also constructs the Stripe SDK at module load,
 * and paying that cold start — and that coupling — to delete an account would
 * be the wrong dependency in the wrong direction. Fifteen lines of duplication
 * is the cheaper mistake.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const PHOTO_BUCKET = 'profile-photos'
/** Mirrors SMALL_SUFFIX in src/lib/imagePipeline.js. */
const SMALL_SUFFIX = '@sm'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** Bypasses RLS. Only ever used after the caller has been checked. */
const serviceClient = () =>
  createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })

/** Acts as the person who called, so the RPCs see their `auth.uid()`. */
const callerClient = (authHeader: string) =>
  createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

const smallPath = (p: string) => p.replace(/(\.[^./]+)$/, `${SMALL_SUFFIX}$1`)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected JSON.' }, 400)
  }

  const scope = String(body.scope ?? '')
  if (scope !== 'student' && scope !== 'partner') {
    return json({ error: "scope must be 'student' or 'partner'." }, 400)
  }

  const caller = callerClient(authHeader)
  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData?.user) return json({ error: 'Not signed in.' }, 401)
  const userId = userData.user.id

  const db = serviceClient()

  if (scope === 'partner') {
    // The RPC refuses while they are the sole owner of any business, and says
    // which. Let that message through unchanged — it is the actionable half.
    const { error } = await caller.rpc('delete_my_partner_login')
    if (error) return json({ error: error.message }, 409)

    const { error: authError } = await db.auth.admin.deleteUser(userId)
    if (authError) return json({ error: authError.message, partial: true }, 500)
    return json({ ok: true })
  }

  // ── a student ────────────────────────────────────────────────────────────
  const { data, error } = await caller.rpc('delete_my_account')
  if (error) return json({ error: error.message }, 409)

  // Both derivatives of every photo. `remove` on a key that isn't there is not
  // an error, so the legacy uploads that never had a small variant cost one
  // wasted key each and nothing else.
  const paths = (data?.storage_paths ?? []) as string[]
  if (paths.length) {
    const keys = paths.flatMap((p) => [p, smallPath(p)])
    const { error: storageError } = await db.storage.from(PHOTO_BUCKET).remove(keys)
    // A file left in a private bucket that nothing can now sign a URL for is
    // not a reason to leave the auth user in place. Log it and carry on —
    // stopping here would be the worse of the two outcomes.
    if (storageError) console.error('delete-account: storage', storageError.message)
  }

  // ── the one case where the auth user has to stay ─────────────────────────
  //  The same email can hold a student account and a partner login. Deleting
  //  the auth user takes `partner_users` with it by cascade — which would step
  //  straight past the sole-owner check that `delete_my_partner_login()`
  //  exists to enforce, and leave a business nobody can fix. So if there is a
  //  partner login on this user, the profile goes and the login stays, and the
  //  response says so rather than reporting a clean sweep.
  const { data: partnerUser } = await db
    .from('partner_users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (partnerUser) {
    return json({ ok: true, kept_partner_login: true })
  }

  const { error: authError } = await db.auth.admin.deleteUser(userId)
  if (authError) return json({ error: authError.message, partial: true }, 500)
  return json({ ok: true })
})
