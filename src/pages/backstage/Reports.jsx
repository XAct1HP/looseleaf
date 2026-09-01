import { useCallback, useEffect, useState } from 'react'
import BackstageHeader from './BackstageHeader'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import EmptyState from '../../components/common/EmptyState'
import { PersonAvatar } from '../../components/brand/Portrait'
import { Chip } from '../../components/ui/Chip'
import { useStore } from '../../state/store'
import * as staff from '../../services/staff'

const ago = (at) => {
  const ms = Date.now() - new Date(at).getTime()
  const h = Math.round(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
]

export default function Reports() {
  const { state, actions } = useStore()
  const [filter, setFilter] = useState('open')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(null) // { report, decision }
  const [note, setNote] = useState('')
  const [alsoSuspend, setAlsoSuspend] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReports(await staff.listReports(filter))
    } catch (e) {
      actions.showToast(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter, actions])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    const { report, decision } = resolving
    try {
      // `reported` can be null now: a report outlives the account it is about,
      // so that somebody can't clear the queue by deleting themselves. There
      // is nothing left to suspend in that case, and the checkbox below is
      // hidden for the same reason.
      if (alsoSuspend && decision === 'actioned' && report.reported?.id) {
        await staff.setPaused(report.reported.id, true)
      }
      await staff.resolveReport(report.id, state.session.userId, decision, note)
      actions.showToast(decision === 'actioned' ? 'Actioned.' : 'Dismissed.')
      setResolving(null)
      setNote('')
      setAlsoSuspend(false)
      load()
    } catch (e) {
      actions.showToast(e.message)
    }
  }

  return (
    <>
      <BackstageHeader
        title="Reports"
        subtitle="Every report a student files lands here. Nothing notifies you, so this is worth opening daily."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`press focus-ring rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition ${
              filter === f.id
                ? 'border-navy bg-navy text-paper'
                : 'border-rule bg-white text-graphite hover:border-navy/25'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-[14px] text-mist">Loading…</p>
      ) : reports.length === 0 ? (
        <EmptyState
          art="sheet"
          title={filter === 'open' ? 'Nothing waiting.' : 'Nothing here.'}
          body={
            filter === 'open'
              ? 'No open reports. That is the good outcome, not a broken page.'
              : 'No reports with that status yet.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-card border border-rule bg-white px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={r.status === 'open' ? 'coral' : r.status === 'actioned' ? 'navy' : 'cream'}>
                  {r.status}
                </Chip>
                <span className="text-[12.5px] text-mist">{ago(r.at)}</span>
              </div>

              <p className="mt-3 font-display text-[18px] font-semibold leading-snug text-navy">{r.reason}</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-2xl bg-cream/60 px-3.5 py-3">
                  <PersonAvatar id={`${r.reported?.id}-0`} size={38} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-mist">Reported</p>
                    <p className="truncate text-[14.5px] font-medium text-navy">
                      {r.reported?.first_name ?? 'Unknown'}
                      {r.reported?.is_paused && <span className="ml-2 text-[12px] text-coral-deep">suspended</span>}
                    </p>
                    <p className="truncate text-[12.5px] text-mist">
                      {r.reported?.major} ’{r.reported?.grad_year}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-cream/60 px-3.5 py-3">
                  <PersonAvatar id={`${r.reporter?.id}-0`} size={38} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-mist">Reported by</p>
                    <p className="truncate text-[14.5px] font-medium text-navy">
                      {r.reporter?.first_name ?? 'Unknown'}
                    </p>
                    <p className="truncate text-[12.5px] text-mist">
                      {r.reporter?.major} ’{r.reporter?.grad_year}
                    </p>
                  </div>
                </div>
              </div>

              {r.note && (
                <p className="mt-3 rounded-2xl bg-cream/60 px-4 py-3 text-[13.5px] leading-relaxed text-graphite">
                  {r.note}
                </p>
              )}

              {r.status === 'open' && (
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="md"
                    className="flex-1"
                    onClick={() => {
                      setResolving({ report: r, decision: 'dismissed' })
                      setNote('')
                      setAlsoSuspend(false)
                    }}
                  >
                    Dismiss
                  </Button>
                  <Button
                    variant="coral"
                    size="md"
                    className="flex-1"
                    onClick={() => {
                      setResolving({ report: r, decision: 'actioned' })
                      setNote('')
                      setAlsoSuspend(true)
                    }}
                  >
                    Take action
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!resolving}
        onClose={() => setResolving(null)}
        title={resolving?.decision === 'actioned' ? 'Take action' : 'Dismiss this report'}
        subtitle={
          resolving?.decision === 'actioned'
            ? `About ${resolving?.report?.reported?.first_name}. The person who reported is never told who you are or what you did.`
            : 'Closes the report with no action against the account.'
        }
      >
        <label htmlFor="staff-note" className="label">
          Note for your own records <span className="font-normal text-mist">· optional</span>
        </label>
        <textarea
          id="staff-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="field resize-none"
          placeholder="What you found, and what you did about it."
        />

        {resolving?.decision === 'actioned' && !resolving?.report?.reported && (
          <p className="mt-4 rounded-2xl border border-rule bg-cream/60 px-4 py-3 text-[13.5px] leading-relaxed text-mist">
            This account has been deleted. The report stays on the record; there is nothing left to
            suspend.
          </p>
        )}

        {resolving?.decision === 'actioned' && resolving?.report?.reported && (
          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-rule bg-cream/60 px-4 py-3">
            <input
              type="checkbox"
              checked={alsoSuspend}
              onChange={(e) => setAlsoSuspend(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-coral"
            />
            <span className="text-[13.5px] leading-relaxed text-graphite">
              Also suspend {resolving?.report?.reported?.first_name}’s account — their profile stops being shown
              and they can’t be matched. Reversible.
            </span>
          </label>
        )}

        <Button
          variant={resolving?.decision === 'actioned' ? 'coral' : 'primary'}
          size="lg"
          full
          className="mt-5"
          onClick={submit}
        >
          {resolving?.decision === 'actioned' ? 'Action it' : 'Dismiss'}
        </Button>
      </Sheet>
    </>
  )
}
