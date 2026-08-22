import { supabase } from '../../lib/supabase'
import { derive, extFor, isHeic, smallPath } from '../../lib/imagePipeline'

/**
 * ── Photos for a business ───────────────────────────────────────────────────
 *
 * Unlike student photos — private bucket, signed URLs, because those are
 * people — a shopfront is meant to be seen, so `partner-media` is public and
 * these return plain URLs. Ownership is a path check: files live under
 * <partner-id>/, and the storage policy calls partner_can(…, 'spot') on that
 * first folder segment.
 *
 * The resizing, the HEIC conversion and the WebP encoding all live in
 * `lib/imagePipeline.js`, shared with student photos. What's specific here is
 * where the files go and how they're addressed.
 *
 * Two files are written per photo — the full one and a small one at
 * `name@sm.webp` — and a card asks for the small one by rewriting the
 * filename. No column, no RPC and no migration had to learn about it, which is
 * why an old photo uploaded before any of this still works: the small variant
 * simply isn't there and `SpotImage` falls back to the full path.
 */

const BUCKET = 'partner-media'
const MAX_BYTES = 25 * 1024 * 1024

/**
 * @param path   the stored path
 * @param size   'full' | 'sm' — 'sm' is what a card or a thumbnail should ask
 *               for, and it costs nothing if the variant doesn't exist because
 *               the caller falls back.
 */
export function publicUrl(path, size = 'full') {
  if (!path) return null
  if (/^(https?:|blob:|data:)/.test(path)) return path
  if (!supabase) return null
  const key = size === 'sm' ? smallPath(path) : path
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
}

/**
 * @param kind 'logo' | 'cover' | 'gallery'
 * @returns the storage path of the full-size file, which is what gets written
 *          to the row
 */
export async function upload(partnerId, file, kind = 'gallery') {
  if (!file) throw new Error('No file chosen.')
  if (!/^image\//.test(file.type) && !isHeic(file)) {
    throw new Error('That needs to be an image.')
  }
  // Generous, because this is the size *before* we shrink it — a raw phone
  // photo is routinely eight megabytes and there's no reason to refuse it.
  if (file.size > MAX_BYTES) throw new Error('Images need to be under 25 MB.')

  const { full, sm, type } = await derive(file, kind === 'logo' ? 'logo' : kind)
  const ext = extFor(type)
  const path = `${partnerId}/${kind}-${Date.now().toString(36)}.${ext}`

  await put(path, full, type)
  // Best effort: a card that can't find the small one falls back to the full
  // one, so failing here costs a little bandwidth and nothing else.
  if (sm) await put(smallPath(path), sm, type).catch(() => {})

  return path
}

async function put(path, body, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    // A year: the filename already carries a timestamp, so a replacement is a
    // new path and never a stale cache.
    cacheControl: '31536000',
    upsert: false,
    contentType,
  })
  if (error) throw new Error(error.message)
}

export async function remove(path) {
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path, smallPath(path)])
}

/**
 * Ask the browser to fetch these now, so they're in cache by the time a card
 * or a sheet renders them. Fire-and-forget; a failure here costs nothing.
 */
export function preload(paths = [], size = 'sm') {
  if (typeof window === 'undefined') return
  for (const p of paths.slice(0, 12)) {
    const url = publicUrl(p, size)
    if (!url) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}
