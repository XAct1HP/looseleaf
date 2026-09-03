import { useState } from 'react'
import Button from '../ui/Button'
import * as events from '../../services/liveEvents'

/**
 * ── Yes, no, and a note nobody else reads ───────────────────────────────────
 *
 * Three design rules, all of which are about the person being voted on:
 *
 * **A no is as easy as a yes.** Same size, same weight, same position every
 * time. If "no" is smaller or greyer, saying it feels like a verdict, and the
 * result is a room full of polite yeses that make the matches worthless.
 *
 * **Nothing is ever shown to the other person.** A no is invisible forever —
 * not to them, not to the host, not in any count. Only a mutual yes surfaces,
 * and only when the host reveals. That is enforced in the database, but it is
 * said here because the person tapping needs to know it.
 *
 * **The note is for you.** It's the whole feature for an event with matching
 * switched off — a club recruiting wants "talk to Devon again", not a match.
 *
 * Reporting sits on this card because this is the moment somebody has just
 * had a bad four minutes and is holding their phone. Anywhere else is too far
 * away.
 */
export default function VoteCard({ pending, accent, notesEnabled, token, onDone }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cast = async (yes) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await events.vote(pending.pairing_id, yes, notesEnabled ? note : null, token)
      await onDone()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 rounded-card border border-rule bg-white p-5">
      <p className="text-[13px] text-mist">You just met</p>
      <h2 className="mt-1 font-display text-[28px] font-semibold leading-tight">{pending.name}</h2>

      <p className="mt-3 text-[14px] leading-relaxed text-graphite">
        Would you like to talk to them again? They only ever find out if you both say yes.
      </p>

      {notesEnabled && (
        <>
          <label htmlFor="vote-note" className="label mt-5">
            A note for yourself
          </label>
          <input
            id="vote-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={220}
            placeholder="green jacket, climbs"
            className="field"
          />
          <p className="mt-1.5 text-[12px] text-mist">Only you ever see this.</p>
        </>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      {/*  Equal weight, deliberately — and this is the second attempt at it.
           The first version made Yes a filled coral button next to an outlined
           No, which is the standard primary/secondary pairing and is exactly
           wrong here: it puts a thumb on the scale in a room where the polite
           answer is already yes. A card that collects polite yeses produces
           matches that mean nothing, which is worse for everybody than an
           honest no.

           So both are the same shape, the same size and the same weight. Yes
           is identifiable by the host's accent on its border and label, not by
           being louder. */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" size="lg" onClick={() => cast(false)} disabled={busy}>
          No
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => cast(true)}
          disabled={busy}
          style={{ borderColor: accent.ink, color: accent.ink }}
        >
          Yes
        </Button>
      </div>

      <a
        href="mailto:safety@hellolooseleaf.com"
        className="mt-5 block text-center text-[12.5px] text-mist underline underline-offset-4"
      >
        Something went wrong at that table
      </a>
    </div>
  )
}
