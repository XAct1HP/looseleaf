import { useEffect, useState } from 'react'
import { publicUrl } from '../../services/live/partnerMedia'

/**
 * ── A photo of a place, with nothing to watch while it arrives ──────────────
 *
 * Four things stop a Date Spot list from popping and reflowing as it loads:
 *
 *   The box exists before the photo does. The aspect ratio comes from the
 *   caller, so the layout is final on first paint and nothing moves when the
 *   bytes land.
 *
 *   Something is already in the box. A tinted paper pattern, derived from the
 *   place's own id so it's stable across renders and different between
 *   neighbours. It reads as a card that hasn't loaded rather than as a hole.
 *
 *   The first few load eagerly. `priority` marks the cards above the fold; the
 *   rest are lazy, so a long list doesn't fight itself for bandwidth on campus
 *   wifi.
 *
 *   And a card asks for a card-sized file. `size="sm"` fetches the small
 *   derivative written at upload — a few tens of kilobytes rather than a few
 *   hundred. Photos uploaded before that existed have no small variant, so a
 *   404 quietly falls back to the full path instead of leaving a hole; a place
 *   with no photo at all keeps the pattern permanently, which is a great deal
 *   better than a broken-image icon.
 *
 * ── Which file we are asking for is not the same fact as how it went ────────
 *
 * These were one piece of state once, and the result was an infinite loop.
 * `wanted` was derived as `state === 'retry' ? 'full' : size`, so a photo with
 * no small variant went: ask for @sm → 404 → 'retry' → ask for the full file →
 * it loads → 'loaded' → which is not 'retry', so `wanted` flipped back to @sm,
 * the `key` changed, and the whole thing started again. Forever. Every legacy
 * photo re-requested a 404 on a loop and showed as a blank card, because the
 * opacity that reveals it only holds while the state reads exactly 'loaded'.
 *
 * So they are two pieces of state now, and `src` only ever moves forward:
 * sm → full → gone. Nothing that happens after a file loads can send it back
 * to one that didn't.
 *
 * ── The sheet's cover starts from the card's cover ──────────────────────────
 *
 * Asking for `full` puts a 1280px file in front of somebody who, on a phone,
 * has about 390px to look at it in — and they wait for all of it before they
 * see anything. But the small one is very often already in the browser's
 * cache, because a card two taps ago rendered exactly it. So `full` paints the
 * small file underneath first, which on that path is instant, and swaps in the
 * sharp one when it arrives. If the small variant doesn't exist, the underlay
 * simply never appears and nothing else changes.
 */

/** Deterministic hue per spot, kept inside Looseleaf's warm range. */
function tintFor(seed = '') {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360
  const hue = 20 + (h % 45) // cream through to soft coral
  return `hsl(${hue} 46% 92%)`
}

export default function SpotImage({
  path,
  alt = '',
  className = '',
  seed = '',
  priority = false,
  rounded = '',
  size = 'sm',
}) {
  // Which file we are asking for. Moves in one direction only — the size we
  // wanted, then the full file if that one isn't there, then nothing.
  const [src, setSrc] = useState(size)
  // And whether that file has actually arrived, which is a separate question.
  const [loaded, setLoaded] = useState(false)
  // The stand-in under a full-size cover, dropped if there isn't one.
  const [underlay, setUnderlay] = useState(true)

  useEffect(() => {
    setSrc(size)
    setLoaded(false)
    setUnderlay(true)
  }, [path, size])

  const url = src === 'gone' ? null : publicUrl(path, src)
  const smallUrl = size === 'full' && underlay && src !== 'gone' ? publicUrl(path, 'sm') : null

  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{ backgroundColor: tintFor(seed || path || alt) }}
    >
      {/* The paper motif, so an empty box still looks like Looseleaf. */}
      <span
        className="paper-lines-soft pointer-events-none absolute inset-0 opacity-70"
        aria-hidden="true"
      />

      {/* The low-resolution stand-in. No fetchPriority and no lazy flag: it is
          either already in cache, in which case this costs a paint, or it
          isn't, in which case it loses the race to the real one and is
          discarded when `loaded` hides it. */}
      {smallUrl && !loaded && (
        <img
          src={smallUrl}
          alt=""
          aria-hidden="true"
          decoding="async"
          onError={() => setUnderlay(false)}
          className="absolute inset-0 h-full w-full scale-[1.02] object-cover blur-[2px]"
        />
      )}

      {url && (
        <img
          key={src}
          src={url}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setLoaded(true)}
          onError={() => setSrc((s) => (s === 'full' ? 'gone' : 'full'))}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  )
}
