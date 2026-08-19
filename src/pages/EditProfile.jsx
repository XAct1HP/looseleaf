import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Portrait, { SCENE_KEYS } from '../components/brand/Portrait'
import Button from '../components/ui/Button'
import Sheet from '../components/ui/Sheet'
import { SelectChip } from '../components/ui/Chip'
import { IconBack } from '../components/ui/Icons'
import PhotoSlot from '../components/profile/PhotoSlot'
import { INTENTIONS, INTERESTS, PROMPT_CATEGORIES, UNIVERSITY } from '../data/catalog'
import { useStore } from '../state/store'
import { Underline } from '../components/brand/Doodles'

function Block({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-card border border-rule bg-white px-6 py-5">
      <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">{title}</h2>
      {children}
    </section>
  )
}

export default function EditProfile() {
  const { state, actions } = useStore()
  const navigate = useNavigate()
  const [draft, setDraft] = useState({ ...state.me, orgsText: (state.me.orgs ?? []).join(', ') })
  const [picking, setPicking] = useState(null)
  const [promptFor, setPromptFor] = useState(null)
  const [category, setCategory] = useState(PROMPT_CATEGORIES[0].id)

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const save = () => {
    const { orgsText, ...rest } = draft
    actions.updateMe({ ...rest, orgs: orgsText.split(',').map((s) => s.trim()).filter(Boolean) })
    actions.showToast('Profile saved.')
    navigate('/app/profile')
  }

  const setSlot = (i, value) => {
    const photos = [...(draft.photos ?? [])]
    if (value) photos[i] = typeof value === 'string' ? { scene: value } : value
    else photos.splice(i, 1)
    set({ photos })
    setPicking(null)
  }

  const activeCat = PROMPT_CATEGORIES.find((c) => c.id === category)

  return (
    <>
      <button
        onClick={() => navigate('/app/profile')}
        className="press focus-ring -ml-2 mb-4 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[14px] font-medium text-graphite hover:text-navy"
      >
        <IconBack size={18} />
        Profile
      </button>

      <h1 className="relative mb-7 inline-block font-display text-[28px] font-semibold leading-tight tracking-[-0.02em]">
        Edit profile
        <Underline className="absolute -bottom-1.5 left-0 text-coral/60" width={150} />
      </h1>

      <div className="space-y-4 pb-24">
        <Block id="photos" title="Photos">
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <PhotoSlot
                key={i}
                index={i}
                photo={draft.photos?.[i]}
                hint="Add"
                onPick={setPicking}
                onChoose={(idx, value) => setSlot(idx, value)}
                onRemove={(idx) => setSlot(idx, null)}
              />
            ))}
          </div>
        </Block>

        <Block id="prompts" title="Prompts">
          <ul className="space-y-3">
            {[0, 1, 2].map((i) => {
              const p = draft.prompts?.[i]
              return (
                <li key={i} className="relative rounded-2xl border border-rule px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setPromptFor(i)}
                    className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg text-left"
                  >
                    <span className={`text-[12px] font-medium uppercase tracking-[0.06em] ${p ? 'text-mist' : 'text-coral-deep'}`}>
                      {p ? p.q : `Choose prompt ${i + 1}`}
                    </span>
                    <span className="shrink-0 text-[12.5px] font-medium text-graphite underline underline-offset-4">
                      Change
                    </span>
                  </button>
                  <textarea
                    rows={2}
                    value={p?.a ?? ''}
                    onChange={(e) => {
                      const prompts = [...(draft.prompts ?? [])]
                      prompts[i] = { q: prompts[i]?.q ?? 'My perfect Sunday...', a: e.target.value }
                      set({ prompts })
                    }}
                    placeholder="Answer it like you’d say it out loud…"
                    className="mt-1.5 w-full resize-none border-0 bg-transparent p-0 font-display text-[17px] leading-snug text-navy placeholder:font-sans placeholder:text-[14.5px] placeholder:text-mist focus:outline-none"
                  />
                </li>
              )
            })}
          </ul>
        </Block>

        <Block id="intention" title="Looking for">
          <div className="flex flex-wrap gap-2">
            {INTENTIONS.map((i) => (
              <SelectChip key={i.id} selected={draft.intention === i.id} onClick={() => set({ intention: i.id })}>
                <span aria-hidden="true">{i.emoji}</span>
                {i.label}
              </SelectChip>
            ))}
          </div>
        </Block>

        <Block id="interests" title="Interests">
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <SelectChip
                key={i.id}
                selected={draft.interests?.includes(i.id)}
                onClick={() =>
                  set({
                    interests: draft.interests?.includes(i.id)
                      ? draft.interests.filter((x) => x !== i.id)
                      : [...(draft.interests ?? []), i.id],
                  })
                }
              >
                <span aria-hidden="true">{i.emoji}</span>
                {i.label}
              </SelectChip>
            ))}
          </div>
        </Block>

        <Block id="campus" title="Campus life">
          <div className="space-y-4">
            <div>
              <label htmlFor="e-major" className="label">
                Major
              </label>
              <input id="e-major" className="field" value={draft.major} onChange={(e) => set({ major: e.target.value })} />
            </div>
            <div>
              <label htmlFor="e-minor" className="label">
                Minor
              </label>
              <input id="e-minor" className="field" value={draft.minor ?? ''} onChange={(e) => set({ minor: e.target.value })} />
            </div>
            <div>
              <span className="label">Graduation year</span>
              <div className="flex flex-wrap gap-2">
                {['26', '27', '28', '29', '30'].map((y) => (
                  <SelectChip key={y} selected={draft.gradYear === y} onClick={() => set({ gradYear: y })}>
                    ’{y}
                  </SelectChip>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Around</span>
              <div className="flex flex-wrap gap-2">
                {UNIVERSITY.areas.map((a) => (
                  <SelectChip key={a} selected={draft.area === a} onClick={() => set({ area: a })}>
                    {a}
                  </SelectChip>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="e-orgs" className="label">
                Clubs and teams
              </label>
              <input
                id="e-orgs"
                className="field"
                value={draft.orgsText}
                onChange={(e) => set({ orgsText: e.target.value })}
                placeholder="Solar Car, intramural soccer"
              />
            </div>
          </div>
        </Block>
      </div>

      <div className="sticky bottom-[70px] -mx-4 border-t border-rule bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0 md:-mx-8 md:px-8">
        <div className="flex gap-2">
          <Button variant="ghost" size="lg" onClick={() => navigate('/app/profile')}>
            Cancel
          </Button>
          <Button variant="coral" size="lg" full onClick={save}>
            Save changes
          </Button>
        </div>
      </div>

      <Sheet open={picking !== null} onClose={() => setPicking(null)} title="Pick an illustration">
        <div className="grid grid-cols-3 gap-2.5">
          {['portrait', ...SCENE_KEYS].map((scene) => (
            <button
              key={scene}
              type="button"
              onClick={() => setSlot(picking, scene)}
              className="focus-ring aspect-square overflow-hidden rounded-2xl border border-rule transition hover:scale-[1.03]"
            >
              <Portrait id={`me-${picking}`} scene={scene} rounded="rounded-2xl" />
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={promptFor !== null} onClose={() => setPromptFor(null)} title="Pick a prompt" maxWidth="max-w-lg">
        <div className="hide-scrollbar -mx-6 mb-4 flex gap-2 overflow-x-auto px-6 pb-1">
          {PROMPT_CATEGORIES.map((c) => (
            <SelectChip
              key={c.id}
              selected={category === c.id}
              onClick={() => setCategory(c.id)}
              className="shrink-0 !py-2 !text-[13px]"
            >
              {c.label}
            </SelectChip>
          ))}
        </div>
        <ul className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
          {activeCat.prompts.map((text) => (
            <li key={text}>
              <button
                type="button"
                onClick={() => {
                  const prompts = [...(draft.prompts ?? [])]
                  prompts[promptFor] = { q: text, a: prompts[promptFor]?.a ?? '' }
                  set({ prompts })
                  setPromptFor(null)
                }}
                className="focus-ring w-full rounded-2xl border border-rule bg-white px-4 py-3.5 text-left font-display text-[16px] leading-snug text-navy transition hover:border-coral/40 hover:bg-coral-wash/50"
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
