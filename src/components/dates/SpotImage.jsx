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
  // 'retry' falls back to the full-size file; 'gone' means neither exists.
  const [state, setState] = useState('idle')

  useEffect(() => {
    setState('idle')
  }, [path])

  const wanted = state === 'retry' ? 'full' : size
  const url = state === 'gone' ? null : publicUrl(path, wanted)

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

      {url && (
        <img
          key={wanted}
          src={url}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setState('loaded')}
          onError={() => setState(wanted === 'full' ? 'gone' : 'retry')}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            state === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  )
}
