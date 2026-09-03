import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import HostShell from './HostShell'
import Button from '../../components/ui/Button'
import { SelectChip } from '../../components/ui/Chip'
import QrCode from '../../components/dates/QrCode'
import { LeafMark } from '../../components/brand/Logo'
import * as events from '../../services/liveEvents'
import { accentOf } from '../../lib/liveEvent'
import { eventUrl } from '../../lib/site'

/**
 * ── Paper ───────────────────────────────────────────────────────────────────
 *
 * Not polish, and not phase three. A host physically cannot run one of these
 * without a printed code on the door, and the first thing every one of them
 * will ask for is something to post on Instagram a week early. Shipping the
 * software without the paper would be shipping a feature nobody can use.
 *
 * Four pieces, one screen, printed straight from the browser:
 *
 *  · **Door poster** — and the same artwork is the pre-registration flyer.
 *    That doubling matters more than it looks: a room where half the people
 *    verified their email at home on Tuesday is a room with no queue at the
 *    door, which is the single biggest risk this feature has.
 *  · **Half-page flyers, two up** — for the registration table.
 *  · **Table tents** — numbered cards, folded, so nobody counts tables in
 *    their head while forty people wait.
 *  · **A square for Instagram** — how the room gets filled in the first place,
 *    and the cheapest thing in this file.
 *
 * No PDF library. `@media print` and the browser's own Save as PDF do this
 * better than a megabyte of JavaScript would, and they do it on a phone.
 *
 * The QR reuses `QrCode` — error correction M, drawn as a single SVG path, so
 * it scales to four inches on paper with no raster anywhere.
 */

/**
 * QR modules are always this, never the host's accent.
 *
 * A decoder needs luminance contrast, and coral on white is about 4:1 — fine
 * on a screen, marginal on a cheap campus laser printer, and genuinely bad
 * photographed at an angle in a dim room. The one person it fails for gives up
 * and walks off, and nobody ever finds out why. So the accent colours the
 * frame, the headline and the code underneath; the grid itself stays ink.
 */
const QR_INK = '#111C38'

const SHEETS = [
  { id: 'poster', label: 'Door poster' },
  { id: 'flyers', label: 'Flyers, 2 up' },
  { id: 'tents', label: 'Table tents' },
  { id: 'social', label: 'For Instagram' },
]

export default function PrintKit() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [sheet, setSheet] = useState('poster')
  const [tables, setTables] = useState(null)

  useEffect(() => {
    events.getEvent(id).then(setData).catch(() => setData(null))
  }, [id])

  /**
   *  Two things, both scoped to this page being open.
   *
   *  `print-kit` on <html> follows the existing convention (see index.css):
   *  print rules hang off a class so that Ctrl+P anywhere else in Looseleaf
   *  still prints the page a browser would. Note it is deliberately NOT
   *  `print-mode` — that one hides `#root`, which is right for a card
   *  portalled outside the app and exactly wrong here, where the sheets are
   *  rendered inside it.
   *
   *  The `@page` margin has to be a real stylesheet because an at-rule cannot
   *  be scoped to a class. Zero, because a poster measures its own margins in
   *  millimetres and a second margin from the browser would shrink the QR
   *  below the size that reads reliably off a door.
   */
  useEffect(() => {
    document.documentElement.classList.add('print-kit')
    const style = document.createElement('style')
    style.setAttribute('data-print-kit', '')
    style.textContent = '@media print { @page { margin: 0; } }'
    document.head.appendChild(style)
    return () => {
      document.documentElement.classList.remove('print-kit')
      style.remove()
    }
  }, [])

  if (!data) return <HostShell title="One moment…" back={`/host/${id}`} />

  const ev = data.event
  const accent = accentOf(ev.accent)
  const org = data.host?.org_name ?? ''
  const link = eventUrl(ev.code)
  const logo = events.logoUrl(ev.logo_path)

  const stations = data.stations ?? []
  //  A stations event already knows how many tables it has, and typing the
  //  number again is a chance to get it wrong.
  const tentCount = tables ?? (stations.length || 10)
  const shared = { ev, accent, org, link, logo, stations }

  return (
    <>
      <div className="no-print">
        <HostShell
          title="Print kit"
          back={`/host/${id}`}
          subtitle="Print these, or save as PDF from the print dialog. The code never changes, so anything you print now stays good."
          wide
        >
          <div className="flex flex-wrap gap-2">
            {SHEETS.map((s) => (
              <SelectChip key={s.id} selected={sheet === s.id} onClick={() => setSheet(s.id)}>
                {s.label}
              </SelectChip>
            ))}
          </div>

          {sheet === 'tents' && (
            <div className="mt-5 max-w-[220px]">
              <label htmlFor="tents-n" className="label">
                How many tables
              </label>
              <input
                id="tents-n"
                type="number"
                min={1}
                max={40}
                value={tentCount}
                onChange={(e) => setTables(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
                className="field"
              />
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="coral"
              size="lg"
              style={{ background: accent.plate }}
              onClick={() => window.print()}
            >
              Print this
            </Button>
            <code className="rounded-xl border border-rule bg-white px-3 py-2 text-[13px] text-graphite">
              {link}
            </code>
          </div>

          <p className="mt-5 max-w-[60ch] text-[13.5px] leading-relaxed text-graphite">
            Share that link a few days early — in the group chat, on a story, on a flyer. Nobody
            has to make an account either way: they scan, type a first name, and they’re in.
          </p>

          <div className="mt-8 overflow-x-auto rounded-card border border-rule bg-[#F4F1EA] p-6">
            <div className="mx-auto w-fit bg-white shadow-lift">
              <Sheet id={sheet} tables={tentCount} {...shared} />
            </div>
          </div>
        </HostShell>
      </div>

      {/* What actually goes on paper. Hidden on screen, the only thing printed. */}
      <div className="print-only">
        <Sheet id={sheet} tables={tentCount} {...shared} />
      </div>
    </>
  )
}

function Sheet({ id, tables, ...p }) {
  if (id === 'flyers') return <Flyers {...p} />
  if (id === 'tents') return <Tents tables={tables} {...p} />
  if (id === 'social') return <Social {...p} />
  return <Poster {...p} />
}

/* ── the door poster ─────────────────────────────────────────────────────── */

function Poster({ ev, accent, org, link, logo }) {
  return (
    <article className="page page-letter flex flex-col items-center px-[18mm] py-[16mm] text-center">
      <Header org={org} logo={logo} accent={accent} />

      <h1
        className="mt-[10mm] font-display text-[46pt] font-semibold leading-[1.04] tracking-[-0.02em] [text-wrap:balance]"
        style={{ color: accent.ink }}
      >
        {ev.title}
      </h1>

      <When ev={ev} className="mt-[6mm] text-[15pt]" />

      <div className="mt-[10mm] rounded-[6mm] border-[0.6mm] p-[6mm]" style={{ borderColor: accent.ink }}>
        <QrCode value={link} size={330} dark={QR_INK} label="Scan to join this event" />
      </div>

      <p className="mt-[7mm] text-[13pt] font-medium text-[#566070]">
        Point your camera here, or go to
      </p>
      <p className="mt-[2mm] font-display text-[19pt] font-semibold text-[#111C38]">
        hellolooseleaf.com/e
      </p>
      <p
        className="mt-[3mm] font-display text-[40pt] font-semibold leading-none tracking-[0.16em]"
        style={{ color: accent.ink }}
      >
        {ev.code}
      </p>

      <LooseleafFoot className="mt-auto pt-[10mm]" />
    </article>
  )
}

/* ── flyers, two to a page ───────────────────────────────────────────────── */

function Flyers({ ev, accent, org, link, logo }) {
  return (
    <article className="page page-letter flex flex-col">
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`flex flex-1 items-center gap-[8mm] px-[14mm] py-[10mm] ${
            i === 0 ? 'border-b border-dashed border-[#C9C2B5]' : ''
          }`}
        >
          <div className="shrink-0 rounded-[4mm] border-[0.5mm] p-[4mm]" style={{ borderColor: accent.ink }}>
            <QrCode value={link} size={150} dark={QR_INK} label="Scan to join" />
          </div>
          <div className="min-w-0">
            <Header org={org} logo={logo} accent={accent} compact />
            <h2
              className="mt-[4mm] font-display text-[22pt] font-semibold leading-[1.08] tracking-[-0.02em]"
              style={{ color: accent.ink }}
            >
              {ev.title}
            </h2>
            <When ev={ev} className="mt-[2mm] text-[11pt]" />
            <p className="mt-[4mm] text-[11pt] leading-[1.4] text-[#566070]">
              Scan now and you’ll walk straight in. Free — no app to download.
            </p>
            <p
              className="mt-[3mm] font-display text-[17pt] font-semibold tracking-[0.14em]"
              style={{ color: accent.ink }}
            >
              {ev.code}
            </p>
            <LooseleafFoot className="mt-[5mm] justify-start" compact />
          </div>
        </div>
      ))}
    </article>
  )
}

/* ── numbered table tents ────────────────────────────────────────────────── */

function Tents({ tables, accent, org, stations = [] }) {
  //  Two per sheet, each folded across the middle so the number reads from
  //  both sides of the table. The top half is printed upside down, which is
  //  what makes the fold work and is the sort of thing you only discover by
  //  folding one.
  const pages = []
  for (let i = 1; i <= tables; i += 2) pages.push([i, i + 1 <= tables ? i + 1 : null])

  return (
    <>
      {pages.map(([a, b]) => (
        <article key={a} className="page page-letter flex flex-col">
          {[a, b].map((n, idx) =>
            n === null ? (
              <div key="blank" className="flex-1" />
            ) : (
              <div
                key={n}
                className={`flex flex-1 flex-col ${
                  idx === 0 ? 'border-b border-dashed border-[#C9C2B5]' : ''
                }`}
              >
                <div className="flex flex-1 rotate-180 items-center justify-center">
                  <TentFace n={n} accent={accent} org={org} label={stations[n - 1]?.label} />
                </div>
                <div className="flex flex-1 items-center justify-center">
                  <TentFace n={n} accent={accent} org={org} label={stations[n - 1]?.label} />
                </div>
              </div>
            )
          )}
        </article>
      ))}
    </>
  )
}

function TentFace({ n, accent, org, label }) {
  return (
    <div className="px-[10mm] text-center">
      <p className="text-[11pt] font-medium uppercase tracking-[0.2em] text-[#8B93A3]">Table</p>
      <p
        className="font-display text-[100pt] font-semibold leading-none"
        style={{ color: accent.ink }}
      >
        {n}
      </p>
      {/*  The host's own name for the table, when they gave it one. A tent
           reading "How to pitch" is worth more to somebody walking up to it
           than a number is. */}
      {label && (
        <p
          className="mt-[4mm] font-display text-[20pt] font-semibold leading-tight [text-wrap:balance]"
          style={{ color: accent.ink }}
        >
          {label}
        </p>
      )}
      <div className="mt-[6mm] flex items-center justify-center gap-[3mm]">
        <span className="text-[10pt] text-[#8B93A3]">{org}</span>
        <span className="text-[10pt] text-[#C9C2B5]">·</span>
        <LeafMark size={16} className="text-[#8B93A3]" />
        <span className="font-display text-[10pt] font-semibold lowercase text-[#8B93A3]">
          looseleaf
        </span>
      </div>
    </div>
  )
}

/* ── the square that fills the room ──────────────────────────────────────── */

function Social({ ev, accent, org, link, logo }) {
  return (
    <article className="page page-square flex flex-col items-center justify-center px-[14mm] text-center">
      <Header org={org} logo={logo} accent={accent} />
      <h1
        className="mt-[8mm] font-display text-[34pt] font-semibold leading-[1.06] tracking-[-0.02em] [text-wrap:balance]"
        style={{ color: accent.ink }}
      >
        {ev.title}
      </h1>
      <When ev={ev} className="mt-[4mm] text-[13pt]" />
      <div className="mt-[7mm] rounded-[5mm] border-[0.5mm] p-[4mm]" style={{ borderColor: accent.ink }}>
        <QrCode value={link} size={210} dark={QR_INK} label="Scan to join" />
      </div>
      <p
        className="mt-[5mm] font-display text-[26pt] font-semibold tracking-[0.16em]"
        style={{ color: accent.ink }}
      >
        {ev.code}
      </p>
      <p className="mt-[4mm] text-[11pt] text-[#566070]">Scan now, skip the line.</p>
      <LooseleafFoot className="mt-[6mm]" compact />
    </article>
  )
}

/* ── shared bits ─────────────────────────────────────────────────────────── */

/**
 * The club's mark, at a size that says whose night this is.
 *
 * With a real fallback rather than nothing: a host who never uploaded a logo
 * used to get a poster with a line of small type where the branding should be,
 * which looks like a mistake. An initial in their own accent colour looks
 * deliberate, and most clubs will never notice they didn't upload anything.
 */
function Header({ org, logo, accent, compact }) {
  const box = compact ? '14mm' : '20mm'
  return (
    <div className={`flex items-center gap-[4mm] ${compact ? '' : 'justify-center'}`}>
      {logo ? (
        <img src={logo} alt="" className="rounded-[4mm] object-cover"
             style={{ width: box, height: box }} />
      ) : (
        <span
          className="flex items-center justify-center rounded-[4mm] font-display font-semibold"
          style={{
            width: box, height: box,
            background: accent.wash, color: accent.ink,
            fontSize: compact ? '15pt' : '22pt',
          }}
          aria-hidden="true"
        >
          {(org || '?').trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span
        className="font-display font-semibold"
        style={{ color: accent.ink, fontSize: compact ? '13pt' : '18pt' }}
      >
        {org}
      </span>
    </div>
  )
}

/**
 * ── The Looseleaf half of the co-brand ─────────────────────────────────────
 *
 * A line of small type saying "on Looseleaf" was doing none of the work this
 * is for. A poster is the one artefact from an event that a hundred people
 * walk past and only forty scan, so the mark belongs on it properly — drawn,
 * at a readable size, with the one sentence that tells a passer-by what they
 * would be joining.
 *
 * Still second to the club, and deliberately at the foot rather than the head:
 * it is their night. But present, and legible from a few feet away.
 */
function LooseleafFoot({ className = '', compact = false }) {
  return (
    <div className={`flex items-center justify-center gap-[3mm] ${className}`}>
      <LeafMark size={compact ? 26 : 34} className="text-[#111C38]" />
      <div className="text-left">
        <p
          className="font-display font-semibold lowercase leading-none tracking-[-0.02em] text-[#111C38]"
          style={{ fontSize: compact ? '13pt' : '17pt' }}
        >
          looseleaf
        </p>
        <p
          className="mt-[1.5mm] leading-tight text-[#566070]"
          style={{ fontSize: compact ? '8.5pt' : '10.5pt' }}
        >
          Free. No app to download.
        </p>
      </div>
    </div>
  )
}

function When({ ev, className = '' }) {
  const bits = []
  if (ev.starts_at) {
    bits.push(
      new Date(ev.starts_at).toLocaleString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    )
  }
  if (ev.venue_label) bits.push(ev.venue_label)
  if (bits.length === 0) return null
  return <p className={`text-[#566070] ${className}`}>{bits.join(' · ')}</p>
}


