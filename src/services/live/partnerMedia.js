import { supabase } from '../../lib/supabase'

/**
 * ── Photos for a business ───────────────────────────────────────────────────
 *
 * Unlike student photos — private bucket, signed URLs, because those are
 * people — a shopfront is meant to be seen, so `partner-media` is public and
 * these return plain URLs. Ownership is a path check: files live under
 * <partner-id>/, and the storage policy calls partner_can(…, 'spot') on that
 * first folder segment.
 *
 * Everything is re-encoded before it leaves the browser, and that is the whole
 * reason Date Spot cards appear instantly. A restaurant owner photographs
 * their room on a phone and uploads four megabytes at 4032px; without this,
 * every student on campus downloads that, on campus wifi, to look at a card
 * 320px wide. Resizing once at upload is worth more than any amount of
 * cleverness at read time.
 *
 * It also quietly fixes two other things:
 *   · iPhone HEIC files, which no browser but Safari can display.
 *   · EXIF rotation, which is why a photo that looked upright in Photos
 *     arrives on its side.
 */

const BUCKET = 'partner-media'
const MAX_BYTES = 25 * 1024 * 1024

/** Longest edge, per slot. A logo never needs to be a wallpaper. */
const TARGET = {
  logo: 512,
  cover: 1800,
  gallery: 1400,
}

export function publicUrl(path) {
  if (!path) return null
  if (/^(https?:|blob:|data:)/.test(path)) return path
  if (!supabase) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

const isHeic = (file) =>
  /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '')

/**
 * iPhones hand over HEIC when the photo is picked from Files rather than from
 * Photos. Chrome and Firefox can't decode it at all, so it has to be converted
 * here or it becomes a broken image for everyone.
 *
 * The decoder is a WebAssembly build of libheif and is not small, so it is
 * imported only at the moment somebody actually picks one — a normal JPEG
 * upload never downloads a byte of it.
 */
async function fromHeic(file) {
  const { heicTo } = await import('heic-to')
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.86 })
  return new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', {
    type: 'image/jpeg',
  })
}

/** Decoding through ImageBitmap so EXIF rotation is applied, not ignored. */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* Safari has been fussy about the options bag; fall through. */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('That image couldn’t be read.'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Down to a sane size, and out as JPEG — except a logo with transparency,
 * which stays PNG because a coffee shop's mark on a white rectangle looks
 * broken on a cream card.
 */
async function reencode(file, kind) {
  const max = TARGET[kind] ?? TARGET.gallery
  const keepAlpha = kind === 'logo' && /png|webp|svg/i.test(file.type)

  if (/svg/i.test(file.type)) return file // already vector; resizing is nonsense

  const bitmap = await decode(file)
  const w = bitmap.width
  const h = bitmap.height
  if (!w || !h) throw new Error('That image couldn’t be read.')

  const scale = Math.min(1, max / Math.max(w, h))
  const outW = Math.round(w * scale)
  const outH = Math.round(h * scale)

  // Already small and already a web format? Leave it alone.
  if (scale === 1 && /jpe?g|png|webp/i.test(file.type) && file.size < 600 * 1024) {
    bitmap.close?.()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!keepAlpha) {
    // Flatten onto the paper colour so a transparent PNG doesn't come out
    // with a black background once it's JPEG.
    ctx.fillStyle = '#FFFDF8'
    ctx.fillRect(0, 0, outW, outH)
  }
  ctx.drawImage(bitmap, 0, 0, outW, outH)
  bitmap.close?.()

  const type = keepAlpha ? 'image/png' : 'image/jpeg'
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, type, keepAlpha ? undefined : 0.82)
  )
  if (!blob) throw new Error('That image couldn’t be processed.')

  const ext = keepAlpha ? 'png' : 'jpg'
  return new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.' + ext, { type })
}

/**
 * @param kind 'logo' | 'cover' | 'gallery'
 * @returns the storage path, which is what gets written to the row
 */
export async function upload(partnerId, file, kind = 'gallery') {
  if (!file) throw new Error('No file chosen.')
  if (!/^image\//.test(file.type) && !isHeic(file)) {
    throw new Error('That needs to be an image.')
  }
  // Generous, because this is the size *before* we shrink it — a raw phone
  // photo is routinely eight megabytes and there's no reason to refuse it.
  if (file.size > MAX_BYTES) throw new Error('Images need to be under 25 MB.')

  const ready = await reencode(isHeic(file) ? await fromHeic(file) : file, kind)

  const ext = ready.type === 'image/png' ? 'png' : ready.type === 'image/svg+xml' ? 'svg' : 'jpg'
  const path = `${partnerId}/${kind}-${Date.now().toString(36)}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, ready, {
    // A year: the filename already carries a timestamp, so a replacement is a
    // new path and never a stale cache.
    cacheControl: '31536000',
    upsert: false,
    contentType: ready.type,
  })
  if (error) throw new Error(error.message)
  return path
}

export async function remove(path) {
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}

/**
 * Ask the browser to fetch these now, so they're in cache by the time a card
 * or a sheet renders them. Fire-and-forget; a failure here costs nothing.
 */
export function preload(paths = []) {
  if (typeof window === 'undefined') return
  for (const p of paths.slice(0, 12)) {
    const url = publicUrl(p)
    if (!url) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}
