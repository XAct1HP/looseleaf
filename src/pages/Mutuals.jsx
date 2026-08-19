import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconBack, IconPlus, IconChat, IconCheck, IconX, IconMore } from '../components/ui/Icons'
import Button from '../components/ui/Button'
import RailCard from '../components/common/RailCard'
import EmptyState from '../components/common/EmptyState'
import PersonReference from '../components/mutuals/PersonReference'
import AddMutualSheet from '../components/mutuals/AddMutualSheet'
import { useRail } from '../components/nav/AppLayout'
import { useStore } from '../state/store'
import * as mutuals from '../services/mutuals'

function Section({ title, note, children }) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">{title}</h2>
      {note && <p className="mb-3 text-[13px] text-graphite">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  )
}

export default function Mutuals() {
  const { actions } = useStore()
  const navigate = useNavigate()
  const [data, setData] = useState({ mutuals: [], incoming: [], sent: [] })
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [menuFor, setMenuFor] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await mutuals.list())
    } catch (err) {
      actions.showToast(err.message)
    } finally {
      setLoading(false)
    }
  }, [actions])

  useEffect(() => {
    load()
  }, [load])

  useRail(
    <>
      <RailCard title="What a mutual is">
        <p className="text-[13.5px] leading-relaxed text-graphite">
          Someone you actually know, who has agreed that they know you. That’s the whole definition — it’s
          why “2 mutual connections” on a profile means something.
        </p>
      </RailCard>
      <RailCard title="Why there's no list" tone="blue">
        <p className="text-[13.5px] leading-relaxed text-[#22406E]">
          You can’t browse who’s on Looseleaf. You look someone up by name and major, or you don’t find them.
          Everyone here gets that same protection, including you.
        </p>
      </RailCard>
    </>,
    []
  )

  const respond = async (person, accept) => {
    try {
      await mutuals.respond(person.connectionId, accept)
      actions.showToast(accept ? `You and ${person.firstName} are mutuals.` : 'Declined.')
      load()
    } catch (err) {
      actions.showToast(err.message)
    }
  }

  const remove = async (person) => {
    setMenuFor(null)
    try {
      await mutuals.remove(person.connectionId)
      actions.showToast(`Removed. Your thread with ${person.firstName} went with it.`)
      load()
    } catch (err) {
      actions.showToast(err.message)
    }
  }

  const openChat = async (person) => {
    try {
      const thread = await mutuals.openThread(person)
      navigate(`/app/mutuals/${thread}`, { state: { person } })
    } catch (err) {
      actions.showToast(err.message)
    }
  }

  const empty = !loading && !data.mutuals.length && !data.incoming.length && !data.sent.length

  return (
    <>
      <header className="mb-7">
        <Link
          to="/app/profile"
          className="press focus-ring -ml-2 mb-4 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[14px] font-medium text-graphite hover:text-navy"
        >
          <IconBack size={18} />
          Profile
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-[32px]">
              Mutuals
            </h1>
            <p className="mt-2.5 max-w-md text-[14.5px] leading-relaxed text-graphite">
              The people you and someone else both know. Add them by name and major.
            </p>
          </div>
          <Button variant="coral" size="md" className="shrink-0" onClick={() => setAdding(true)}>
            <IconPlus size={17} />
            Add
          </Button>
        </div>
      </header>

      {loading ? (
        <p className="py-10 text-center text-[14px] text-mist">Loading…</p>
      ) : empty ? (
        <EmptyState
          art="sheet"
          title="No mutuals yet."
          body="Think of one person you actually know who's on here. You'll need their first name and their major — that's the only way to find anyone."
          action={
            <Button variant="coral" size="lg" onClick={() => setAdding(true)}>
              Add your first mutual
            </Button>
          }
        />
      ) : (
        <>
          {data.incoming.length > 0 && (
            <Section
              title="Waiting on you"
              note="They say they know you. Nothing shows on either profile until you agree."
            >
              <ul className="space-y-2.5">
                {data.incoming.map((person) => (
                  <li key={person.connectionId}>
                    <PersonReference
                      person={person}
                      action={
                        <span className="flex shrink-0 gap-2">
                          <Button size="sm" variant="outline" onClick={() => respond(person, false)}>
                            <IconX size={15} />
                          </Button>
                          <Button size="sm" variant="coral" onClick={() => respond(person, true)}>
                            <IconCheck size={15} />
                            Yes
                          </Button>
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {data.mutuals.length > 0 && (
            <Section title={`Your mutuals · ${data.mutuals.length}`}>
              <ul className="space-y-2.5">
                {data.mutuals.map((person) => (
                  <li key={person.connectionId} className="relative">
                    <PersonReference
                      person={person}
                      action={
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Button size="sm" variant="soft" onClick={() => openChat(person)}>
                            <IconChat size={15} />
                            Message
                          </Button>
                          <button
                            type="button"
                            onClick={() => setMenuFor(menuFor === person.connectionId ? null : person.connectionId)}
                            aria-label={`More options for ${person.firstName}`}
                            className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl text-mist hover:bg-navy/[0.04] hover:text-navy"
                          >
                            <IconMore size={18} />
                          </button>
                        </span>
                      }
                    />
                    {menuFor === person.connectionId && (
                      <div className="absolute right-3 top-[62px] z-20 w-56 rounded-2xl border border-rule bg-white p-1.5 shadow-lift">
                        <button
                          type="button"
                          onClick={() => remove(person)}
                          className="w-full rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-coral-deep hover:bg-coral-wash"
                        >
                          Remove mutual
                        </button>
                        <p className="px-3 pb-1.5 pt-1 text-[12px] leading-relaxed text-mist">
                          Removes it for both of you, and deletes your thread.
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {data.sent.length > 0 && (
            <Section title="Asked, no answer yet" note="Only they can see this.">
              <ul className="space-y-2.5">
                {data.sent.map((person) => (
                  <li key={person.connectionId}>
                    <PersonReference
                      person={person}
                      action={
                        <Button size="sm" variant="ghost" onClick={() => remove(person)}>
                          Cancel
                        </Button>
                      }
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      <AddMutualSheet open={adding} onClose={() => setAdding(false)} onAdded={load} />
    </>
  )
}
