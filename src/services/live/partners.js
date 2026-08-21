import { supabase } from '../../lib/supabase'

/**
 * ── The partner platform, live ──────────────────────────────────────────────
 *
 * Almost everything here is an RPC rather than a table read, which is
 * deliberate. The functions are security definer and hand-write their select
 * lists, so the shape of what a business can learn is fixed in the database
 * and not in this file. If a future component wants a column that isn't here,
 * the honest move is to widen the SQL function on purpose — not to reach past
 * it with a `.select()`.
 */

function bail(error) {
  if (error) throw new Error(error.message)
}

/* ── reference data ─────────────────────────────────────────────────────── */

export async function plans() {
  const { data, error } = await supabase
    .from('partner_plans')
    .select('id, name, blurb, monthly_cents, per_verified_date_cents, entitlements, sort')
    .eq('is_public', true)
    .order('sort')
  bail(error)
  return data ?? []
}

export async function taxonomy() {
  const [cats, types, vibes] = await Promise.all([
    supabase.from('partner_categories').select('id, label, emoji, sort').order('sort'),
    supabase.from('date_types').select('id, label, emoji, sort').order('sort'),
    supabase.from('date_vibes').select('id, label, sort').order('sort'),
  ])
  bail(cats.error || types.error || vibes.error)
  return { categories: cats.data ?? [], dateTypes: types.data ?? [], vibes: vibes.data ?? [] }
}

/* ── account ────────────────────────────────────────────────────────────── */

/**
 * Partner sign-in is the same email-code flow students use. The difference is
 * one flag in the signup metadata, which the Before User Created hook reads to
 * skip the campus-domain check. It cannot be used to sneak onto a campus: the
 * profiles insert policy checks the real address in the JWT.
 */
export async function sendCode(email, { createAccount = true } = {}) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: createAccount,
      data: { account_type: 'partner' },
    },
  })
  if (error) {
    if (/not found|signups/i.test(error.message)) {
      throw new Error('No Loose Leaf Partner account for that address yet.')
    }
    throw new Error(error.message)
  }
}

export async function isPartnerUser() {
  const { data, error } = await supabase.rpc('is_partner_user')
  bail(error)
  return Boolean(data)
}

export async function register({ fullName, businessName, category }) {
  const { data, error } = await supabase.rpc('register_partner', {
    p_full_name: fullName,
    p_name: businessName,
    p_category: category,
  })
  bail(error)
  return data
}

/** Every business this person can act for, with its plan and what it unlocks. */
export async function mine() {
  const { data, error } = await supabase.rpc('my_partners')
  bail(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    category: r.category,
    status: r.status,
    reviewNote: r.review_note,
    role: r.role,
    planId: r.plan_id,
    planName: r.plan_name,
    subStatus: r.sub_status,
    periodEnd: r.period_end,
    cancelAtEnd: r.cancel_at_end,
    entitlements: r.entitlements ?? {},
    logoPath: r.logo_path,
    isLive: r.is_live,
  }))
}

export async function update(partnerId, patch) {
  const { error } = await supabase.from('partners').update(patch).eq('id', partnerId)
  bail(error)
}

/* ── the team ───────────────────────────────────────────────────────────── */

/**
 * Names and addresses of the people who can act for this business. Reached
 * through an RPC because `partner_users` is readable only by the person it
 * describes — a plain join would come back as a list of uuids.
 */
export async function team(partnerId) {
  const { data, error } = await supabase.rpc('partner_team', { p_partner: partnerId })
  bail(error)
  return (data ?? []).map((r) => ({
    id: r.partner_user_id,
    name: r.full_name,
    email: r.email,
    role: r.role,
    joinedAt: r.joined_at,
    isYou: r.is_you,
  }))
}

export async function pendingInvites(partnerId) {
  const { data, error } = await supabase.rpc('partner_pending_invites', { p_partner: partnerId })
  bail(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }))
}

export async function invite(partnerId, email, role = 'staff') {
  const { data, error } = await supabase.rpc('invite_partner_member', {
    p_partner: partnerId,
    p_email: email,
    p_role: role,
  })
  bail(error)
  return data
}

export async function revokeInvite(inviteId) {
  const { error } = await supabase.rpc('revoke_partner_invite', { p_invite: inviteId })
  bail(error)
}

export async function setMemberRole(partnerId, userId, role) {
  const { error } = await supabase.rpc('set_partner_member_role', {
    p_partner: partnerId,
    p_user: userId,
    p_role: role,
  })
  bail(error)
}

export async function removeMember(partnerId, userId) {
  const { error } = await supabase.rpc('remove_partner_member', {
    p_partner: partnerId,
    p_user: userId,
  })
  bail(error)
}

/** Invitations waiting for whoever is signed in, matched on their own address. */
export async function myInvites() {
  const { data, error } = await supabase.rpc('my_partner_invites')
  bail(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    role: r.role,
    expiresAt: r.expires_at,
  }))
}

export async function acceptInvite(inviteId, fullName = null) {
  const { data, error } = await supabase.rpc('accept_partner_invite', {
    p_invite: inviteId,
    p_full_name: fullName,
  })
  bail(error)
  return data
}

/* ── locations and the Date Spot ────────────────────────────────────────── */

export async function locations(partnerId) {
  const { data, error } = await supabase
    .from('partner_locations')
    .select('*')
    .eq('partner_id', partnerId)
    .order('is_primary', { ascending: false })
    .order('created_at')
  bail(error)
  return data ?? []
}

export async function addLocation(partnerId, row) {
  const { data, error } = await supabase
    .from('partner_locations')
    .insert({ ...row, partner_id: partnerId })
    .select('id')
    .single()
  bail(error)
  return data.id
}

export async function updateLocation(locationId, patch) {
  const { error } = await supabase.from('partner_locations').update(patch).eq('id', locationId)
  bail(error)
}

export async function spotForLocation(locationId) {
  const { data, error } = await supabase
    .from('date_spots')
    .select('*')
    .eq('partner_location_id', locationId)
    .maybeSingle()
  bail(error)
  return data
}

/** Upserts the card students see. Campus and ownership are set server-side. */
export async function saveSpot(locationId, patch) {
  const { data, error } = await supabase.rpc('save_date_spot', {
    p_location_id: locationId,
    p_patch: patch,
  })
  bail(error)
  return data
}

/* ── offers ─────────────────────────────────────────────────────────────── */

export async function offers(partnerId) {
  const { data, error } = await supabase
    .from('partner_offers')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
  bail(error)
  return data ?? []
}

export async function saveOffer(partnerId, offer) {
  const row = { ...offer, partner_id: partnerId }
  if (row.id) {
    const { id, ...patch } = row
    const { error } = await supabase.from('partner_offers').update(patch).eq('id', id)
    bail(error)
    return id
  }
  const { data, error } = await supabase.from('partner_offers').insert(row).select('id').single()
  bail(error)
  return data.id
}

export async function setOfferStatus(offerId, status) {
  const { error } = await supabase.from('partner_offers').update({ status }).eq('id', offerId)
  bail(error)
}

export async function offerUsage(offerId) {
  const { data, error } = await supabase.rpc('offer_usage', { p_offer: offerId })
  bail(error)
  return data?.[0] ?? { total: 0, this_month: 0, today: 0 }
}

/* ── redemption ─────────────────────────────────────────────────────────── */

/**
 * Look before you leap: this tells the person holding the phone whether the
 * pass is good, and nothing about who it belongs to. It does not redeem —
 * that's a separate, deliberate second action.
 */
export async function lookupPass(partnerId, code) {
  const { data, error } = await supabase.rpc('partner_lookup_pass', {
    p_partner: partnerId,
    p_code: code,
  })
  bail(error)
  const r = data?.[0]
  if (!r) return { valid: false, reason: 'We don’t recognise that code.' }
  return {
    valid: r.valid,
    reason: r.reason,
    offerTitle: r.offer_title,
    offerSummary: r.offer_summary,
    terms: r.offer_terms,
    status: r.status,
    expiresAt: r.expires_at,
    redeemedAt: r.redeemed_at,
    multiUse: r.multi_use,
  }
}

export async function redeemPass(partnerId, code, amountCents = null) {
  const { data, error } = await supabase.rpc('redeem_date_pass', {
    p_partner: partnerId,
    p_code: code,
    p_amount_cents: amountCents,
  })
  bail(error)
  const r = data?.[0]
  return { ok: Boolean(r?.ok), reason: r?.reason ?? null, redeemedAt: r?.redeemed_at ?? null }
}

export async function redemptions(partnerId, { limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('partner_redemptions', {
    p_partner: partnerId,
    p_limit: limit,
    p_offset: offset,
  })
  bail(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    at: r.redeemed_at,
    offerTitle: r.offer_title,
    passRef: r.pass_ref,
    amountCents: r.amount_cents,
    location: r.location,
  }))
}

/* ── measurement ────────────────────────────────────────────────────────── */

export async function overview(partnerId) {
  const { data, error } = await supabase.rpc('partner_overview', { p_partner: partnerId })
  bail(error)
  return data ?? {}
}

export async function funnel(partnerId, days = 30) {
  const { data, error } = await supabase.rpc('partner_funnel', {
    p_partner: partnerId,
    p_days: days,
  })
  bail(error)
  return data ?? {}
}

/* ── targeting ──────────────────────────────────────────────────────────── */

export async function targeting(partnerId) {
  const { data, error } = await supabase
    .from('partner_targeting')
    .select('*')
    .eq('partner_id', partnerId)
    .maybeSingle()
  bail(error)
  return data
}

export async function saveTargeting(partnerId, patch) {
  const { error } = await supabase
    .from('partner_targeting')
    .upsert({ ...patch, partner_id: partnerId, updated_at: new Date().toISOString() })
  bail(error)
}

/* ── billing ────────────────────────────────────────────────────────────── */

export async function subscription(partnerId) {
  const { data, error } = await supabase
    .from('partner_subscriptions')
    .select('*')
    .eq('partner_id', partnerId)
    .maybeSingle()
  bail(error)
  return data
}

/**
 * Checkout and the billing portal both run in a Supabase Edge Function,
 * because the Stripe secret key must never reach a browser and this app has no
 * other server. The function returns a URL; we hand the person to Stripe and
 * wait for the webhook to tell us what actually happened. Coming back from
 * Stripe with `?checkout=success` is a hint to refetch, never proof of payment.
 */
async function billingFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const detail = await error?.context?.text?.().catch(() => null)
    throw new Error(detail || error.message || 'Billing is unavailable right now.')
  }
  if (!data?.url) throw new Error(data?.error || 'Billing is unavailable right now.')
  return data.url
}

export async function checkoutUrl(partnerId, planId, returnTo) {
  return billingFn('partner-checkout', { partner_id: partnerId, plan_id: planId, return_to: returnTo })
}

export async function billingPortalUrl(partnerId, returnTo) {
  return billingFn('partner-portal', { partner_id: partnerId, return_to: returnTo })
}

/* ── staff ──────────────────────────────────────────────────────────────── */

export async function staffQueue(status = 'pending') {
  const { data, error } = await supabase.rpc('staff_partner_queue', { p_status: status })
  bail(error)
  return data ?? []
}

export async function staffSetStatus(partnerId, status, note = null) {
  const { error } = await supabase.rpc('staff_set_partner_status', {
    p_partner: partnerId,
    p_status: status,
    p_note: note,
  })
  bail(error)
}

/**
 * Every offer a business is running, for moderation. Reads the table directly
 * because the `partner_offers` select policy already has an `is_admin()` arm —
 * a staff-only RPC would be a second definition of the same permission.
 */
export async function staffOffers(partnerId) {
  const { data, error } = await supabase
    .from('partner_offers')
    .select('id, title, offer_type, percent_off, amount_off_cents, min_spend_cents, free_item, description, terms, days_of_week, status, created_at')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
  bail(error)
  return data ?? []
}

export async function staffSetOfferStatus(offerId, status) {
  const { error } = await supabase.rpc('staff_set_offer_status', {
    p_offer: offerId,
    p_status: status,
  })
  bail(error)
}

export async function staffRevenue() {
  const { data, error } = await supabase.rpc('staff_partner_revenue')
  bail(error)
  return data ?? {}
}
