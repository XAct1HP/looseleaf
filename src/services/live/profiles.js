import { supabase } from '../../lib/supabase'
import { signUrls, uploadPhoto, removePhoto } from './photos'

/**
 * Reads and writes a person's own profile. The row shapes here are the ones
 * the UI already expects — camelCase, photos as an ordered array, prompts as
 * {q, a} — so pages don't need to know which mode they're running in.
 */

/**
 * The database is canonical and singular: gender is 'woman' | 'man' |
 * 'nonbinary' | 'other', and interested_in holds those same tokens (plus
 * 'everyone'). The UI speaks in plurals — "Women", "Men" — because that's how
 * the question reads on screen. get_deck compares the two columns directly, so
 * the translation has to happen here or every deck comes back empty.
 */
const GENDER_TOKEN = {
  woman: 'woman',
  man: 'man',
  nonbinary: 'nonbinary',
  'another way': 'other',
}

const PREF_TO_GENDER = { women: 'woman', men: 'man', nonbinary: 'nonbinary', everyone: 'everyone' }
const GENDER_TO_PREF = { woman: 'women', man: 'men', nonbinary: 'nonbinary', everyone: 'everyone' }

const toGenderToken = (value) => GENDER_TOKEN[String(value ?? '').toLowerCase()] ?? 'other'
const prefsToDb = (list = []) => list.map((p) => PREF_TO_GENDER[p] ?? p)
const prefsToUi = (list = []) => list.map((g) => GENDER_TO_PREF[g] ?? g)

export function ageFrom(birthdate) {
  const dob = new Date(birthdate)
  if (Number.isNaN(dob.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1
  return age
}

/** Which campus an address belongs to. Null means we aren't there yet. */
export async function universityForEmail(email) {
  const domain = String(email).toLowerCase().split('@')[1]
  if (!domain) return null

  const { data, error } = await supabase
    .from('universities')
    .select('*')
    .contains('email_domains', [domain])
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ?? null
}

export async function campusStatus() {
  const { data, error } = await supabase.rpc('campus_status')
  if (error) throw new Error(error.message)
  return data
}

/**
 * The whole profile in one round trip, with photo URLs already signed.
 * Returns null when the account exists but onboarding hasn't run yet.
 */
export async function loadMe(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      `
      id, first_name, age, gender, pronouns, grad_year, major, minor, area, orgs,
      intention, is_paused, is_admin, onboarded_at, university_id,
      universities ( name, short_name, city ),
      profile_preferences ( interested_in, min_age, max_age, intentions ),
      profile_photos ( position, storage_path, scene ),
      profile_prompts ( position, question, answer ),
      profile_interests ( interest_id )
    `
    )
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const photoRows = [...(data.profile_photos ?? [])].sort((a, b) => a.position - b.position)
  // Both sizes, in one signing round trip: the page shows the big one and
  // every list that mentions this person shows the small one.
  const paths = photoRows.map((p) => p.storage_path)
  const [urls, thumbs] = await Promise.all([signUrls(paths), signUrls(paths, 'sm')])

  const prefs = data.profile_preferences ?? {}

  return {
    id: data.id,
    firstName: data.first_name,
    age: data.age,
    gender: data.gender,
    pronouns: data.pronouns,
    gradYear: data.grad_year,
    major: data.major,
    minor: data.minor,
    area: data.area,
    orgs: data.orgs ?? [],
    intention: data.intention,
    isPaused: data.is_paused,
    isAdmin: data.is_admin,
    onboarded: Boolean(data.onboarded_at),
    university: data.universities,
    universityId: data.university_id,
    photos: photoRows.map((p) => ({
      position: p.position,
      path: p.storage_path,
      url: p.storage_path ? urls[p.storage_path] : null,
      thumbUrl: p.storage_path ? thumbs[p.storage_path] : null,
      scene: p.scene,
    })),
    prompts: [...(data.profile_prompts ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ q: p.question, a: p.answer })),
    interests: (data.profile_interests ?? []).map((i) => i.interest_id),
    prefs: {
      interestedIn: prefsToUi(prefs.interested_in ?? []),
      ageRange: [prefs.min_age ?? 18, prefs.max_age ?? 30],
      intentions: prefs.intentions ?? [],
    },
  }
}

/**
 * Writes everything onboarding collected.
 *
 * Not a transaction — PostgREST has no multi-statement transactions, so this
 * is a sequence of upserts ordered so that a failure partway through leaves a
 * profile that onboarding can resume rather than a broken one. `onboarded_at`
 * is set last, on purpose: until it's set, the profile is invisible to the
 * deck and to campus headcount.
 */
export async function saveOnboarding(userId, email, draft, { onProgress } = {}) {
  const university = await universityForEmail(email)
  if (!university) {
    throw new Error('We don’t recognise that campus yet.')
  }

  const age = ageFrom(draft.birthday)
  if (age === null || age < 18) {
    throw new Error('You need to be 18 or older to use Looseleaf.')
  }

  onProgress?.('Saving the basics')
  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      university_id: university.id,
      first_name: draft.firstName.trim(),
      gender: toGenderToken(draft.gender),
      pronouns: draft.pronouns?.trim() || null,
      grad_year: draft.gradYear,
      major: draft.major.trim(),
      minor: draft.minor?.trim() || null,
      area: draft.area,
      orgs: draft.orgsText
        ? draft.orgsText.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      intention: draft.intentions?.[0] ?? 'seeing',
      age,
    },
    { onConflict: 'id' }
  )
  if (profileError) throw new Error(profileError.message)

  await supabase.from('profile_dob').upsert(
    { profile_id: userId, birthdate: draft.birthday },
    { onConflict: 'profile_id' }
  )

  onProgress?.('Saving your preferences')
  const { error: prefError } = await supabase.from('profile_preferences').upsert(
    {
      profile_id: userId,
      interested_in: prefsToDb(draft.interestedIn),
      min_age: draft.ageRange?.[0] ?? 18,
      max_age: draft.ageRange?.[1] ?? 30,
      intentions: draft.intentions ?? [],
    },
    { onConflict: 'profile_id' }
  )
  if (prefError) throw new Error(prefError.message)

  onProgress?.('Uploading your photos')
  await savePhotos(userId, draft.photos ?? [])

  onProgress?.('Saving your answers')
  await savePrompts(userId, draft.prompts ?? [])

  onProgress?.('Saving your interests')
  await saveInterests(userId, draft.interests ?? [])

  // Last, so a half-finished profile is never shown to anyone.
  const { error: doneError } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', userId)
  if (doneError) throw new Error(doneError.message)

  return loadMe(userId)
}

/**
 * @param photos array of { file?, prepared?, path?, scene? } in display order.
 *               `prepared` is the already-resized, already-converted result
 *               the picker produced to draw its preview; passing it through
 *               means the image is decoded once per photo, not twice.
 */
export async function savePhotos(userId, photos) {
  const rows = []

  for (let position = 0; position < photos.length; position++) {
    const photo = photos[position]
    if (!photo) continue

    let path = photo.path ?? null
    if (photo.file) {
      path = await uploadPhoto(userId, photo.file, position, photo.prepared ?? null)
    }
    rows.push({ profile_id: userId, position, storage_path: path, scene: photo.scene ?? null })
  }

  // Drop slots that no longer exist, then write the current set.
  const { data: existing } = await supabase
    .from('profile_photos')
    .select('position, storage_path')
    .eq('profile_id', userId)

  const keptPaths = new Set(rows.map((r) => r.storage_path).filter(Boolean))
  const orphaned = (existing ?? [])
    .map((row) => row.storage_path)
    .filter((path) => path && !keptPaths.has(path))

  await supabase.from('profile_photos').delete().eq('profile_id', userId)
  if (rows.length) {
    const { error } = await supabase.from('profile_photos').insert(rows)
    if (error) throw new Error(error.message)
  }

  // Storage cleanup is best-effort; a stray object is not worth failing a save.
  await Promise.all(orphaned.map((path) => removePhoto(path).catch(() => {})))
}

export async function savePrompts(userId, prompts) {
  const rows = prompts
    .map((p, position) => ({
      profile_id: userId,
      position,
      question: p?.q,
      answer: p?.a?.trim(),
    }))
    .filter((r) => r.question && r.answer)

  await supabase.from('profile_prompts').delete().eq('profile_id', userId)
  if (rows.length) {
    const { error } = await supabase.from('profile_prompts').insert(rows)
    if (error) throw new Error(error.message)
  }
}

export async function saveInterests(userId, interests) {
  await supabase.from('profile_interests').delete().eq('profile_id', userId)
  if (interests.length) {
    const { error } = await supabase
      .from('profile_interests')
      .insert(interests.map((interest_id) => ({ profile_id: userId, interest_id })))
    if (error) throw new Error(error.message)
  }
}

/** Partial edits from the profile editor and settings. */
export async function updateProfile(userId, patch) {
  const columns = {}
  const map = {
    firstName: 'first_name',
    gradYear: 'grad_year',
    major: 'major',
    minor: 'minor',
    area: 'area',
    orgs: 'orgs',
    intention: 'intention',
    pronouns: 'pronouns',
    isPaused: 'is_paused',
  }
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] !== undefined) columns[column] = patch[key]
  }

  if (Object.keys(columns).length) {
    const { error } = await supabase.from('profiles').update(columns).eq('id', userId)
    if (error) throw new Error(error.message)
  }

  if (patch.prefs) {
    const { error } = await supabase.from('profile_preferences').upsert(
      {
        profile_id: userId,
        interested_in: prefsToDb(patch.prefs.interestedIn),
        min_age: patch.prefs.ageRange?.[0],
        max_age: patch.prefs.ageRange?.[1],
        intentions: patch.prefs.intentions,
      },
      { onConflict: 'profile_id' }
    )
    if (error) throw new Error(error.message)
  }

  if (patch.photos) await savePhotos(userId, patch.photos)
  if (patch.prompts) await savePrompts(userId, patch.prompts)
  if (patch.interests) await saveInterests(userId, patch.interests)

  return loadMe(userId)
}

/** Pause hides you from the deck without deleting anything. */
export async function setPaused(userId, paused) {
  const { error } = await supabase.from('profiles').update({ is_paused: paused }).eq('id', userId)
  if (error) throw new Error(error.message)
}
