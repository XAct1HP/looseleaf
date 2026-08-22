/**
 * ── Getting a photograph ready to be looked at ──────────────────────────────
 *
 * One pipeline, shared by student photos and business photos, because the
 * problem is identical and only the bucket differs.
 *
 * The whole argument for doing this in the browser rather than paying a CDN to
 * do it later: a phone photograph is routinely eight megabytes at 4032px, and
 * the place it is going is a card 400px wide. Resizing once, at the moment
 * somebody picks the file, means every viewer afterwards downloads about a
 * hundredth as much. No amount of clever fetching at read time comes close,
 * and this costs nothing per image forever.
 *
 * Three other things fall out of it:
 *
 *   · **HEIC.** iPhones hand one over whenever a photo is picked from Files
 *     rather than Photos, and no browser except Safari can display it. Left
 *     alone it is a broken image for most of the people who see it.
 *   · **EXIF rotation.** A photo that looked upright in Photos arrives on its
 *     side, because an `<img>` in a grid does not honour the orientation flag.
 *     Decoding through `createImageBitmap` bakes it into the pixels.
 *   · **WebP.** 25–35% smaller than JPEG at the same quality, and supported
 *     everywhere that matters. We fall back to JPEG if the browser can't
 *     encode it, so the output format follows what actually worked rather than
 *     what we hoped for.
 *
 * Every photo is written twice — a `full` and a `sm` — because a card and a
 * profile page want genuinely different files, and one decode can produce
 * both. The small one is derived by filename convention (`name@sm.webp`) so
 * neither the database nor any RPC has to learn a second column.
 */

/** The suffix that marks a derivative. Used to build a path and to read one. */
export const SMALL_SUFFIX = '@sm'

/** Longest edge and quality per slot. `sm` is what grids and decks fetch. */
export const SIZES = {
  // Student photos. A profile card is at most ~520px wide; 1280 covers it at
  // 2× on a retina phone with room to spare.
  photo: { full: { max: 1280, q: 0.82 }, sm: { max: 480, q: 0.72 } },
  // A Date Spot cover: full-bleed in a sheet at ~512px, a card at ~400px.
  cover: { full: { max: 1280, q: 0.82 }, sm: { max: 640, q: 0.74 } },
  gallery: { full: { max: 1100, q: 0.8 }, sm: { max: 400, q: 0.72 } },
  // A logo is never a wallpaper, and is small enough that one size is plenty.
  logo: { full: { max: 512, q: 0.9 } },
}

export const isHeic = (file) =>
  /image\/hei[cf]/i.test(file?.type ?? '') || /\.(heic|heif)$/i.test(file?.name || '')

/**
 * The libheif decoder is a WebAssembly build and is not small, so it is
 * imported at the moment somebody actually picks a HEIC — a normal JPEG upload
 * never downloads a byte of it.
 */
async function fromHeic(file) {
  const { heicTo } = await import('heic-to')
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 })
  return new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', {
    type: 'image/jpeg',
  })
}

/**
 * A blob URL the browser can definitely display, for showing somebody the
 * photo they just picked before it has gone anywhere.
 *
 * For a JPEG or PNG this is just an object URL and costs nothing. For a HEIC
 * it is a conversion first, because `URL.createObjectURL(heicFile)` in an
 * `<img>` is a broken-image icon in every browser except Safari — which is
 * exactly what an iPhone photo picked from Files used to produce, on the very
 * screen that says "here's how you look".
 *
 * Caller owns the URL and must revoke it.
 */
export async function displayableUrl(file) {
  if (!file) return null
  if (!isHeic(file)) return URL.createObjectURL(file)
  return URL.createObjectURL(await fromHeic(file))
}

/** Decoded with orientation applied, not ignored. */
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

let webpOk = null

/** Asked once per session: can this browser encode WebP from a canvas? */
async function canEncodeWebp() {
  if (webpOk !== null) return webpOk
  try {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.8))
    webpOk = Boolean(blob && blob.type === 'image/webp')
  } catch {
    webpOk = false
  }
  return webpOk
}

async function draw(bitmap, { max, q }, { alpha }) {
  const w = bitmap.width
  const h = bitmap.height
  if (!w || !h) throw new Error('That image couldn’t be read.')

  const scale = Math.min(1, max / Math.max(w, h))
  const outW = Math.max(1, Math.round(w * scale))
  const outH = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!alpha) {
    // Flatten onto the paper colour, or a transparent PNG comes out of a JPEG
    // encoder with a black background.
    ctx.fillStyle = '#FFFDF8'
    ctx.fillRect(0, 0, outW, outH)
  }
  ctx.drawImage(bitmap, 0, 0, outW, outH)

  // Alpha rules out JPEG, so those stay PNG; everything else prefers WebP and
  // settles for JPEG. The type that actually came back decides the extension,
  // so we never label a JPEG `.webp`.
  const wanted = alpha ? 'image/png' : (await canEncodeWebp()) ? 'image/webp' : 'image/jpeg'
  let blob = await new Promise((r) => canvas.toBlob(r, wanted, alpha ? undefined : q))
  if (!blob) blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q))
  if (!blob) throw new Error('That image couldn’t be processed.')

  return blob
}

export function extFor(type) {
  if (/webp/.test(type)) return 'webp'
  if (/png/.test(type)) return 'png'
  if (/svg/.test(type)) return 'svg'
  return 'jpg'
}

/** `a/b/cover-x.webp` → `a/b/cover-x@sm.webp`. Pure string work, no I/O. */
export function smallPath(path) {
  if (!path) return null
  return path.replace(/(\.[^./]+)$/, `${SMALL_SUFFIX}$1`)
}

export function isSmallPath(path) {
  return Boolean(path) && path.includes(`${SMALL_SUFFIX}.`)
}

/**
 * One decode, every size that slot asks for.
 *
 * @param file  what the person picked
 * @param kind  a key of SIZES
 * @returns     `{ full: Blob, sm?: Blob, type: string }`
 */
export async function derive(file, kind = 'photo') {
  if (!file) throw new Error('No file chosen.')
  if (!/^image\//.test(file.type) && !isHeic(file)) {
    throw new Error('That needs to be an image.')
  }
  // An SVG is already vector; resizing one is nonsense.
  if (/svg/i.test(file.type)) return { full: file, type: file.type }

  const source = isHeic(file) ? await fromHeic(file) : file
  const spec = SIZES[kind] ?? SIZES.photo
  const alpha = kind === 'logo' && /png|webp/i.test(source.type)

  const bitmap = await decode(source)
  try {
    const full = await draw(bitmap, spec.full, { alpha })
    const sm = spec.sm ? await draw(bitmap, spec.sm, { alpha }) : null
    return { full, sm, type: full.type }
  } finally {
    bitmap.close?.()
  }
}
