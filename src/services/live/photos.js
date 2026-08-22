import { supabase } from '../../lib/supabase'
import { derive, extFor, isHeic, smallPath } from '../../lib/imagePipeline'

/**
 * ── Student photos ──────────────────────────────────────────────────────────
 *
 * A private bucket, and nothing renders a bucket path directly — everything
 * goes through a signed URL with a limited life, so a leaked link stops
 * working instead of becoming a permanent public photo of a student. That
 * constraint is not negotiable and none of the speed work below weakens it.
 *
 * Speed, though, was genuinely bad, and for an embarrassing reason: these were
 * uploaded **raw**. A four-thousand-pixel, eight-megabyte photograph off a
 * phone went into the bucket exactly as it came and was then downloaded, in
 * full, to fill a card four hundred pixels wide. HEIC was on the allowed list
 * and never converted, so some of them didn't render at all outside Safari.
 *
 * So now: the same pipeline the business photos use — orientation baked in,
 * HEIC converted, resized, WebP — writing two files per photo. Decks and grids
 * ask for `@sm`; a profile page asks for the full one.
 *
 * The other half is the signing. A signed URL is unique per signature, so
 * re-signing on every render guaranteed a CDN miss every time and put a round
 * trip in front of the first paint. They're now signed for a day and
 * remembered for the session, so the second look at somebody costs nothing.
 */

const BUCKET = 'profile-photos'

//  A day, rather than an hour. The trade is real and small: a link that leaks
//  works for longer. What it buys is that the CDN can actually keep the file,
//  and that moving between pages doesn't re-sign anything. Anything genuinely
//  sensitive here is protected by the bucket being private in the first place,
//  not by the length of this number.
const TTL_SECONDS = 24 * 60 * 60
//  Re-sign a few minutes early rather than handing out a URL that dies mid-scroll.
const REFRESH_MARGIN_MS = 10 * 60 * 1000

const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED = /^image\/(jpeg|png|webp|hei[cf]|avif)$/i

export function validateImage(file) {
  if (!file) return 'No file selected.'
  if (!ALLOWED.test(file.type) && !isHeic(file)) {
    return 'Photos need to be a JPEG, PNG, WebP, or HEIC.'
  }
  // The limit is on what they picked, not on what we store — we're about to
  // make it dramatically smaller, so there's no reason to refuse a big one.
  if (file.size > MAX_BYTES) return 'That photo is over 25MB — try a smaller one.'
  return null
}

/**
 * Storage policy keys off the first path segment, so everything a user owns
 * sits under their own id and nobody can write into anyone else's folder.
 */
export async function uploadPhoto(userId, file, position) {
  const problem = validateImage(file)
  if (problem) throw new Error(problem)

  const { full, sm, type } = await derive(file, 'photo')
  const path = `${userId}/${position}-${Date.now().toString(36)}.${extFor(type)}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, full, {
    // A year. The path carries a timestamp, so a replaced photo is a new path
    // and can never be served from a stale cache.
    cacheControl: '31536000',
    upsert: false,
    contentType: type,
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)

  if (sm) {
    await supabase.storage
      .from(BUCKET)
      .upload(smallPath(path), sm, { cacheControl: '31536000', upsert: false, contentType: type })
      .catch(() => {})
  }

  return path
}

export async function removePhoto(path) {
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path, smallPath(path)])
}

/* ── signing, and remembering that we did ──────────────────────────────────
   path → { url, expires }. Held for the session only; it is a cache of links
   we already minted, never of image data. */

const signed = new Map()
let pending = null

function fresh(path) {
  const hit = signed.get(path)
  return hit && hit.expires - REFRESH_MARGIN_MS > Date.now() ? hit.url : null
}

/**
 * One round trip for a whole profile's worth of photos, and none at all for
 * the ones we already hold a live link to.
 *
 * @param paths  storage paths
 * @param size   'full' | 'sm' — 'sm' signs the small derivative instead
 */
export async function signUrls(paths, size = 'full') {
  const wanted = [...new Set(paths.filter(Boolean).map((p) => (size === 'sm' ? smallPath(p) : p)))]
  if (wanted.length === 0) return {}

  const out = {}
  const missing = []
  for (const p of wanted) {
    const hit = fresh(p)
    if (hit) out[p] = hit
    else missing.push(p)
  }

  if (missing.length) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(missing, TTL_SECONDS)
    if (error) {
      console.warn('[looseleaf] could not sign photo urls:', error.message)
    } else {
      const expires = Date.now() + TTL_SECONDS * 1000
      for (const row of data ?? []) {
        if (!row.signedUrl) continue
        signed.set(row.path, { url: row.signedUrl, expires })
        out[row.path] = row.signedUrl
      }
    }
  }

  // Keyed by the path the caller gave us, whichever variant was signed, so a
  // component never has to know the naming convention.
  if (size === 'sm') {
    const remap = {}
    for (const p of paths.filter(Boolean)) remap[p] = out[smallPath(p)] ?? null
    return remap
  }
  return out
}

/**
 * Warm the browser cache for photos that are about to be on screen — the next
 * few cards in a deck, say. Signing is batched into one request and the images
 * are fetched at low priority, so this never competes with what is visible.
 */
export async function preloadPhotos(paths, size = 'sm') {
  if (typeof window === 'undefined' || !paths?.length) return
  const run = async () => {
    const urls = await signUrls(paths.slice(0, 12), size)
    for (const url of Object.values(urls)) {
      if (!url) continue
      const img = new Image()
      img.decoding = 'async'
      img.fetchPriority = 'low'
      img.src = url
    }
  }
  // Serialised: several cards mounting at once should make one signing
  // request between them, not one each.
  pending = (pending ?? Promise.resolve()).then(run).catch(() => {})
  return pending
}

/** Forget every link. Used on sign-out so nothing outlives the session. */
export function forgetSignedUrls() {
  signed.clear()
}
