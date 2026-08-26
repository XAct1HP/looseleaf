import { useMemo, useState } from 'react'
import ProfilePhoto from './ProfilePhoto'
import PromptCard from './PromptCard'
import OverlapCard from './OverlapCard'
import NoteSheet from './NoteSheet'
import MutualsSheet from './MutualsSheet'
import ReportSheet from '../safety/ReportSheet'
import UniversityBadge from '../common/UniversityBadge'
import { InterestChip, Chip } from '../ui/Chip'
import { IconMore, IconX } from '../ui/Icons'
import Button, { IconButton } from '../ui/Button'
import { intentionById } from '../../data/catalog'
import { overlapWith } from '../../lib/overlap'
import { useStore } from '../../state/store'
import { Underline } from '../brand/Doodles'

/**
 * The whole person, browsed top to bottom like a page. Every photo and every
 * prompt can be liked on its own.
 */
export default function ProfileCard({
  person,
  onLike,
  onPass,
  fit = null,
  reasons = null,
  showPass = true,
  showOverlap = true,
  showMenu = true,
  className = '',
}) {
  const { state, actions } = useStore()
  const me = state.me
  const overlap = useMemo(() => overlapWith(person, me), [person, me])

  // In live mode the reasons come back from `compatibility_reasons()` with the
  // person, because scoring is a pair function and the client has no second
  // profile to compare against. In demo mode they are computed here. Either
  // way they render as the same list.
  const shownOverlap = useMemo(() => {
    if (!reasons?.length) return overlap
    if (overlap.lines.length) return overlap
    return { ...overlap, lines: reasons.map((text) => ({ key: text, icon: 'spark', text })) }
  }, [overlap, reasons])

  const [noteFor, setNoteFor] = useState(null) // { target, targetLabel, quote }
  const [showMutuals, setShowMutuals] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const intention = intentionById(person.intention)
  const photos = person.photos ?? []
  const prompts = person.prompts ?? []

  const askLike = (target, targetLabel, quote) => setNoteFor({ target, targetLabel, quote })

  const submit = (note) => {
    const payload = { personId: person.id, ...noteFor, note }
    delete payload.quote
    setNoteFor(null)
    onLike?.(payload)
  }

  // The first photo is what somebody is looking at the instant this card
  // appears, so it loads eagerly and ahead of everything else on the page.
  const photoAt = (i, extra = {}) =>
    photos[i] ? (
      <ProfilePhoto
        person={person}
        index={i}
        priority={i === 0}
        onLike={onLike ? () => askLike({ type: 'photo', index: i }, 'this photo') : undefined}
        {...extra}
      />
    ) : null

  const promptAt = (i) =>
    prompts[i] ? (
      <PromptCard
        prompt={prompts[i]}
        person={person}
        onLike={onLike ? () => askLike({ type: 'prompt', index: i }, 'this answer', prompts[i].a) : undefined}
      />
    ) : null

  return (
    <article className={`space-y-4 ${className}`}>
      {/* ── identity ─────────────────────────────────────────────── */}
      <div className="relative">
        {photoAt(0, { aspect: 'aspect-[4/5]' })}
      </div>

      <header className="relative rounded-card border border-rule bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="relative inline-block font-display text-[27px] font-semibold leading-tight tracking-[-0.02em]">
              {person.firstName}, {person.age}
              <Underline className="absolute -bottom-1 left-0 text-coral/50" width={70} />
            </h2>
            <p className="mt-2.5 text-[15px] text-graphite">
              {person.major} ’{person.gradYear}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <UniversityBadge />
              {person.pronouns && <Chip tone="cream">{person.pronouns}</Chip>}
            </div>
          </div>

          <div className={`relative shrink-0 ${showMenu ? '' : 'hidden'}`}>
            <IconButton label="More options" onClick={() => setMenuOpen((v) => !v)}>
              <IconMore size={20} />
            </IconButton>
            {menuOpen && (
              <>
                <button
                  className="fixed inset-0 z-10 cursor-default"
                  aria-hidden="true"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-11 z-20 w-44 animate-pop-in overflow-hidden rounded-2xl border border-rule bg-white py-1 shadow-lift">
                  <button
                    className="block w-full px-4 py-2.5 text-left text-[14px] text-graphite hover:bg-cream"
                    onClick={() => {
                      setMenuOpen(false)
                      setShowReport(true)
                    }}
                  >
                    Report
                  </button>
                  <button
                    className="block w-full px-4 py-2.5 text-left text-[14px] text-coral-deep hover:bg-coral-wash"
                    onClick={() => {
                      setMenuOpen(false)
                      actions.block(person.id)
                      onPass?.()
                    }}
                  >
                    Block {person.firstName}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {intention && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-coral-wash px-4 py-3">
            <span aria-hidden="true">{intention.emoji}</span>
            <span className="text-[14px] font-medium text-coral-deep">
              Looking for {intention.label.toLowerCase()}
            </span>
          </div>
        )}
      </header>

      {/* One card, not two. The fit and the overlap are the same fact told
          twice — the number is the arithmetic, the lines are the arithmetic in
          words — and stacking them meant reading "3 shared interests" and
          "3 interests in common" one above the other. */}
      {showOverlap && (
        <OverlapCard
          overlap={shownOverlap}
          fit={fit}
          onSeeMutuals={() => setShowMutuals(true)}
        />
      )}

      {promptAt(0)}
      {photoAt(1)}
      {promptAt(1)}

      {/* ── interests ───────────────────────────────────────────── */}
      {person.interests?.length > 0 && (
        <section className="rounded-card border border-rule bg-white px-6 py-5">
          <h3 className="mb-3.5 text-[13px] font-medium uppercase tracking-[0.06em] text-mist">Into</h3>
          <div className="flex flex-wrap gap-2">
            {person.interests.map((i) => (
              <InterestChip key={i} id={i} shared={overlap.sharedInterests.includes(i)} />
            ))}
          </div>
        </section>
      )}

      {photoAt(2)}
      {promptAt(2)}

      {/* ── campus life ─────────────────────────────────────────── */}
      <section className="rounded-card border border-rule bg-cream/70 px-6 py-5">
        <h3 className="mb-3.5 text-[13px] font-medium uppercase tracking-[0.06em] text-mist">Campus life</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-[14.5px]">
          <div>
            <dt className="text-[12.5px] text-mist">Studying</dt>
            <dd className="mt-0.5 font-medium text-navy">{person.major}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-mist">Class of</dt>
            <dd className="mt-0.5 font-medium text-navy">’{person.gradYear}</dd>
          </div>
          {person.minor && (
            <div>
              <dt className="text-[12.5px] text-mist">Minor</dt>
              <dd className="mt-0.5 font-medium text-navy">{person.minor}</dd>
            </div>
          )}
          <div>
            <dt className="text-[12.5px] text-mist">Around</dt>
            <dd className="mt-0.5 font-medium text-navy">{person.area}</dd>
          </div>
        </dl>
        {person.orgs?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {person.orgs.map((o) => (
              <Chip key={o} tone="blue">
                {o}
              </Chip>
            ))}
          </div>
        )}
      </section>

      {photoAt(3)}

      {/* ── footer ──────────────────────────────────────────────── */}
      {showPass && onPass && (
        <div className="flex flex-col items-start gap-3 pb-2 pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <Button variant="ghost" size="md" onClick={onPass} className="shrink-0">
            <IconX size={18} />
            Not for me
          </Button>
          <p className="text-[13px] text-mist sm:text-right">
            Like the part of {person.firstName} that got your attention.
          </p>
        </div>
      )}

      {/* ── sheets ──────────────────────────────────────────────── */}
      <NoteSheet
        open={!!noteFor}
        person={person}
        quote={noteFor?.quote}
        targetLabel={noteFor?.targetLabel}
        onClose={() => setNoteFor(null)}
        onSubmit={submit}
      />
      <MutualsSheet
        open={showMutuals}
        person={person}
        mutuals={overlap.mutuals}
        onClose={() => setShowMutuals(false)}
      />
      <ReportSheet
        open={showReport}
        person={person}
        onClose={() => setShowReport(false)}
        onReport={(reason) => {
          actions.report(person.id, reason)
          onPass?.()
        }}
        onBlock={() => {
          actions.block(person.id)
          onPass?.()
        }}
      />
    </article>
  )
}
