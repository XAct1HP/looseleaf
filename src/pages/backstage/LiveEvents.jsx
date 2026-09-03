import { useEffect, useState } from 'react'
import BackstageHeader from './BackstageHeader'
import Button from '../../components/ui/Button'
import * as events from '../../services/liveEvents'

/**
 * ── The approval queue, and the kill switch ─────────────────────────────────
 *
 * An event carries the Looseleaf name into a room full of strangers, so a
 * human reads every one before it goes out. While we're recruiting hosts
 * personally that is a five-second tap; it stops mattering later, and the
 * shape of this page assumes it eventually will.
 *
 * The two irreversible-feeling buttons are deliberately different weights.
 * Approving is one tap. Stopping a running event kicks forty people out of a
 * room mid-conversation, so it asks first — and suspending a host stops
 * everything they have, which asks harder.
 */
export default function BackstageLiveEvents() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  const load = async () => {
    try {
      setRows(await events.staffEvents())
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const act = async (id, fn) => {
    setBusy(id)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const pending = rows.filter((r) => r.status === 'pending')
  const live = rows.filter((r) => ['running', 'paused'].includes(r.status))
  const rest = rows.filter((r) => !['pending', 'running', 'paused'].includes(r.status))

  if (!events.eventsEnabled) {
    return (
      <>
        <BackstageHeader title="Live events" />
        <p className="text-[14.5px] text-graphite">
          Live events need a configured Looseleaf. Nothing to moderate on demo data.
        </p>
      </>
    )
  }

  return (
    <>
      <BackstageHeader
        title="Live events"
        subtitle="Speed dating nights run by clubs. Every one is read by a person before students see it."
      />

      {error && (
        <p className="mb-6 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      <Group title="Waiting on us" empty="Nothing to approve." rows={pending}>
        {(r) => (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={busy === r.id}
              onClick={() => act(r.id, () => events.staffSetStatus(r.id, 'approved'))}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy === r.id}
              onClick={() => {
                const note = window.prompt('Send it back with a note:')
                if (note === null) return
                act(r.id, () => events.staffSetStatus(r.id, 'draft', note))
              }}
            >
              Send back
            </Button>
          </>
        )}
      </Group>

      <Group title="Happening now" empty="Nothing running." rows={live}>
        {(r) => (
          <Button
            variant="danger"
            size="sm"
            disabled={busy === r.id}
            onClick={() => {
              //  Forty people are mid-conversation. Ask.
              if (
                !window.confirm(
                  `Stop "${r.title}" now? ${r.here} people are in that room and their screens will say it's over.`
                )
              ) {
                return
              }
              act(r.id, () => events.staffSetStatus(r.id, 'killed'))
            }}
          >
            Stop it
          </Button>
        )}
      </Group>

      <Group title="Everything else" empty="No events yet." rows={rest} quiet>
        {(r) =>
          ['approved', 'draft'].includes(r.status) ? (
            <Button
              variant="danger"
              size="sm"
              disabled={busy === r.id}
              onClick={() => act(r.id, () => events.staffSetStatus(r.id, 'killed'))}
            >
              Stop it
            </Button>
          ) : null
        }
      </Group>
    </>
  )
}

function Group({ title, rows, empty, children, quiet }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.09em] text-mist">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-rule px-4 py-5 text-[13.5px] text-mist">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`flex flex-wrap items-center justify-between gap-4 rounded-card border border-rule bg-white px-5 py-4 ${
                quiet ? 'opacity-80' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-display text-[18px] font-semibold leading-tight">
                  {r.title}
                </p>
                <p className="mt-1 text-[13px] text-graphite">
                  {r.org_name} · {r.host_name}
                  {r.host_status !== 'approved' && (
                    <span className="ml-2 text-coral-deep">host {r.host_status}</span>
                  )}
                </p>
                <p className="mt-1 text-[12.5px] text-mist">
                  {r.venue_label ? `${r.venue_label} · ` : ''}
                  {r.starts_at
                    ? new Date(r.starts_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : 'no date'}
                  {' · '}
                  {r.likes_enabled ? 'matching on' : 'matching off'}
                  {r.here > 0 && ` · ${r.here} in the room`}
                </p>
                {r.review_note && (
                  <p className="mt-1.5 text-[12.5px] italic text-mist">“{r.review_note}”</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <code className="mr-1 text-[13px] tracking-[0.12em] text-mist">{r.code}</code>
                {children(r)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
