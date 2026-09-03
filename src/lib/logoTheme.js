/**
 * ── A theme taken from the host's own logo ──────────────────────────────────
 *
 * A club uploads their logo; the event takes its colours from it. The whole
 * difficulty is that a logo is designed to look good *as a logo*, not to be
 * legible as text on paper — pale yellow, mid grey, neon green are all fine in
 * a mark and unreadable as a round timer in a dim room.
 *
 * So this does not use the logo's colours. It uses the logo's **hues**, and
 * then moves lightness until each one actually passes a contrast check:
 *
 *   · `ink`   — text on the paper background. Fitted to ≥ 4.5:1.
 *   · `plate` — a solid behind white text (buttons). Fitted to ≥ 4.5:1 vs white.
 *   · `wash`  — a tint behind the ink. Kept very light, and only ever a
 *               background.
 *
 * The result keeps a club recognisably in their own colour while removing the
 * failure mode where a host picks a theme that a stranger cannot read. That is
 * the same reason the fixed `ACCENTS` palette exists and why there is still no
 * free hex field: the host chooses a colour, not a contrast ratio.
 */

const PAPER = [255, 253, 248] // #FFFDF8
const WHITE = [255, 255, 255]

/* ── colour maths ─────────────────────────────────────────────────────────
 * Straight out of WCAG. Kept here rather than pulled in so there is exactly
 * one implementation and it can be read in one sitting.
 */

function srgbToLin(c) {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b)
}

export function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

export function fromHex(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return null
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function rgbToHsl([r, g, b]) {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6
  else if (max === G) h = ((B - R) / d + 2) / 6
  else h = ((R - G) / d + 4) / 6
  return [h, s, l]
}

function hslToRgb([h, s, l]) {
  if (s === 0) {
    const v = l * 255
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t) => {
    let T = t
    if (T < 0) T += 1
    if (T > 1) T -= 1
    if (T < 1 / 6) return p + (q - p) * 6 * T
    if (T < 1 / 2) return q
    if (T < 2 / 3) return p + (q - p) * (2 / 3 - T) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

/**
 * Keep the hue, move the lightness until the contrast passes.
 *
 * Walks in small steps rather than solving, because the relationship between
 * HSL lightness and relative luminance is not linear and a closed form here
 * would be harder to trust than a loop that checks the actual ratio.
 */
function fit(rgb, against, target, direction) {
  let [h, s, l] = rgbToHsl(rgb)

  //  A washed-out colour makes a miserable theme — it reads as "we failed to
  //  pick a colour" rather than as a choice — so it gets nudged up. But a
  //  genuinely *grey* logo stays grey: forcing saturation onto a neutral seed
  //  invents a hue nobody chose, and a grey mark used to come out pink,
  //  because HSL parks the hue of every grey at 0°.
  if (s >= 0.08) s = Math.max(s, 0.25)

  for (let i = 0; i < 60; i += 1) {
    const candidate = hslToRgb([h, s, l])
    if (contrast(candidate, against) >= target) return candidate
    l += direction * 0.015
    if (l < 0.02 || l > 0.98) break
  }
  //  Nothing in this hue can pass — fall back to the darkest/lightest it goes.
  return hslToRgb([h, s, Math.min(0.98, Math.max(0.02, l))])
}

/** A very light tint of the same hue, for backgrounds only. */
function washOf(rgb) {
  const [h, s] = rgbToHsl(rgb)
  return hslToRgb([h, Math.min(s, 0.55), 0.945])
}

/**
 * Build a usable theme from one seed colour.
 *
 * `ink` darkens until it is readable on paper; `plate` darkens until white
 * text sits on it safely. They often land on the same value, which is fine —
 * they are allowed to be the same colour, they are just not allowed to be
 * illegible.
 */
export function themeFromSeed(seed, second) {
  //  The wash first, and then the ink fitted **against the wash** rather than
  //  against the paper.
  //
  //  That ordering is the whole correctness of this function. Ink is used as
  //  text on the wash — the badge, the lobby pill, the big board on the run
  //  console — and the wash is darker than the paper, so it is the tighter of
  //  the two constraints. Fitting against paper passed a check while leaving
  //  the place the colour is actually used at 4.0:1. Passing the tighter one
  //  passes the looser one by construction.
  const wash = washOf(seed)
  const ink = fit(seed, wash, 4.5, -1)
  const plate = fit(seed, WHITE, 4.5, -1)
  const accent2 = second ? fit(second, washOf(second), 4.5, -1) : null

  return {
    ink: toHex(ink),
    plate: toHex(plate),
    wash: toHex(wash),
    accent2: accent2 ? toHex(accent2) : null,
    seed: toHex(seed),
  }
}

/* ── pulling colours out of an image ──────────────────────────────────────
 *
 * Deliberately crude: downscale hard, bucket by coarse hue, take the two
 * heaviest buckets. A proper k-means would be more accurate and completely
 * unnecessary — the input is a club logo with two or three flat colours in it,
 * and the output only supplies a hue that is about to be re-fitted anyway.
 */
export async function paletteFromImage(source) {
  const bitmap = await loadBitmap(source)
  if (!bitmap) return null

  try {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    const buckets = new Map()

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]
      if (a < 200) continue // transparent padding around a mark

      const rgb = [data[i], data[i + 1], data[i + 2]]
      const [h, s, l] = rgbToHsl(rgb)

      //  Skip the paper and the ink. A logo is mostly white space and black
      //  outlines, and neither says anything about the club's colour.
      if (l > 0.93 || l < 0.07) continue
      if (s < 0.12) continue

      const key = Math.round(h * 24) // 15° buckets
      const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, bl: 0 }
      b.n += 1
      b.r += rgb[0]
      b.g += rgb[1]
      b.bl += rgb[2]
      buckets.set(key, b)
    }

    const ranked = [...buckets.values()]
      .filter((b) => b.n >= 4)
      .sort((x, y) => y.n - x.n)
      .map((b) => [b.r / b.n, b.g / b.n, b.bl / b.n])

    if (ranked.length === 0) return null
    return { primary: ranked[0], secondary: ranked[1] ?? null }
  } finally {
    bitmap.close?.()
  }
}

async function loadBitmap(source) {
  try {
    if (typeof source === 'string') {
      const res = await fetch(source, { mode: 'cors' })
      const blob = await res.blob()
      return await createImageBitmap(blob)
    }
    return await createImageBitmap(source)
  } catch {
    //  A cross-origin logo with no CORS header taints the canvas and there is
    //  nothing to be done about it. The host keeps whichever theme they had.
    return null
  }
}

/** The whole job, in one call: a file in, a checked theme out. */
export async function themeFromLogo(source) {
  const palette = await paletteFromImage(source)
  if (!palette) return null
  return themeFromSeed(palette.primary, palette.secondary)
}
