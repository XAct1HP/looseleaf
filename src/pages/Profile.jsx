import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import ProfileCard from '../components/profile/ProfileCard'
import Portrait from '../components/brand/Portrait'
import Button from '../components/ui/Button'
import UniversityBadge from '../components/common/UniversityBadge'
import { InterestChip, Chip } from '../components/ui/Chip'
import RailCard from '../components/common/RailCard'
import { useRail } from '../components/nav/AppLayout'
import { useStore } from '../state/store'
import { intentionById } from '../data/catalog'
import { IconEye, IconChevron, IconSettings, IconShield, IconPeople } from '../components/ui/Icons'
import * as staff from '../services/staff'
import * as mutualsApi from '../services/mutuals'

/**
 * Mutuals live on your own page, not in the tab bar — they're part of who you
 * are here, and they're the one thing you manage about other people.
 */
function MutualsRow() {
  const [counts, setCounts] = useState({ mutuals: 0, incoming: 0 })

  useEffect(() => {
    let live = true
    mutualsApi
      .list()
      .then((d) => live && setCounts({ mutuals: d.mutuals.length, incoming: d.incoming.length }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const sub =
    counts.incoming > 0
      ? `${counts.incoming} waiting on you`
      : counts.mutuals > 0
        ? `${counts.mutuals} ${counts.mutuals === 1 ? 'person' : 'people'} you both know`
        : 'People you actually know, on here'

  return (
    <Link
      to="/app/mutuals"
      className="mt-5 flex items-center gap-3 rounded-card border border-rule bg-white px-5 py-4 text-[15px] font-medium text-navy hover:bg-cream/50"
    >
      <IconPeople size={20} className="text-mist" />
      <span className="flex-1">
        Mutuals
        <span className="mt-0.5 block text-[12.5px] font-normal text-mist">{sub}</span>
      </span>
      {counts.incoming > 0 && (
        <span className="rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white">
          {counts.incoming}
        </span>
      )}
      <IconChevron size={16} className="text-mist" />
    </Link>
  )
}

/**
 * Mobile only. The bottom nav is identical for every member — staff included —
 * so Backstage gets its door here instead. On desktop the sidebar has it.
 */
function BackstageRow() {
  const [waiting, setWaiting] = useState(0)

  useEffect(() => {
    let live = true
    staff
      .overview(1)
      .then((d) => live && setWaiting((d.open_reports ?? 0) + (d.pending_events ?? 0)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return (
    <Link
      to="/app/backstage"
      className="mt-5 flex items-center gap-3 rounded-card border border-navy/15 bg-cream/70 px-5 py-4 text-[15px] font-medium text-navy hover:bg-cream md:hidden"
    >
      <IconShield size={20} className="text-mist" />
      <span className="flex-1">
        Backstage
        <span className="mt-0.5 block text-[12.5px] font-normal text-mist">
          Reports, event queue, and numbers
        </span>
      </span>
      {waiting > 0 && (
        <span className="rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white">{waiting}</span>
      )}
      <IconChevron size={16} className="text-mist" />
    </Link>
  )
}

function Section({ title, editTo, children }) {
  return (
    <section className="rounded-card border border-rule bg-white px-6 py-5">
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">{title}</h2>
        <Link
          to={editTo}
          className="text-[13px] font-medium text-graphite underline underline-offset-4 hover:text-navy"
        >
          Edit
        </Link>
      </div>
      {children}
    </section>
  )
}

export default function Profile() {
  const { state } = useStore()
  const me = state.me
  const [preview, setPreview] = useState(false)
  const intention = intentionById(me.intention)

  useRail(
    <>
      <RailCard title="Your profile">
        <p className="text-[13.5px] leading-relaxed text-graphite">
          Prompts get liked more than photos. If something isn’t getting a reaction, change the answer before you
          change the picture.
        </p>
      </RailCard>
      <RailCard title="Nothing to upgrade" tone="coral">
        <p className="text-[13.5px] leading-relaxed text-[#8A3A3E]">
          There’s no premium tier to sell you. Your profile competes on being you, not on what you paid.
        </p>
      </RailCard>
    </>,
    []
  )

  if (preview) {
    return (
      <>
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-notebook/50 bg-notebook-soft px-4 py-3">
          <p className="text-[13.5px] font-medium text-[#22406E]">This is how your profile looks to others.</p>
          <Button variant="outline" size="sm" onClick={() => setPreview(false)}>
            Done
          </Button>
        </div>
        <ProfileCard person={me} showPass={false} showOverlap={false} showMenu={false} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={me.firstName}
        subtitle="Your page. Edit any part of it without redoing the rest."
        action={
          <Link
            to="/app/settings"
            aria-label="Settings"
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-graphite hover:bg-navy/[0.05] hover:text-navy sm:flex"
          >
            <IconSettings size={21} />
          </Link>
        }
      />

      <div className="mb-5 flex items-center gap-4 rounded-card border border-rule bg-cream/70 px-5 py-5">
        <span className="h-[92px] w-[76px] shrink-0 overflow-hidden rounded-2xl bg-white">
          {me.photos?.[0]?.url ? (
            <img src={me.photos[0].url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Portrait id="me-0" scene={me.photos?.[0]?.scene ?? 'portrait'} rounded="rounded-2xl" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[22px] font-semibold leading-tight">
            {me.firstName}, {me.age}
          </p>
          <p className="mt-1 text-[14px] text-graphite">
            {me.major} ’{me.gradYear}
          </p>
          <div className="mt-2.5">
            <UniversityBadge size="sm" />
          </div>
        </div>
      </div>

      <Button variant="outline" size="lg" full className="mb-5" onClick={() => setPreview(true)}>
        <IconEye size={18} />
        Preview my profile
      </Button>

      <div className="space-y-4">
        <Section title="Photos" editTo="/app/profile/edit#photos">
          <div className="grid grid-cols-4 gap-2">
            {me.photos?.map((p, i) => (
              <span key={i} className="aspect-[4/5] overflow-hidden rounded-xl bg-cream">
                {p.url ? (
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Portrait id={`me-${i}`} scene={p.scene} rounded="rounded-xl" />
                )}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Prompts" editTo="/app/profile/edit#prompts">
          <ul className="space-y-3">
            {me.prompts?.map((p, i) => (
              <li key={i} className="relative rounded-2xl bg-cream/60 px-4 py-3">
                <span className="absolute inset-y-2 left-2 w-px bg-margin/25" aria-hidden="true" />
                <p className="pl-2 text-[12px] font-medium uppercase tracking-[0.06em] text-mist">{p.q}</p>
                <p className="mt-1 pl-2 font-display text-[17px] leading-snug text-navy">{p.a}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Looking for" editTo="/app/profile/edit#intention">
          <div className="flex items-center gap-2 rounded-2xl bg-coral-wash px-4 py-3">
            <span aria-hidden="true">{intention?.emoji}</span>
            <span className="text-[14.5px] font-medium text-coral-deep">{intention?.label}</span>
          </div>
        </Section>

        <Section title="Interests" editTo="/app/profile/edit#interests">
          <div className="flex flex-wrap gap-2">
            {me.interests?.map((i) => (
              <InterestChip key={i} id={i} />
            ))}
          </div>
        </Section>

        <Section title="Campus life" editTo="/app/profile/edit#campus">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-[14.5px]">
            <div>
              <dt className="text-[12.5px] text-mist">Major</dt>
              <dd className="mt-0.5 font-medium text-navy">{me.major}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-mist">Class of</dt>
              <dd className="mt-0.5 font-medium text-navy">’{me.gradYear}</dd>
            </div>
            {me.minor && (
              <div>
                <dt className="text-[12.5px] text-mist">Minor</dt>
                <dd className="mt-0.5 font-medium text-navy">{me.minor}</dd>
              </div>
            )}
            <div>
              <dt className="text-[12.5px] text-mist">Around</dt>
              <dd className="mt-0.5 font-medium text-navy">{me.area}</dd>
            </div>
          </dl>
          {me.orgs?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {me.orgs.map((o) => (
                <Chip key={o} tone="blue">
                  {o}
                </Chip>
              ))}
            </div>
          )}
        </Section>
      </div>

      <MutualsRow />

      {me.isAdmin && <BackstageRow />}

      <Link
        to="/app/settings"
        className="mt-5 flex items-center gap-3 rounded-card border border-rule bg-white px-5 py-4 text-[15px] font-medium text-navy hover:bg-cream/50"
      >
        <IconSettings size={20} className="text-mist" />
        Settings
        <IconChevron size={16} className="ml-auto text-mist" />
      </Link>
    </>
  )
}
