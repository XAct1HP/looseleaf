import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BackstageHeader from './BackstageHeader'
import StatTile from '../../components/backstage/StatTile'
import SignupsChart from '../../components/backstage/SignupsChart'
import RailCard from '../../components/common/RailCard'
import { useRail } from '../../components/nav/AppLayout'
import { useStore } from '../../state/store'
import * as staff from '../../services/staff'
import { IconChevron } from '../../components/ui/Icons'

export default function Overview() {
  const { actions } = useStore()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    staff
      .overview(14)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [])

  const campus = data?.campus
  const toGo = campus ? Math.max(0, campus.threshold - (data?.members ?? 0)) : null

  useRail(
    <>
      <RailCard title="Campus status" tone={campus?.is_open ? 'moss' : 'cream'}>
        <p className="text-[13.5px] leading-relaxed text-graphite">
          {campus?.is_open
            ? 'Open. Discover, likes, and matches are live for members.'
            : `Closed. ${toGo ?? '—'} more finished profiles until it opens on its own, or flip is_live in the universities table to open it now.`}
        </p>
      </RailCard>
      <RailCard title="A reminder">
        <p className="text-[13.5px] leading-relaxed text-graphite">
          Nothing here can change who gets seen. Ranking reads preferences and campus
          context only — there is no lever in Backstage that promotes a person.
        </p>
      </RailCard>
    </>,
    [campus?.is_open, toGo]
  )

  if (error) {
    return (
      <>
        <BackstageHeader title="Overview" />
        <p className="rounded-card bg-coral-wash px-5 py-4 text-[14px] text-coral-deep">{error}</p>
      </>
    )
  }

  if (!data) {
    return (
      <>
        <BackstageHeader title="Overview" />
        <p className="py-10 text-center text-[14px] text-mist">Loading…</p>
      </>
    )
  }

  return (
    <>
      <BackstageHeader
        title="Overview"
        subtitle={`${campus?.name ?? 'Your campus'} · ${campus?.is_open ? 'open' : 'pre-launch'}`}
      />

      {/* what needs a human */}
      {(data.open_reports > 0 || data.pending_events > 0) && (
        <section className="mb-6 grid gap-3 sm:grid-cols-2">
          {data.open_reports > 0 && (
            <Link to="/app/backstage/reports" className="lift-corner block">
              <StatTile
                label="Reports waiting"
                value={data.open_reports}
                hint="Nobody is notified but you — check these daily."
                tone="attention"
              />
            </Link>
          )}
          {data.pending_events > 0 && (
            <Link to="/app/backstage/events" className="lift-corner block">
              <StatTile
                label="Events waiting"
                value={data.pending_events}
                hint="Students can't see these until you publish them."
                tone="attention"
              />
            </Link>
          )}
        </section>
      )}

      <div className="mb-6">
        <SignupsChart data={data.signups} />
      </div>

      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">Campus</h2>
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Members"
          value={data.members}
          hint={campus?.is_open ? 'Campus is open' : `${toGo} to open`}
        />
        <StatTile label="Signed up" value={data.signed_up} hint="Accounts created" />
        <StatTile label="Unfinished" value={data.incomplete} hint="Started, no profile" tone="quiet" />
        <StatTile label="Paused" value={data.paused} tone="quiet" />
      </section>

      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">Activity</h2>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Likes" value={data.likes} hint={`${data.notes} with a note`} />
        <StatTile label="Matches" value={data.matches} />
        <StatTile label="Messages" value={data.messages} />
        <StatTile label="Around tonight" value={data.live_tonight} tone="quiet" />
      </section>

      <Link
        to="/app/backstage/reports"
        className="mt-6 flex items-center gap-3 rounded-card border border-rule bg-white px-5 py-4 text-[15px] font-medium text-navy hover:bg-cream/50"
      >
        Go to the report queue
        <IconChevron size={16} className="ml-auto text-mist" />
      </Link>

      <p className="mt-6 text-center text-[12.5px] leading-relaxed text-mist">
        These numbers are for running the place, not for a growth dashboard. If a metric here
        ever starts driving a product decision that makes Looseleaf worse to use, delete it.
      </p>
    </>
  )
}
