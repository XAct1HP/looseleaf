import { useState } from 'react'
import { Link } from 'react-router-dom'
import SubPageHeader from '../../components/common/SubPageHeader'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import RailCard from '../../components/common/RailCard'
import Portrait from '../../components/brand/Portrait'
import { useRail } from '../../components/nav/AppLayout'
import { PEOPLE } from '../../data/people'
import { useStore } from '../../state/store'
import { IconPlus, IconCalendar } from '../../components/ui/Icons'
import { Star } from '../../components/brand/Doodles'

const EVENT_TYPES = ['Formal', 'Date party', 'Gala', 'Wedding', 'Concert', 'Game day', 'Campus event']

const INVITES = [
  {
    id: 'iv-1',
    personId: 'p-zoe',
    title: 'Engineering Formal',
    when: 'Friday · 8 PM',
    type: 'Formal',
    note: 'Looking for someone to come with me. Low pressure, good food, my friends are normal.',
  },
  {
    id: 'iv-2',
    personId: 'p-noah',
    title: 'Jazz ensemble showcase',
    when: 'Next Thursday · 7 PM',
    type: 'Concert',
    note: 'I’m playing for twenty minutes and then I’m all yours.',
  },
  {
    id: 'iv-3',
    personId: 'p-tyler',
    title: 'Michigan vs Wisconsin',
    when: 'Saturday · 3:30 PM',
    type: 'Game day',
    note: 'I have an extra ticket and a very high tolerance for standing.',
  },
  {
    id: 'iv-4',
    personId: 'p-marisol',
    title: 'Cousin’s wedding, two hours away',
    when: 'Oct 18 · all day',
    type: 'Wedding',
    note: 'Genuinely just need someone fun. My family will love you more than me.',
  },
]

export default function Formals() {
  const { state, actions } = useStore()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', when: '', type: 'Formal', note: '' })

  useRail(
    <RailCard title="Keep it easy" tone="cream">
      <p className="text-[13.5px] leading-relaxed text-graphite">
        These aren’t only for Greek life. Weddings, galas, concerts, a game you have an extra ticket for — anything
        with a start time works.
      </p>
    </RailCard>,
    []
  )

  const mine = state.formals

  return (
    <>
      <SubPageHeader
        title="Need a date?"
        subtitle="Post the thing you’re going to. Someone on campus is looking for exactly that."
        action={
          <Button variant="coral" size="md" onClick={() => setCreating(true)} className="shrink-0">
            <IconPlus size={17} />
            Post yours
          </Button>
        }
      />

      {mine.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">Yours</h2>
          <ul className="space-y-3">
            {mine.map((f) => (
              <li key={f.id} className="relative rounded-card border border-coral/25 bg-coral-wash px-5 py-4">
                <Star className="absolute right-4 top-4 text-coral/50" size={14} />
                <p className="font-display text-[19px] font-semibold leading-tight">{f.title}</p>
                <p className="mt-1 text-[13.5px] text-coral-deep">
                  {f.when} · {f.type}
                </p>
                {f.note && <p className="mt-2.5 text-[14px] leading-relaxed text-graphite">{f.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-4 font-display text-[20px] font-semibold">Open invitations</h2>

      <ul className="space-y-4">
        {INVITES.map((iv) => {
          const p = PEOPLE.find((x) => x.id === iv.personId)
          if (!p) return null
          return (
            <li key={iv.id} className="lift-corner overflow-hidden rounded-card border border-rule bg-white">
              <div className="flex gap-4 p-4">
                <Link to={`/app/person/${p.id}`} className="h-[104px] w-[86px] shrink-0 overflow-hidden rounded-xl bg-cream">
                  <Portrait id={`${p.id}-0`} scene={p.photos?.[0]?.scene ?? 'portrait'} rounded="rounded-xl" />
                </Link>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-margin-soft px-2.5 py-1 text-[11.5px] font-semibold text-[#A93E7F]">
                    <IconCalendar size={12} />
                    {iv.type}
                  </span>
                  <p className="mt-2 font-display text-[18px] font-semibold leading-tight">{iv.title}</p>
                  <p className="mt-1 text-[13px] text-mist">
                    {iv.when} · {p.firstName}, {p.age} · {p.major} ’{p.gradYear}
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-graphite">{iv.note}</p>
                </div>
              </div>
              <div className="flex gap-2 border-t border-rule bg-cream/50 px-4 py-3">
                <Button variant="ghost" size="sm" to={`/app/person/${p.id}`}>
                  See {p.firstName}’s profile
                </Button>
                <Button variant="coral" size="sm" className="ml-auto">
                  I’d come to this
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="What are you going to?"
        subtitle="Keep it short. The details can come later."
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="f-title" className="label">
              Event
            </label>
            <input
              id="f-title"
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Engineering Formal"
            />
          </div>
          <div>
            <label htmlFor="f-when" className="label">
              When
            </label>
            <input
              id="f-when"
              className="field"
              value={form.when}
              onChange={(e) => setForm({ ...form, when: e.target.value })}
              placeholder="Friday · 8 PM"
            />
          </div>
          <div>
            <span className="label">Type</span>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  className={`press focus-ring rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition ${
                    form.type === t ? 'border-navy bg-navy text-paper' : 'border-rule bg-white text-graphite'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="f-note" className="label">
              Anything else <span className="font-normal text-mist">· optional</span>
            </label>
            <textarea
              id="f-note"
              rows={3}
              className="field resize-none"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Looking for someone to come with me."
            />
          </div>
        </div>

        <Button
          variant="coral"
          size="lg"
          full
          className="mt-6"
          disabled={!form.title.trim() || !form.when.trim()}
          onClick={() => {
            actions.createFormal(form)
            setForm({ title: '', when: '', type: 'Formal', note: '' })
            setCreating(false)
          }}
        >
          Post it
        </Button>
      </Sheet>
    </>
  )
}
