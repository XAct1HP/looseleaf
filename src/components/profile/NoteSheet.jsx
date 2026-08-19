import { useEffect, useState } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import { HandHeart } from '../brand/Doodles'

/**
 * "Leave a note?" — the single moment that turns a like into a conversation.
 * A note is optional. Never required, never rationed.
 */
export default function NoteSheet({ open, person, quote, targetLabel = 'this', onClose, onSubmit }) {
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) setNote('')
  }, [open])

  if (!person) return null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Leave a note?"
      subtitle={`${person.firstName} will see this next to ${targetLabel}.`}
    >
      {quote && (
        <div className="relative mb-4 rounded-2xl border border-rule bg-cream/70 px-4 py-3">
          <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[3px] rounded-full bg-coral/50" />
          <p className="pl-2 text-[14px] leading-relaxed text-graphite">{quote}</p>
        </div>
      )}

      <label className="sr-only" htmlFor="note">
        Your note
      </label>
      <textarea
        id="note"
        autoFocus
        rows={3}
        maxLength={220}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Say something about it…"
        className="field resize-none font-[450] leading-relaxed"
      />

      <div className="mt-1.5 flex items-center justify-between px-1">
        <span className="text-[12px] text-mist">Optional — a plain like works too.</span>
        <span className="text-[12px] tabular-nums text-mist">{note.length}/220</span>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="soft" size="lg" full onClick={() => onSubmit('')}>
          Just like it
        </Button>
        <Button variant="coral" size="lg" full disabled={!note.trim()} onClick={() => onSubmit(note.trim())}>
          <HandHeart size={17} className="text-white" />
          Send note
        </Button>
      </div>
    </Sheet>
  )
}
