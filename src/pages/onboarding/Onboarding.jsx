import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StepShell from './StepShell'
import { SelectChip, Chip } from '../../components/ui/Chip'
import Portrait, { SCENE_KEYS } from '../../components/brand/Portrait'
import Sheet from '../../components/ui/Sheet'
import { IconCheck } from '../../components/ui/Icons'
import PhotoSlot from '../../components/profile/PhotoSlot'
import { isDemo } from '../../services/backend'
import { ageFrom } from '../../services/live/profiles'
import { Star, HandHeart } from '../../components/brand/Doodles'
import { INTENTIONS, INTERESTS, PROMPT_CATEGORIES, UNIVERSITY } from '../../data/catalog'
import { useStore } from '../../state/store'

const TOTAL = 8

/* ------------------------------------------------------------- step 1 -- */

function Basics({ draft, set }) {
  const genders = ['Woman', 'Man', 'Nonbinary', 'Another way']
  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="first" className="label">
          First name
        </label>
        <input
          id="first"
          className="field"
          value={draft.firstName}
          onChange={(e) => set({ firstName: e.target.value })}
          placeholder="Alex"
          autoFocus
        />
        <p className="mt-2 px-1 text-[12.5px] text-mist">This is what people see. Last names stay off Looseleaf.</p>
      </div>

      <div>
        <label htmlFor="bday" className="label">
          Birthday
        </label>
        <input
          id="bday"
          type="date"
          className="field"
          value={draft.birthday}
          onChange={(e) => set({ birthday: e.target.value })}
        />
        <p className="mt-2 px-1 text-[12.5px] text-mist">We show your age, never your birthday.</p>
      </div>

      <div>
        <span className="label">Gender</span>
        <div className="flex flex-wrap gap-2">
          {genders.map((g) => (
            <SelectChip key={g} selected={draft.gender === g} onClick={() => set({ gender: g })}>
              {g}
            </SelectChip>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="pronouns" className="label">
          Pronouns <span className="font-normal text-mist">· optional</span>
        </label>
        <input
          id="pronouns"
          className="field"
          value={draft.pronouns}
          onChange={(e) => set({ pronouns: e.target.value })}
          placeholder="he/him"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- step 2 -- */

function Preferences({ draft, set }) {
  const options = [
    { id: 'women', label: 'Women' },
    { id: 'men', label: 'Men' },
    { id: 'nonbinary', label: 'Nonbinary people' },
    { id: 'everyone', label: 'Everyone' },
  ]
  const toggle = (id) => {
    if (id === 'everyone') return set({ interestedIn: ['everyone'] })
    const current = draft.interestedIn.filter((x) => x !== 'everyone')
    set({
      interestedIn: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <span className="label">Show me</span>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <SelectChip key={o.id} selected={draft.interestedIn.includes(o.id)} onClick={() => toggle(o.id)}>
              {o.label}
            </SelectChip>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <span className="label !mb-0">Age range</span>
          <span className="font-display text-[17px] font-semibold tabular-nums text-navy">
            {draft.ageRange[0]} – {draft.ageRange[1]}
          </span>
        </div>
        <div className="space-y-3 rounded-card border border-rule bg-white px-5 py-5">
          <div>
            <label htmlFor="min-age" className="mb-1.5 block text-[12.5px] text-mist">
              Minimum
            </label>
            <input
              id="min-age"
              type="range"
              min="18"
              max="30"
              value={draft.ageRange[0]}
              onChange={(e) =>
                set({ ageRange: [Math.min(+e.target.value, draft.ageRange[1] - 1), draft.ageRange[1]] })
              }
              className="w-full accent-coral"
            />
          </div>
          <div>
            <label htmlFor="max-age" className="mb-1.5 block text-[12.5px] text-mist">
              Maximum
            </label>
            <input
              id="max-age"
              type="range"
              min="18"
              max="30"
              value={draft.ageRange[1]}
              onChange={(e) =>
                set({ ageRange: [draft.ageRange[0], Math.max(+e.target.value, draft.ageRange[0] + 1)] })
              }
              className="w-full accent-coral"
            />
          </div>
        </div>
        <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-mist">
          Preferences are free here, and always will be. Nobody can pay to slip past them.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- step 3 -- */

function Intentions({ draft, set }) {
  const toggle = (id) =>
    set({
      intentions: draft.intentions.includes(id)
        ? draft.intentions.filter((x) => x !== id)
        : [...draft.intentions, id].slice(-3),
    })

  return (
    <div className="grid gap-3">
      {INTENTIONS.map((i) => {
        const selected = draft.intentions.includes(i.id)
        return (
          <button
            key={i.id}
            type="button"
            onClick={() => toggle(i.id)}
            aria-pressed={selected}
            className={`press focus-ring flex items-center gap-4 rounded-card border px-5 py-5 text-left transition-all ${
              selected
                ? 'border-coral bg-coral-wash shadow-[0_10px_24px_-16px_rgba(255,100,104,0.8)]'
                : 'border-rule bg-white hover:border-navy/20'
            }`}
          >
            <span className="text-[26px] leading-none" aria-hidden="true">
              {i.emoji}
            </span>
            <span className="flex-1">
              <span className="block font-display text-[19px] font-semibold leading-tight">{i.label}</span>
              <span className="mt-1 block text-[13.5px] text-graphite">{i.blurb}</span>
            </span>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${
                selected ? 'border-coral bg-coral text-white' : 'border-navy/15'
              }`}
            >
              {selected && <IconCheck size={14} />}
            </span>
          </button>
        )
      })}
      <p className="px-1 text-[12.5px] text-mist">Pick up to three. You can change this whenever.</p>
    </div>
  )
}

/* ------------------------------------------------------------- step 4 -- */

function CampusLife({ draft, set }) {
  const years = ['26', '27', '28', '29', '30']
  return (
    <div className="space-y-6">
      <div>
        <span className="label">Graduation year</span>
        <div className="flex flex-wrap gap-2">
          {years.map((y) => (
            <SelectChip key={y} selected={draft.gradYear === y} onClick={() => set({ gradYear: y })}>
              ’{y}
            </SelectChip>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="major" className="label">
          Major
        </label>
        <input
          id="major"
          className="field"
          value={draft.major}
          onChange={(e) => set({ major: e.target.value })}
          placeholder="Mechanical Engineering"
        />
      </div>

      <div>
        <label htmlFor="minor" className="label">
          Minor <span className="font-normal text-mist">· optional</span>
        </label>
        <input
          id="minor"
          className="field"
          value={draft.minor}
          onChange={(e) => set({ minor: e.target.value })}
        />
      </div>

      <div>
        <span className="label">Where you’re mostly around</span>
        <div className="flex flex-wrap gap-2">
          {UNIVERSITY.areas.map((a) => (
            <SelectChip key={a} selected={draft.area === a} onClick={() => set({ area: a })}>
              {a}
            </SelectChip>
          ))}
        </div>
        <p className="mt-2.5 px-1 text-[12.5px] leading-relaxed text-mist">
          Broad areas only. Looseleaf never asks where you live or shows your location.
        </p>
      </div>

      <div>
        <label htmlFor="orgs" className="label">
          Clubs, teams, anything you’re part of <span className="font-normal text-mist">· optional</span>
        </label>
        <input
          id="orgs"
          className="field"
          value={draft.orgsText}
          onChange={(e) => set({ orgsText: e.target.value })}
          placeholder="Solar Car, intramural soccer"
        />
        <p className="mt-2 px-1 text-[12.5px] text-mist">Greek life is optional here, and always will be.</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- step 5 -- */

const PHOTO_HINTS = [
  'Show your face',
  'Show something you love',
  'Show your life',
  'One that starts a conversation',
  'Anything',
  'Anything',
]

function Photos({ draft, set }) {
  const [picking, setPicking] = useState(null)

  const write = (i, value) => {
    const photos = [...draft.photos]
    photos[i] = value
    set({ photos })
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <PhotoSlot
            key={i}
            index={i}
            photo={draft.photos[i]}
            hint={PHOTO_HINTS[i]}
            onPick={setPicking}
            onChoose={write}
            onRemove={(idx) => write(idx, null)}
          />
        ))}
      </div>

      <p className="mt-5 rounded-2xl border border-rule bg-cream/70 px-4 py-3.5 text-[13px] leading-relaxed text-graphite">
        {isDemo
          ? 'Four is plenty, six is the max. No completion percentage, no nagging \u2014 this is a profile, not a form.'
          : 'Four is plenty, six is the max. Photos upload when you finish, and only people on your campus can see them.'}
      </p>

      <Sheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        title="Pick an illustration"
        subtitle="Demo build \u2014 real photo uploads land here."
      >
        <div className="grid grid-cols-3 gap-2.5">
          {['portrait', ...SCENE_KEYS].map((scene) => (
            <button
              key={scene}
              type="button"
              onClick={() => {
                write(picking, { scene })
                setPicking(null)
              }}
              className="focus-ring aspect-square overflow-hidden rounded-2xl border border-rule transition hover:scale-[1.03]"
            >
              <Portrait id={`me-${picking}`} scene={scene} rounded="rounded-2xl" />
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}

/* ------------------------------------------------------------- step 6 -- */

function Prompts({ draft, set }) {
  const [editing, setEditing] = useState(null) // index
  const [category, setCategory] = useState(PROMPT_CATEGORIES[0].id)

  const choose = (text) => {
    const prompts = [...draft.prompts]
    prompts[editing] = { q: text, a: prompts[editing]?.a ?? '' }
    set({ prompts })
    setEditing(null)
  }

  const answer = (i, a) => {
    const prompts = [...draft.prompts]
    prompts[i] = { ...prompts[i], a }
    set({ prompts })
  }

  const active = PROMPT_CATEGORIES.find((c) => c.id === category)

  return (
    <>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => {
          const prompt = draft.prompts[i]
          return (
            <div key={i} className="relative overflow-hidden rounded-card border border-rule bg-white px-5 py-4">
              <span className="pointer-events-none absolute inset-y-0 left-3 w-px bg-margin/25" aria-hidden="true" />
              <div className="pl-3">
                <button
                  type="button"
                  onClick={() => setEditing(i)}
                  className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg text-left"
                >
                  <span
                    className={`text-[13px] font-medium uppercase tracking-[0.06em] ${
                      prompt ? 'text-mist' : 'text-coral-deep'
                    }`}
                  >
                    {prompt ? prompt.q : `Choose prompt ${i + 1}`}
                  </span>
                  <span className="shrink-0 text-[12.5px] font-medium text-graphite underline underline-offset-4">
                    {prompt ? 'Change' : 'Browse'}
                  </span>
                </button>

                {prompt && (
                  <textarea
                    rows={2}
                    value={prompt.a}
                    onChange={(e) => answer(i, e.target.value)}
                    placeholder="Answer it like you'd say it out loud…"
                    className="mt-2 w-full resize-none border-0 bg-transparent p-0 font-display text-[18px] leading-snug text-navy placeholder:font-sans placeholder:text-[15px] placeholder:text-mist focus:outline-none"
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-5 px-1 text-[13px] leading-relaxed text-mist">
        Three answers. These get liked more than photos do — people reply to something you actually said.
      </p>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Pick a prompt" maxWidth="max-w-lg">
        <div className="hide-scrollbar -mx-6 mb-4 flex gap-2 overflow-x-auto px-6 pb-1">
          {PROMPT_CATEGORIES.map((c) => (
            <SelectChip key={c.id} selected={category === c.id} onClick={() => setCategory(c.id)} className="shrink-0 !py-2 !text-[13px]">
              {c.label}
            </SelectChip>
          ))}
        </div>
        <ul className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
          {active.prompts.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => choose(p)}
                className="focus-ring w-full rounded-2xl border border-rule bg-white px-4 py-3.5 text-left font-display text-[16px] leading-snug text-navy transition hover:border-coral/40 hover:bg-coral-wash/50"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}

/* ------------------------------------------------------------- step 7 -- */

function Interests({ draft, set }) {
  const toggle = (id) =>
    set({
      interests: draft.interests.includes(id)
        ? draft.interests.filter((x) => x !== id)
        : [...draft.interests, id],
    })

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {INTERESTS.map((i) => (
          <SelectChip key={i.id} selected={draft.interests.includes(i.id)} onClick={() => toggle(i.id)}>
            <span aria-hidden="true">{i.emoji}</span>
            {i.label}
          </SelectChip>
        ))}
      </div>
      <p className="mt-6 flex items-center gap-2 px-1 text-[13px] text-mist">
        <HandHeart size={15} className="text-coral" />
        {draft.interests.length} picked — shared ones get highlighted on profiles.
      </p>
    </>
  )
}

/* ------------------------------------------------------------- step 8 -- */

function Review({ draft }) {
  // If the photo can't be shown for any reason, this falls back to the
  // illustration. A broken-image icon on the last screen of onboarding reads
  // as "your photo didn't save", which isn't even true — the upload happens
  // when you press Finish.
  const [imageFailed, setImageFailed] = useState(false)
  const first = draft.photos[0]
  const src = first?.previewUrl ?? first?.url ?? null

  return (
    <div className="relative text-center">
      <Star className="absolute left-4 -top-2 animate-twinkle text-coral" size={16} />
      <Star className="absolute right-8 top-4 animate-twinkle text-margin [animation-delay:500ms]" size={13} />

      <div className="mx-auto w-[190px] rotate-[-3deg] rounded-card border border-rule bg-white p-3 shadow-lift">
        <div className="aspect-[4/5] overflow-hidden rounded-xl">
          {src && !imageFailed ? (
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Portrait id="me-0" scene={first?.scene ?? 'portrait'} rounded="rounded-xl" />
          )}
        </div>
        <p className="mt-3 font-display text-[18px] font-semibold">{draft.firstName || 'You'}</p>
        <p className="text-[12.5px] text-mist">
          {draft.major || 'Undeclared'} ’{draft.gradYear}
        </p>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Chip tone="cream">{draft.photos.filter(Boolean).length} photos</Chip>
        <Chip tone="cream">{draft.prompts.filter((p) => p?.a?.trim()).length} answers</Chip>
        <Chip tone="cream">{draft.interests.length} interests</Chip>
      </div>

      <p className="mx-auto mt-8 max-w-[38ch] text-[15px] leading-relaxed text-graphite">
        That’s it. You can edit any of this later, and pause the whole thing whenever you want.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- driver -- */

export default function Onboarding() {
  const { state, actions } = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(null)
  const [saveError, setSaveError] = useState('')

  // In live mode there is no profile yet, so everything starts empty.
  const me = state.me ?? {}

  const [draft, setDraft] = useState({
    firstName: me.firstName ?? '',
    birthday: '',
    gender: '',
    pronouns: me.pronouns ?? '',
    interestedIn: me.prefs?.interestedIn ?? [],
    ageRange: me.prefs?.ageRange ?? [18, 24],
    intentions: me.intention ? [me.intention] : [],
    gradYear: me.gradYear ?? '',
    major: me.major ?? '',
    minor: me.minor ?? '',
    area: me.area ?? '',
    orgsText: (me.orgs ?? []).join(', '),
    photos: me.photos ?? [],
    prompts: me.prompts ?? [],
    interests: me.interests ?? [],
  })

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const next = () => setStep((s) => Math.min(TOTAL, s + 1))
  const back = () => (step === 1 ? navigate('/verify') : setStep((s) => s - 1))

  /**
   * The blob URLs behind the photo previews belong to the *draft*, which
   * outlives the photos step, so they are released here and nowhere else.
   *
   * They used to be released by PhotoSlot when it unmounted — which is the
   * moment you press Continue. By the time you reached "here's how you look"
   * the URL on the card had already been revoked, so it rendered a broken
   * image every single time, for every format. A slot is the wrong owner for
   * something the draft still points at.
   */
  const photosRef = useRef(draft.photos)
  photosRef.current = draft.photos
  useEffect(
    () => () => {
      for (const p of photosRef.current ?? []) {
        if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl)
      }
    },
    []
  )

  const finish = async () => {
    setSaveError('')
    setSaving('Saving')
    try {
      await actions.finishOnboarding(draft, { onProgress: setSaving })
      navigate(isDemo ? '/app/discover' : '/waitlist')
    } catch (err) {
      setSaveError(err.message)
      setSaving(null)
    }
  }

  const steps = {
    1: {
      title: 'What should people call you?',
      subtitle: 'The basics, and then we’ll get to the interesting part.',
      node: <Basics draft={draft} set={set} />,
      // Birthday is required in live mode — age is stored on the profile and
      // Looseleaf is 18+.
      can:
        draft.firstName.trim().length > 0 &&
        !!draft.gender &&
        (isDemo || (!!draft.birthday && ageFrom(draft.birthday) >= 18)),
    },
    2: {
      title: 'Who are you hoping to meet?',
      subtitle: 'You can change any of this later without losing anything.',
      node: <Preferences draft={draft} set={set} />,
      can: draft.interestedIn.length > 0,
    },
    3: {
      title: 'What are you looking for?',
      subtitle: 'Being honest here makes everything downstream better.',
      node: <Intentions draft={draft} set={set} />,
      can: draft.intentions.length > 0,
    },
    4: {
      title: 'Campus life',
      subtitle: 'Just enough that someone could place you.',
      node: <CampusLife draft={draft} set={set} />,
      can: !!draft.gradYear && draft.major.trim().length > 0,
    },
    5: {
      title: 'Add a few photos',
      subtitle: 'Variety beats perfection. One face, one thing you love, one bit of your life.',
      node: <Photos draft={draft} set={set} />,
      can: draft.photos.filter(Boolean).length >= 2,
    },
    6: {
      title: 'Answer three prompts',
      subtitle: 'This is the part people actually read.',
      node: <Prompts draft={draft} set={set} />,
      can: draft.prompts.filter((p) => p?.q && p?.a?.trim()).length >= 1,
    },
    7: {
      title: 'What are you into?',
      subtitle: 'Pick whatever’s true. Shared interests show up as overlap.',
      node: <Interests draft={draft} set={set} />,
      can: draft.interests.length >= 3,
    },
    8: {
      title: 'Here’s how you look.',
      subtitle: null,
      node: <Review draft={draft} />,
      can: true,
    },
  }

  const current = steps[step]

  return (
    <StepShell
      step={step}
      total={TOTAL}
      title={current.title}
      subtitle={current.subtitle}
      onBack={back}
      onNext={step === TOTAL ? finish : next}
      canContinue={current.can && !saving}
      nextLabel={
        step === TOTAL ? (saving ? `${saving}…` : isDemo ? 'Meet your campus' : 'Finish') : 'Continue'
      }
      skip={step === 4 || step === 7 ? { label: 'Skip', onClick: next } : null}
    >
      {current.node}
      {saveError && (
        <p className="mt-6 rounded-2xl bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
          {saveError}
        </p>
      )}
    </StepShell>
  )
}
