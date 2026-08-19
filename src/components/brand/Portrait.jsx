/**
 * Illustrated stand-ins for photos.
 *
 * Everything here is generated deterministically from a person's id, so the
 * same person always looks the same and no two people look alike. When real
 * photo uploads land (Supabase storage), `ProfilePhoto` falls back to these
 * only when a slot has no image.
 */

export function seedFrom(str = '') {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

const pick = (arr, n) => arr[n % arr.length]

const SKIN = ['#F6D9C4', '#EFC3A4', '#DCA57C', '#B97C51', '#8D5A34', '#65401F', '#F2CBB0', '#A96D42']
const HAIR = ['#2C2118', '#4A3423', '#6B4A2B', '#9A6134', '#C58A46', '#E0B267', '#1C1A1F', '#7A4A3A', '#3E2C4C']
const TOPS = [
  '#FF6468',
  '#7FA9E8',
  '#DF62AD',
  '#5C9A72',
  '#111C38',
  '#F0A868',
  '#8A7CD8',
  '#C9B38B',
  '#4E7FC1',
  '#D9544E',
  '#2E7D74',
  '#8E5B8A',
]
const BACKDROPS = [
  ['#FFF1EF', '#FFE0DA'],
  ['#EAF3FF', '#D8E7FC'],
  ['#FFF6EB', '#FCE9D4'],
  ['#FCE9F4', '#F7D6EA'],
  ['#E6F2EA', '#D2E8DA'],
  ['#F1EEFB', '#E2DCF6'],
  ['#FFF9E6', '#FBEFC9'],
  ['#EDF3F2', '#DCE9E6'],
]

const HAIR_STYLES = ['long', 'bob', 'curls', 'short', 'bun', 'wavy', 'ponytail', 'fade', 'braids']

export function traitsFor(id = '', overrides = {}) {
  // Independent hash per trait — otherwise neighbouring ids share features.
  const h = (salt) => seedFrom(`${id}::${salt}`)
  return {
    skin: pick(SKIN, h('skin')),
    hair: pick(HAIR, h('hair')),
    top: pick(TOPS, h('top')),
    backdrop: pick(BACKDROPS, h('bg')),
    style: pick(HAIR_STYLES, h('style')),
    glasses: h('glasses') % 5 === 0,
    freckles: h('freckles') % 6 === 0,
    earring: h('earring') % 4 === 0,
    smile: h('smile') % 3,
    tilt: (h('tilt') % 5) - 2,
    ...overrides,
  }
}

/* ---------------------------------------------------------------- hair -- */

function HairBack({ style, hair }) {
  switch (style) {
    case 'long':
      return <path d="M26 44c0-16 10-25 24-25s24 9 24 25v30c0 4-3 6-7 5-3-1-4-4-4-8V44H37v32c0 4-1 7-4 8-4 1-7-1-7-5V44Z" fill={hair} />
    case 'wavy':
      return (
        <path
          d="M26 45c0-16 10-26 24-26s24 10 24 26c0 12 3 16 1 22-2 5-8 3-9-2-1-6 1-9 1-14H33c0 5 2 8 1 14-1 5-7 7-9 2-2-6 1-10 1-22Z"
          fill={hair}
        />
      )
    case 'braids':
      return (
        <>
          <path d="M27 45c0-15 10-25 23-25s23 10 23 25v6H27v-6Z" fill={hair} />
          <path d="M27 48c-3 10-3 20-1 28 1 4 6 4 7 0 1-8 0-18-1-28h-5ZM68 48c3 10 3 20 1 28-1 4-6 4-7 0-1-8 0-18 1-28h5Z" fill={hair} />
        </>
      )
    case 'ponytail':
      return (
        <>
          <path d="M28 46c0-15 9-25 22-25s22 10 22 25v4H28v-4Z" fill={hair} />
          <path d="M72 40c8 3 12 12 10 22-1 7-5 12-9 12-3 0-5-3-3-6 4-7 5-16 2-24l-3-4h3Z" fill={hair} />
        </>
      )
    case 'bun':
      return (
        <>
          <circle cx="50" cy="17" r="8" fill={hair} />
          <path d="M29 46c0-14 9-24 21-24s21 10 21 24v3H29v-3Z" fill={hair} />
        </>
      )
    default:
      return null
  }
}

function HairFront({ style, hair }) {
  switch (style) {
    case 'long':
    case 'wavy':
      return <path d="M30 44c0-13 8-21 20-21s20 8 20 21c0 0-5-8-13-8-6 0-8 4-15 4-6 0-8-2-12 4Z" fill={hair} />
    case 'bob':
      return (
        <path
          d="M29 45c0-14 9-24 21-24s21 10 21 24v14c0 3-2 5-5 4-2-1-2-3-2-6V42c-4 4-9 6-14 6s-10-2-14-6v15c0 3 0 5-2 6-3 1-5-1-5-4V45Z"
          fill={hair}
        />
      )
    case 'curls':
      return (
        <g fill={hair}>
          <circle cx="50" cy="22" r="11" />
          <circle cx="35" cy="30" r="9.5" />
          <circle cx="65" cy="30" r="9.5" />
          <circle cx="41" cy="21" r="8.5" />
          <circle cx="59" cy="21" r="8.5" />
          <circle cx="30" cy="41" r="7" />
          <circle cx="70" cy="41" r="7" />
        </g>
      )
    case 'short':
      return <path d="M31 44c0-13 8-22 19-22s19 9 19 22c0-6-6-10-11-10-4 0-6 2-11 2-4 0-9 1-16 8Z" fill={hair} />
    case 'fade':
      return <path d="M32 41c1-11 8-18 18-18s17 7 18 18c-4-6-10-9-18-9s-14 3-18 9Z" fill={hair} />
    case 'bun':
      return <path d="M31 44c0-13 8-22 19-22s19 9 19 22c-3-8-10-11-19-11s-16 3-19 11Z" fill={hair} />
    case 'braids':
    case 'ponytail':
      return <path d="M31 45c0-13 8-22 19-22s19 9 19 22c-4-7-11-10-19-10s-15 3-19 10Z" fill={hair} />
    default:
      return null
  }
}

/* --------------------------------------------------------------- person -- */

function Person({ t, crop = 'bust' }) {
  const shoulderY = crop === 'close' ? 96 : 82
  return (
    <g transform={`rotate(${t.tilt} 50 55)`}>
      {/* shoulders / top */}
      <path
        d="M14 108c0-18 14-26 36-26s36 8 36 26v56H14v-56Z"
        transform={`translate(0 ${shoulderY - 88})`}
        fill={t.top}
      />
      {/* neck */}
      <path d="M43 60h14v12c0 4-14 4-14 0V60Z" fill={t.skin} />
      <path d="M43 66c4 3 10 3 14 0v-6H43v6Z" fill="rgba(0,0,0,0.08)" />

      <HairBack style={t.style} hair={t.hair} />

      {/* ears */}
      <ellipse cx="30" cy="45" rx="3.6" ry="5" fill={t.skin} />
      <ellipse cx="70" cy="45" rx="3.6" ry="5" fill={t.skin} />
      {t.earring && (
        <>
          <circle cx="30" cy="50.5" r="1.7" fill="#F0C674" />
          <circle cx="70" cy="50.5" r="1.7" fill="#F0C674" />
        </>
      )}

      {/* head */}
      <path d="M32 41c0-11 8-19 18-19s18 8 18 19v6c0 11-8 19-18 19s-18-8-18-19v-6Z" fill={t.skin} />

      <HairFront style={t.style} hair={t.hair} />

      {/* face */}
      <g fill="#2A2320">
        <ellipse cx="42.5" cy="45.5" rx="1.75" ry="2.1" />
        <ellipse cx="57.5" cy="45.5" rx="1.75" ry="2.1" />
      </g>
      <path
        d="M38.8 40.6c1.6-1.4 4.2-1.6 6-.6M55.2 40c1.8-1 4.4-.8 6 .6"
        stroke="#2A2320"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity=".65"
      />
      {/* blush */}
      <ellipse cx="38" cy="52" rx="4" ry="2.6" fill="#FF6468" opacity=".16" />
      <ellipse cx="62" cy="52" rx="4" ry="2.6" fill="#FF6468" opacity=".16" />
      {/* mouth */}
      {t.smile === 0 && (
        <path d="M45 55.5c1.8 2.2 7.2 2.2 10 0" stroke="#B3564F" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      )}
      {t.smile === 1 && (
        <path d="M45.5 55c1.3 3.4 7.7 3.4 9 0-3 1-6 1-9 0Z" fill="#B3564F" opacity=".85" />
      )}
      {t.smile === 2 && (
        <path d="M46 55.8c1.4 1.5 6.6 1.5 8 0" stroke="#B3564F" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      )}
      {t.freckles && (
        <g fill="#8D5A34" opacity=".38">
          <circle cx="41" cy="50" r=".7" />
          <circle cx="44" cy="52" r=".7" />
          <circle cx="56" cy="52" r=".7" />
          <circle cx="59" cy="50" r=".7" />
        </g>
      )}
      {t.glasses && (
        <g stroke="#3C465F" strokeWidth="1.5" fill="none" opacity=".9">
          <rect x="36.5" y="41.5" width="11" height="8.5" rx="3.4" />
          <rect x="52.5" y="41.5" width="11" height="8.5" rx="3.4" />
          <path d="M47.5 45.5h5M36.5 45h-4M63.5 45h4" strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}

/* --------------------------------------------------------------- scenes -- */
/* Non-portrait photo slots: "show something you love", "show your life". */

const SCENES = {
  coffee: (c) => (
    <g>
      <rect x="20" y="72" width="60" height="4" rx="2" fill={c.ink} opacity=".18" />
      <path d="M32 40h30v22a12 12 0 0 1-12 12h-6a12 12 0 0 1-12-12V40Z" fill="#FFFDF8" stroke={c.ink} strokeWidth="2.2" />
      <path d="M62 46h6a8 8 0 0 1 0 16h-6" stroke={c.ink} strokeWidth="2.2" fill="none" />
      <path d="M32 48h30" stroke="#C58A46" strokeWidth="5" opacity=".55" />
      <path d="M41 32c0-4 5-4 5-8M53 32c0-4 5-4 5-8" stroke="#FF6468" strokeWidth="2" strokeLinecap="round" opacity=".6" />
      <circle cx="72" cy="26" r="5" fill="#FF6468" opacity=".2" />
    </g>
  ),
  mountains: (c) => (
    <g>
      <circle cx="72" cy="26" r="9" fill="#FFD9A8" />
      <path d="M0 76 26 40l18 22 12-14 24 28H0Z" fill={c.ink} opacity=".82" />
      <path d="M26 40l9 11H17l9-11Z" fill="#FFFDF8" opacity=".9" />
      <path d="M0 76h100v24H0z" fill="#5C9A72" opacity=".55" />
      <path d="M14 84c6-4 12-4 18 0M62 88c8-5 16-5 24 0" stroke="#FFFDF8" strokeWidth="1.8" strokeLinecap="round" opacity=".5" fill="none" />
    </g>
  ),
  concert: (c) => (
    <g>
      <rect x="0" y="62" width="100" height="38" fill={c.ink} opacity=".8" />
      <g fill={c.ink} opacity=".95">
        <circle cx="18" cy="70" r="6" /><circle cx="34" cy="74" r="6" /><circle cx="50" cy="69" r="6" />
        <circle cx="66" cy="74" r="6" /><circle cx="82" cy="70" r="6" />
      </g>
      <path d="M18 62c0-6 4-10 4-16M34 66c0-8 6-10 6-18M66 66c0-8-6-10-6-18M82 62c0-6-4-10-4-16" stroke={c.ink} strokeWidth="2.4" strokeLinecap="round" opacity=".9" fill="none" />
      <circle cx="50" cy="30" r="14" fill="#FF6468" opacity=".35" />
      <circle cx="50" cy="30" r="7" fill="#FFD9A8" opacity=".8" />
      <path d="M20 24l6 10M80 24l-6 10" stroke="#DF62AD" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
    </g>
  ),
  dog: () => (
    <g>
      <rect x="0" y="74" width="100" height="26" fill="#5C9A72" opacity=".4" />
      <ellipse cx="52" cy="66" rx="24" ry="14" fill="#C58A46" />
      <circle cx="30" cy="52" r="14" fill="#C58A46" />
      <path d="M20 42c-5-4-8 2-6 8s6 6 8 2l-2-10ZM40 42c5-4 8 2 6 8s-6 6-8 2l2-10Z" fill="#9A6134" />
      <circle cx="26" cy="50" r="1.8" fill="#2A2320" />
      <circle cx="35" cy="50" r="1.8" fill="#2A2320" />
      <ellipse cx="30" cy="57" rx="3.4" ry="2.4" fill="#2A2320" />
      <path d="M74 60c6-6 10-2 8 6" stroke="#C58A46" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M36 78v8M50 80v6M64 78v8" stroke="#C58A46" strokeWidth="6" strokeLinecap="round" />
    </g>
  ),
  bike: (c) => (
    <g>
      <circle cx="26" cy="66" r="16" fill="none" stroke={c.ink} strokeWidth="3" />
      <circle cx="74" cy="66" r="16" fill="none" stroke={c.ink} strokeWidth="3" />
      <path d="M26 66l16-22h18l14 22M42 44l10 22M60 44h10" stroke="#FF6468" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M36 40h10" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
      <path d="M0 86h100" stroke={c.ink} strokeWidth="2" opacity=".2" />
    </g>
  ),
  books: () => (
    <g>
      <rect x="26" y="30" width="48" height="10" rx="2.5" fill="#FF6468" />
      <rect x="22" y="42" width="56" height="10" rx="2.5" fill="#A9C8F5" />
      <rect x="28" y="54" width="44" height="10" rx="2.5" fill="#DF62AD" />
      <rect x="24" y="66" width="52" height="10" rx="2.5" fill="#5C9A72" />
      <path d="M32 35h12M28 47h14M34 59h10M30 71h12" stroke="#FFFDF8" strokeWidth="2" strokeLinecap="round" opacity=".8" />
    </g>
  ),
  camera: () => (
    <g>
      <rect x="20" y="38" width="60" height="40" rx="8" fill={c.ink} />
      <rect x="38" y="30" width="24" height="10" rx="4" fill={c.ink} />
      <circle cx="50" cy="58" r="15" fill="#FFFDF8" opacity=".16" />
      <circle cx="50" cy="58" r="11" fill="#A9C8F5" />
      <circle cx="50" cy="58" r="5" fill="#FFFDF8" opacity=".5" />
      <circle cx="70" cy="46" r="3" fill="#FF6468" />
    </g>
  ),
  lake: (c) => (
    <g>
      <circle cx="26" cy="28" r="10" fill="#FFD9A8" />
      <path d="M0 60h100v40H0z" fill="#A9C8F5" opacity=".75" />
      <path d="M0 60h100" stroke={c.ink} strokeWidth="1.5" opacity=".2" />
      <path d="M10 70h22M40 78h30M14 88h26M62 68h24" stroke="#FFFDF8" strokeWidth="2.4" strokeLinecap="round" opacity=".65" />
      <path d="M56 52l14-18 14 18H56Z" fill="#5C9A72" opacity=".7" />
    </g>
  ),
  stadium: (c) => (
    <g>
      <path d="M0 58h100v42H0z" fill="#5C9A72" opacity=".55" />
      <path d="M0 58h100" stroke="#FFFDF8" strokeWidth="2" opacity=".7" />
      <path d="M20 100V58M50 100V58M80 100V58" stroke="#FFFDF8" strokeWidth="1.6" opacity=".45" />
      <rect x="8" y="30" width="84" height="26" rx="6" fill={c.ink} opacity=".8" />
      <g fill="#FFD9A8" opacity=".85">
        <circle cx="22" cy="42" r="3" /><circle cx="34" cy="40" r="3" /><circle cx="46" cy="43" r="3" />
        <circle cx="58" cy="40" r="3" /><circle cx="70" cy="43" r="3" /><circle cx="82" cy="41" r="3" />
      </g>
    </g>
  ),
  plants: () => (
    <g>
      <path d="M36 70h28l-4 24H40l-4-24Z" fill="#C58A46" />
      <path d="M50 70V40" stroke="#5C9A72" strokeWidth="3" strokeLinecap="round" />
      <path d="M50 52c-10-2-14-10-12-18 8-1 14 6 12 18ZM50 46c8-3 12-10 10-17-7 0-13 6-10 17ZM50 64c-9 0-14-5-14-12 7-2 14 3 14 12Z" fill="#5C9A72" opacity=".85" />
      <path d="M34 76h32" stroke="#9A6134" strokeWidth="2" opacity=".6" />
    </g>
  ),
  guitar: () => (
    <g>
      <ellipse cx="44" cy="66" rx="22" ry="24" fill="#C58A46" />
      <ellipse cx="44" cy="60" rx="16" ry="15" fill="#C58A46" />
      <circle cx="44" cy="64" r="7" fill={c.ink} opacity=".8" />
      <rect x="58" y="24" width="8" height="42" rx="3" transform="rotate(18 62 45)" fill="#6B4A2B" />
      <rect x="66" y="16" width="13" height="12" rx="3" transform="rotate(18 72 22)" fill="#4A3423" />
      <path d="M40 40l14-14M46 42l14-14" stroke="#FFFDF8" strokeWidth="1" opacity=".5" />
    </g>
  ),
  skis: () => (
    <g>
      <path d="M0 74h100v26H0z" fill="#FFFDF8" opacity=".9" />
      <path d="M0 74c18-8 34-8 52 0s30 6 48-2" stroke="#A9C8F5" strokeWidth="2" fill="none" opacity=".8" />
      <path d="M34 76 44 26c1-4 6-4 6 0l4 50" stroke="#FF6468" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M52 76 62 26c1-4 6-4 6 0l4 50" stroke="#111C38" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".8" />
      <circle cx="20" cy="24" r="8" fill="#FFD9A8" opacity=".8" />
    </g>
  ),
}

export const SCENE_KEYS = Object.keys(SCENES)

/* ------------------------------------------------------------- exported -- */

/**
 * @param {string} id      stable person id
 * @param {'portrait'|string} scene  'portrait' or a SCENE_KEYS value
 */
export default function Portrait({
  id = 'x',
  scene = 'portrait',
  className = '',
  rounded = 'rounded-card',
  crop = 'bust',
}) {
  const t = traitsFor(id)
  const gid = `g-${seedFrom(id + scene).toString(36)}`
  const [c1, c2] = t.backdrop
  const isScene = scene !== 'portrait' && SCENES[scene]

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full ${rounded} ${className}`}
      role="img"
      aria-label={isScene ? 'Illustrated photo' : 'Illustrated portrait'}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gid})`} />
      {isScene ? (
        SCENES[scene]({ ink: '#111C38' })
      ) : (
        <g transform={crop === 'close' ? undefined : 'translate(16 3) scale(0.68)'}>
          <circle cx="50" cy="44" r="30" fill="#FFFDF8" opacity=".35" />
          <Person t={t} crop={crop} />
        </g>
      )}
    </svg>
  )
}

/** Small circular avatar. */
export function PersonAvatar({ id = 'x', size = 40, ring = false, className = '' }) {
  return (
    <span
      className={`inline-block shrink-0 overflow-hidden rounded-full bg-cream ${
        ring ? 'ring-2 ring-white' : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      <Portrait id={id} rounded="rounded-full" crop="close" />
    </span>
  )
}
