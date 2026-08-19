import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import { ReferencePhoto } from '../mutuals/PersonReference'
import { IconCheck } from '../ui/Icons'
import { useStore } from '../../state/store'
import * as mutuals from '../../services/mutuals'

/**
 * "You two both know" — asking a mutual about someone.
 *
 * Sending puts a reference card in your thread with that mutual: first name,
 * photo, major, year. Not a forwarded profile — the person being asked about
 * doesn't get handed to a third party, they get identified to someone who
 * already knows them. The database enforces the same limit; see
 * person_reference() in the mutuals migration.
 */
export default function MutualsSheet({ open, person, mutuals: list = [], onClose }) {
  const { state, actions } = useStore()
  const navigate = useNavigate()
  const [sent, setSent] = useState([])
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (open) setSent([])
  }, [open, person?.id])

  if (!person) return null

  const ask = async (m) => {
    setBusy(m.id)
    try {
      const thread = await mutuals.openThread(m)
      await mutuals.send(
        thread,
        state.session.userId ?? 'me',
        `Do you know ${person.firstName}?`,
        person.id
      )
      setSent((s) => [...s, m.id])
      actions.showToast(`Sent to ${m.firstName}.`)
    } catch (err) {
      actions.showToast(err.message)
    } finally {
      setBusy(null)
    }
  }

  const openThread = async (m) => {
    try {
      const thread = await mutuals.openThread(m)
      onClose?.()
      navigate(`/app/mutuals/${thread}`, { state: { person: m } })
    } catch (err) {
      actions.showToast(err.message)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`You and ${person.firstName} both know`}
      subtitle="Only people you’ve both connected with show up here."
    >
      <ul className="space-y-2">
        {list.map((m) => {
          const done = sent.includes(m.id)
          return (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-2xl border border-rule bg-white px-4 py-3"
            >
              <ReferencePhoto person={m} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-navy">{m.firstName}</p>
                <p className="truncate text-[13px] text-mist">{m.major}</p>
              </div>
              {done ? (
                <Button size="sm" variant="ghost" onClick={() => openThread(m)}>
                  <IconCheck size={15} />
                  Open
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={busy === m.id} onClick={() => ask(m)}>
                  {busy === m.id ? 'Sending…' : 'Ask them'}
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-4 rounded-2xl bg-cream/70 px-4 py-3 text-[13px] leading-relaxed text-graphite">
        This sends <span className="font-medium text-navy">“Do you know {person.firstName}?”</span> to your
        thread with them, along with a card showing her first name, photo, major and year — the same four
        things you’d get from a lookup. Not her profile, and no ratings, ever.
      </p>
    </Sheet>
  )
}
