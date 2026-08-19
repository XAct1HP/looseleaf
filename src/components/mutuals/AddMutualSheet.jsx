import { useState } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import PersonReference from './PersonReference'
import { IconCheck, IconSearch } from '../ui/Icons'
import * as mutuals from '../../services/mutuals'

/**
 * Add a mutual.
 *
 * Two fields, both required, both matched exactly. There is no results page
 * before you type, no suggestions while you type, and no near misses after —
 * if you get the major wrong you get nothing, which is the correct answer for
 * someone you don't actually know. Everyone who uses Looseleaf is entitled to
 * not be browsable.
 */
export default function AddMutualSheet({ open, onClose, onAdded }) {
  const [form, setForm] = useState({ firstName: '', major: '' })
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [asked, setAsked] = useState([])

  const ready = form.firstName.trim().length >= 2 && form.major.trim().length >= 3

  const close = () => {
    setForm({ firstName: '', major: '' })
    setResults(null)
    setError('')
    setAsked([])
    onClose()
  }

  const run = async (e) => {
    e?.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      setResults(await mutuals.search(form.firstName, form.major))
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setBusy(false)
    }
  }

  const add = async (person) => {
    try {
      await mutuals.request(person.id)
      setAsked((a) => [...a, person.id])
      onAdded?.(person)
    } catch (err) {
      setError(err.message)
    }
  }

  const label = (person) => {
    if (asked.includes(person.id)) return 'asked'
    if (person.state === 'connected') return 'connected'
    if (person.state === 'sent') return 'asked'
    if (person.state === 'incoming') return 'incoming'
    return 'none'
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Add a mutual"
      subtitle="You’ll need their first name and their major. Both, exactly — there’s no list to browse."
      maxWidth="max-w-lg"
    >
      <form onSubmit={run} className="space-y-4">
        <div>
          <label htmlFor="mu-name" className="label">
            First name
          </label>
          <input
            id="mu-name"
            className="field"
            autoComplete="off"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            placeholder="Ben"
          />
        </div>
        <div>
          <label htmlFor="mu-major" className="label">
            Their major
          </label>
          <input
            id="mu-major"
            className="field"
            autoComplete="off"
            value={form.major}
            onChange={(e) => setForm({ ...form, major: e.target.value })}
            placeholder="Information Science"
          />
        </div>

        <Button type="submit" variant="primary" size="lg" full disabled={!ready || busy}>
          <IconSearch size={17} />
          {busy ? 'Looking…' : 'Look them up'}
        </Button>
      </form>

      {error && (
        <p className="mt-4 rounded-xl bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">{error}</p>
      )}

      {results && results.length === 0 && (
        <div className="mt-5 rounded-card border border-dashed border-rule bg-cream/50 px-5 py-6 text-center">
          <p className="font-display text-[17px] font-semibold text-navy">Nobody by that name and major.</p>
          <p className="mx-auto mt-1.5 max-w-[36ch] text-[13.5px] leading-relaxed text-graphite">
            Either they’re not on Looseleaf yet, or the major isn’t written the way they wrote it. It has to
            match — that’s what keeps this from being a way to browse strangers.
          </p>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="mt-5">
          <p className="mb-2.5 text-[12.5px] text-mist">
            {results.length === 1
              ? 'One person matches. Tap the photo to be sure.'
              : `${results.length} people match. Tap a photo to check you’ve got the right one.`}
          </p>
          <ul className="space-y-2.5">
            {results.map((person) => {
              const state = label(person)
              return (
                <li key={person.id}>
                  <PersonReference
                    person={person}
                    action={
                      state === 'connected' ? (
                        <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-moss">
                          <IconCheck size={15} />
                          Mutual
                        </span>
                      ) : state === 'asked' ? (
                        <span className="shrink-0 text-[13px] font-medium text-mist">Asked</span>
                      ) : (
                        <Button size="sm" variant="coral" onClick={() => add(person)}>
                          {state === 'incoming' ? 'Accept' : 'Add mutual'}
                        </Button>
                      )
                    }
                  />
                </li>
              )
            })}
          </ul>
          <p className="mt-4 rounded-2xl bg-cream/70 px-4 py-3 text-[12.5px] leading-relaxed text-graphite">
            Nothing happens until they say yes. Until then they’re the only other person who knows you asked.
          </p>
        </div>
      )}
    </Sheet>
  )
}
