import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { IconBack, IconSend } from '../components/ui/Icons'
import { ReferencePhoto } from '../components/mutuals/PersonReference'
import { useStore } from '../state/store'
import * as mutuals from '../services/mutuals'

const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * A thread with a mutual.
 *
 * Deliberately plainer than a match chat — no notes, no date nudge, no
 * planner. This is the group-chat corner of Looseleaf, not a second romantic
 * surface, and it should never start looking like one.
 */

function Card({ card }) {
  if (!card) return null
  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl border border-rule bg-paper px-3 py-2.5">
      <ReferencePhoto person={card} size="sm" />
      <div className="min-w-0">
        <p className="truncate font-display text-[15.5px] font-semibold leading-tight text-navy">
          {card.firstName}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] text-graphite">
          {card.major}
          {card.gradYear ? ` · ’${card.gradYear}` : ''}
        </p>
      </div>
    </div>
  )
}

export default function MutualChat() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const person = location.state?.person

  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const endRef = useRef(null)

  const load = useCallback(async () => {
    try {
      setMessages(await mutuals.readThread(id))
    } catch (err) {
      actions.showToast(err.message)
    } finally {
      setLoading(false)
    }
  }, [id, actions])

  useEffect(() => {
    load()
  }, [load])

  // Their message, without a reload. The guard matters: your own insert comes
  // back down this channel too, and the refresh after sending has usually put
  // it on screen a moment earlier — so an id we already hold is dropped rather
  // than appended twice.
  useEffect(
    () =>
      mutuals.subscribeToThread(id, (message) => {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      }),
    [id]
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    try {
      await mutuals.send(id, state.session.userId ?? 'me', body)
      await load()
      const reply = await mutuals.demoReply(id, messages.length)
      if (reply) setTimeout(load, 900)
    } catch (err) {
      actions.showToast(err.message)
    }
  }

  if (!person && !loading && messages.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-[14px] text-mist">This thread isn’t open any more.</p>
        <button
          onClick={() => navigate('/app/mutuals')}
          className="mt-3 text-[14px] font-medium text-navy underline underline-offset-4"
        >
          Back to mutuals
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <header
        className="sticky top-0 z-30 flex items-center gap-3 border-b border-rule bg-paper/95 px-3 py-3 backdrop-blur md:px-6"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.7rem)' }}
      >
        <button
          onClick={() => navigate('/app/mutuals')}
          aria-label="Back to mutuals"
          className="focus-ring press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-graphite hover:bg-navy/[0.05]"
        >
          <IconBack size={20} />
        </button>
        {person && (
          <>
            <ReferencePhoto person={person} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[17px] font-semibold leading-tight text-navy">
                {person.firstName}
              </p>
              <p className="truncate text-[12.5px] text-mist">
                Mutual · {person.major}
              </p>
            </div>
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto max-w-[620px] space-y-3.5">
          <p className="pb-2 text-center text-[12.5px] leading-relaxed text-mist">
            Just the two of you. Nothing said here shows up anywhere else on Looseleaf.
          </p>

          {messages.map((m) => {
            const mine = m.from === 'me' || m.from === state.session.userId
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 sm:max-w-[62%] ${
                    mine
                      ? 'rounded-br-md border border-notebook/45 bg-notebook-soft text-navy'
                      : 'rounded-bl-md border border-rule bg-cream text-navy'
                  }`}
                >
                  <p className="text-[15px] leading-relaxed">{m.text}</p>
                  <Card card={m.card} />
                  <p className={`mt-1 text-[11px] tabular-nums text-mist ${mine ? 'text-right' : ''}`}>
                    {time(m.at)}
                  </p>
                </div>
              </div>
            )
          })}

          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={send}
        className="sticky bottom-0 border-t border-rule bg-paper/95 px-3 py-3 backdrop-blur md:px-6"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto flex max-w-[620px] items-end gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={person ? `Message ${person.firstName}` : 'Message'}
            aria-label="Message"
            className="field !rounded-full !py-3"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="press focus-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-paper disabled:opacity-40"
          >
            <IconSend size={19} />
          </button>
        </div>
      </form>
    </div>
  )
}
