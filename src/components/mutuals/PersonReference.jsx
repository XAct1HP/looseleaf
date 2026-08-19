import { useState } from 'react'
import Portrait from '../brand/Portrait'
import Sheet from '../ui/Sheet'

/**
 * A reference card — the only way one student is ever shown to another
 * outside of Discover.
 *
 * Four fields: photo, first name, major, year. Not a profile, not a link to
 * one. It exists to answer one question — "is this the Ben I mean?" — and it
 * is deliberately useless for anything else. The database agrees: the RPCs
 * that feed this component return these four columns and no others.
 */

function Frame({ person, size = 'md', className = '' }) {
  const dims = { sm: 'h-[54px] w-[44px]', md: 'h-[74px] w-[60px]', lg: 'h-full w-full' }
  return (
    <span className={`block shrink-0 overflow-hidden rounded-2xl bg-cream ${dims[size]} ${className}`}>
      {person.photoUrl ? (
        <img src={person.photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <Portrait id={person.id} scene={person.scene ?? 'portrait'} rounded="rounded-2xl" />
      )}
    </span>
  )
}

/** Tap the photo to be sure. Common first names are the whole reason. */
export function ReferencePhoto({ person, size = 'md' }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring press rounded-2xl"
        aria-label={`Enlarge ${person.firstName}'s photo`}
      >
        <Frame person={person} size={size} />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={person.firstName}
        subtitle={`${person.major}${person.gradYear ? ` · ’${person.gradYear}` : ''}`}
        maxWidth="max-w-xs"
      >
        <div className="aspect-[4/5] w-full overflow-hidden rounded-card bg-cream">
          <Frame person={person} size="lg" className="rounded-card" />
        </div>
        <p className="mt-4 text-center text-[12.5px] leading-relaxed text-mist">
          This is everything Looseleaf will show you about someone you aren’t connected to.
        </p>
      </Sheet>
    </>
  )
}

export default function PersonReference({ person, action, size = 'md', className = '' }) {
  return (
    <div
      className={`flex items-center gap-3.5 rounded-card border border-rule bg-white px-4 py-3.5 ${className}`}
    >
      <ReferencePhoto person={person} size={size} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[17px] font-semibold leading-tight text-navy">
          {person.firstName}
        </p>
        {/* Wraps rather than truncates: the year is often the only thing
            telling two people with the same name and major apart. */}
        <p className="mt-0.5 text-[13.5px] leading-snug text-graphite">
          {person.major}
          {person.gradYear ? ` · ’${person.gradYear}` : ''}
        </p>
      </div>
      {action}
    </div>
  )
}
