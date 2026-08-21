/** Custom icon set — drawn slightly loose so it matches the brand. */

const base = (props) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: props.weight ?? 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  width: props.size ?? 22,
  height: props.size ?? 22,
  className: props.className,
  'aria-hidden': true,
})

export const IconDiscover = (p) => (
  <svg {...base(p)}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V16l-4 5H6.5A1.5 1.5 0 0 1 5 19.5v-15Z" />
    <path d="M19 16h-2.5A1.5 1.5 0 0 0 15 17.5V21" />
    <path d="M9 8h6M9 11.5h6" />
  </svg>
)

export const IconHeart = (p) => (
  <svg {...base(p)} fill={p.filled ? 'currentColor' : 'none'}>
    <path d="M12 20c-5.5-4-8.5-6.8-8.5-10.2A4.3 4.3 0 0 1 7.8 5.5c1.7 0 3.2.9 4.2 2.3 1-1.4 2.5-2.3 4.2-2.3a4.3 4.3 0 0 1 4.3 4.3C20.5 13.2 17.5 16 12 20Z" />
  </svg>
)

export const IconChat = (p) => (
  <svg {...base(p)}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" />
  </svg>
)

export const IconCampus = (p) => (
  <svg {...base(p)}>
    <path d="M12 3.5 21 8l-9 4.5L3 8l9-4.5Z" />
    <path d="M7 10.5V16c0 1.7 2.2 3 5 3s5-1.3 5-3v-5.5" />
    <path d="M21 8v5" />
  </svg>
)

export const IconPerson = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.8 20c.7-3.7 3.6-5.8 7.2-5.8s6.5 2.1 7.2 5.8" />
  </svg>
)

export const IconBell = (p) => (
  <svg {...base(p)}>
    <path d="M6.5 10a5.5 5.5 0 1 1 11 0c0 4 1.5 5.2 1.5 6H5c0-.8 1.5-2 1.5-6Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
)

export const IconSettings = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.9 6.1l-1.4 1.4M7.5 16.5l-1.4 1.4M17.9 17.9l-1.4-1.4M7.5 7.5 6.1 6.1" />
  </svg>
)

export const IconBack = (p) => (
  <svg {...base(p)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export const IconChevron = (p) => (
  <svg {...base(p)}>
    <path d="M9 5l7 7-7 7" />
  </svg>
)

export const IconX = (p) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconCheck = (p) => (
  <svg {...base(p)}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </svg>
)

export const IconPlus = (p) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconSend = (p) => (
  <svg {...base(p)}>
    <path d="M4.5 12 20 4.5 15 20l-3.5-6L4.5 12Z" />
    <path d="M20 4.5 11.5 14" />
  </svg>
)

export const IconMore = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5.5" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="18.5" r="1.3" fill="currentColor" />
  </svg>
)

export const IconVerified = (p) => (
  <svg {...base(p)} fill="none">
    <path
      d="m12 3 2 1.6 2.5-.3 1 2.3 2.2 1.2-.6 2.5.6 2.5-2.2 1.2-1 2.3-2.5-.3L12 21l-2-1.6-2.5.3-1-2.3-2.2-1.2.6-2.5-.6-2.5 2.2-1.2 1-2.3 2.5.3L12 3Z"
      fill="currentColor"
      stroke="none"
    />
    <path d="m8.8 12.2 2.2 2.2 4.2-4.6" stroke="#FFFDF8" strokeWidth="2" />
  </svg>
)

export const IconPin = (p) => (
  <svg {...base(p)}>
    <path d="M12 21s6.5-5.8 6.5-10a6.5 6.5 0 1 0-13 0c0 4.2 6.5 10 6.5 10Z" />
    <circle cx="12" cy="11" r="2.3" />
  </svg>
)

export const IconSpark = (p) => (
  <svg {...base(p)}>
    <path d="M12 3c.9 5.4 2.7 7.2 8.1 8.1-5.4.9-7.2 2.7-8.1 8.1-.9-5.4-2.7-7.2-8.1-8.1C9.3 10.2 11.1 8.4 12 3Z" />
  </svg>
)

export const IconPeople = (p) => (
  <svg {...base(p)}>
    <circle cx="9" cy="9" r="3.2" />
    <path d="M3.5 19c.5-3.1 2.8-4.9 5.5-4.9s5 1.8 5.5 4.9" />
    <path d="M16 6.4a3.2 3.2 0 0 1 0 6.1M17.2 14.4c2.1.5 3.5 2.2 3.9 4.6" />
  </svg>
)

export const IconCap = (p) => (
  <svg {...base(p)}>
    <path d="M12 4 21 8.2 12 12.4 3 8.2 12 4Z" />
    <path d="M6.5 10v4.6c0 1.6 2.5 2.9 5.5 2.9s5.5-1.3 5.5-2.9V10" />
  </svg>
)

export const IconCoffee = (p) => (
  <svg {...base(p)}>
    <path d="M5 9h11v6.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 15.5V9Z" />
    <path d="M16 11h1.8a2.6 2.6 0 0 1 0 5.2H16" />
    <path d="M8.5 5.5c0-1 1.5-1.2 1.5-2.5M12.5 5.5c0-1 1.5-1.2 1.5-2.5" />
  </svg>
)

export const IconFlag = (p) => (
  <svg {...base(p)}>
    <path d="M6 21V4M6 5h11l-2 3.5L17 12H6" />
  </svg>
)

export const IconShield = (p) => (
  <svg {...base(p)}>
    <path d="M12 3.5 19 6v6c0 4.2-3 7.3-7 8.5-4-1.2-7-4.3-7-8.5V6l7-2.5Z" />
    <path d="m9.2 12 2 2 3.6-4" />
  </svg>
)

export const IconMoon = (p) => (
  <svg {...base(p)}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8.2 8.2 0 1 0 20 14.5Z" />
  </svg>
)

export const IconCalendar = (p) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8.5 3.5v4M15.5 3.5v4" />
  </svg>
)

export const IconEye = (p) => (
  <svg {...base(p)}>
    <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
)

export const IconLock = (p) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="3" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </svg>
)

export const IconMail = (p) => (
  <svg {...base(p)}>
    <rect x="3" y="5.5" width="18" height="13" rx="3" />
    <path d="m4 8 7.1 4.8a1.6 1.6 0 0 0 1.8 0L20 8" />
  </svg>
)

export const IconNote = (p) => (
  <svg {...base(p)}>
    <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V15l-4 4.5H6.5A1.5 1.5 0 0 1 5 18V5.5Z" />
    <path d="M19 15h-2.5A1.5 1.5 0 0 0 15 16.5V19.5" />
    <path d="M8.5 9h7M8.5 12h4.5" />
  </svg>
)

export const IconSearch = (p) => (
  <svg {...base(p)}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="M15.4 15.6 20 20.2" />
  </svg>
)

export const IconLink = (p) => (
  <svg {...base(p)}>
    <path d="M10.5 13.5a3.4 3.4 0 0 0 5 .3l2.6-2.6a3.4 3.4 0 0 0-4.8-4.8l-1.5 1.5" />
    <path d="M13.5 10.5a3.4 3.4 0 0 0-5-.3l-2.6 2.6a3.4 3.4 0 0 0 4.8 4.8l1.5-1.5" />
  </svg>
)

/** Scanning a code: a viewfinder with a code inside it. */
export const IconScan = (p) => (
  <svg {...base(p)}>
    <path d="M3.5 8.5v-3a2 2 0 0 1 2-2h3M15.5 3.5h3a2 2 0 0 1 2 2v3M20.5 15.5v3a2 2 0 0 1-2 2h-3M8.5 20.5h-3a2 2 0 0 1-2-2v-3" />
    <rect x="7.5" y="7.5" width="4" height="4" rx="1" />
    <path d="M14.5 7.5h2v2M16.5 14.5v2h-2M9.5 16.5h-2v-2" />
  </svg>
)

/** A redeemed pass: a ticket stub, torn. */
export const IconTicket = (p) => (
  <svg {...base(p)}>
    <path d="M3.5 8.5V7a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 7v1.5a2.5 2.5 0 0 0 0 7V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17v-1.5a2.5 2.5 0 0 0 0-7Z" />
    <path d="M13.5 5.5v2M13.5 11v2M13.5 16.5v2" strokeDasharray="0.1 3.2" />
  </svg>
)

/** Where a place is, on a map. */
export const IconMap = (p) => (
  <svg {...base(p)}>
    <path d="M9 4.5 3.5 7v12.5L9 17l6 2.5 5.5-2.5V4.5L15 7 9 4.5Z" />
    <path d="M9 4.5V17M15 7v12.5" />
  </svg>
)

/** A perk, small enough to sit in the corner of a card. */
export const IconTag = (p) => (
  <svg {...base(p)}>
    <path d="M4 11.2V5.5A1.5 1.5 0 0 1 5.5 4h5.7a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8l-5.2 5.2a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1-.6-1.4Z" />
    <circle cx="8.6" cy="8.6" r="1.4" />
  </svg>
)

/** Directions, i.e. take me there. */
export const IconDirections = (p) => (
  <svg {...base(p)}>
    <path d="m12 2.8 9.2 9.2-9.2 9.2L2.8 12 12 2.8Z" />
    <path d="M9.5 14v-2.2A1.8 1.8 0 0 1 11.3 10h3.4M13 8.2 15.2 10 13 11.8" />
  </svg>
)
