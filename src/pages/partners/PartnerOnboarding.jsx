import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import PartnerShell from '../../components/partners/PartnerShell'
import DateSpotCard from '../../components/dates/DateSpotCard'
import Button from '../../components/ui/Button'
import { Field, TextInput, TextArea, Select, TagPicker, PricePicker, PhotoSlot, HoursEditor, DayPicker, MoneyInput } from '../../components/partners/fields'
import { IconCheck, IconBack } from '../../components/ui/Icons'
import { Underline } from '../../components/brand/Doodles'
import * as partners from '../../services/partners'
import * as media from '../../services/live/partnerMedia'
import { usePartnerAccount } from '../../state/partnerAccount'
import { PARTNER_CATEGORIES, DATE_TYPE_TAGS, VIBE_TAGS, daysText } from '../../data/partnerCatalog'
import { fee } from '../../lib/partnerBilling'
import { geocode } from '../../lib/geocode'
import { PartnerOffline } from './PartnerAuth'

/**
 * ── Getting a business onto Loose Leaf ──────────────────────────────────────
 *
 * Seven steps, and there is no longer a payment one. Under pay-per-redemption
 * there is nothing to sell at signup: joining is free, being listed is free,
 * and the first time money is mentioned is when a business decides to turn on
 * Date Passes — which is a decision worth making with the dashboard open, not
 * halfway through describing your hours.
 *
 * What that removes is the biggest drop-off point this flow had. What used to
 * be the "Plan" step is now a plain statement of the terms on the review
 * screen, because somebody should still finish this knowing exactly what
 * Loose Leaf will and won't charge them for.
 *
 * Each step saves as it goes. Closing the laptop halfway through loses the
 * step you were on, not the four before it.
 */

const STEPS = [
  { id: 'business', label: 'Business' },
  { id: 'location', label: 'Location' },
  { id: 'profile', label: 'Date profile' },
  { id: 'media', label: 'Photos' },
  { id: 'hours', label: 'Hours' },
  { id: 'offer', label: 'Offer' },
  { id: 'review', label: 'Review' },
]

const emptyDraft = {
  fullName: '',
  businessName: '',
  category: '',
  description: '',
  website: '',
  phone: '',
  addressLine: '',
  city: '',
  region: '',
  postalCode: '',
  walkMinutes: '',
  distanceMiles: '',
  priceLevel: null,
  dateTypes: [],
  vibes: [],
  note: '',
  logoPath: null,
  coverPath: null,
  hours: {},
  offer: null,
}

export default function PartnerOnboarding() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { refresh, partner: existing, status } = usePartnerAccount()

  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(() => ({
    ...emptyDraft,
    fullName: readStashedName(),
  }))
  const [partnerId, setPartnerId] = useState(null)
  const [locationId, setLocationId] = useState(null)
  const [feeCents, setFeeCents] = useState(150)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(null)
  const [invites, setInvites] = useState(null)

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  useEffect(() => {
    partners
      .pricing()
      .then((p) => setFeeCents(p.feeCents))
      .catch(() => {})
  }, [])

  // Somebody who was *invited* to an existing business must not be marched
  // through "describe your restaurant" — they don't own one. Checked before
  // the form renders, so they never see a step they'd have to back out of.
  // Waits for the session, because asking "what am I invited to" as nobody
  // returns nothing and would send an invitee into the wrong flow.
  useEffect(() => {
    if (!partners.partnersEnabled || status === 'loading' || status === 'anon') return
    partners
      .myInvites()
      .then(setInvites)
      .catch(() => setInvites([]))
  }, [status])

  // Someone who already has a business shouldn't be filling this in again.
  useEffect(() => {
    if (existing && !partnerId && params.get('again') !== '1') {
      navigate('/partners/dashboard', { replace: true })
    }
  }, [existing, partnerId, params, navigate])

  const current = STEPS[step]

  const previewSpot = {
    id: partnerId ?? 'preview',
    coverPath: draft.coverPath,
    name: draft.businessName || 'Your place',
    kind: PARTNER_CATEGORIES.find((c) => c.id === draft.category)?.label || 'Date spot',
    note: draft.note || draft.description,
    priceLevel: draft.priceLevel,
    walkMinutes: draft.walkMinutes ? Number(draft.walkMinutes) : null,
    distanceMiles: draft.distanceMiles ? Number(draft.distanceMiles) : null,
    dateTypes: draft.dateTypes,
    vibes: draft.vibes,
    isPartner: true,
    offer: draft.offer ? { summary: offerSummary(draft.offer), daysText: daysText(draft.offer.days) } : null,
  }

  const valid = useMemo(() => {
    switch (current.id) {
      case 'business':
        return draft.fullName.trim().length > 1 && draft.businessName.trim().length > 1 && !!draft.category
      case 'location':
        return draft.addressLine.trim().length > 3
      case 'profile':
        return draft.dateTypes.length > 0 && !!draft.priceLevel
      default:
        return true
    }
  }, [current.id, draft])

  // After the hooks, never before — an early return above them changes the
  // hook order between renders.
  if (!partners.partnersEnabled) return <PartnerOffline />

  // Nobody describes a restaurant while signed out. This is also the guard
  // that stops a signed-in owner being sent here by a stale answer — by the
  // time `status` is 'ready', `existing` is real and the effect above has
  // already redirected.
  if (status === 'anon') return <Navigate to="/partners/login" replace />

  if (status === 'loading' || invites === null) {
    return (
      <PartnerShell cta={false}>
        <p className="py-24 text-center text-[14px] text-mist">Loading…</p>
      </PartnerShell>
    )
  }

  if (invites.length > 0 && !partnerId) {
    return (
      <InviteWelcome
        invites={invites}
        onAccepted={async () => {
          await refresh()
          navigate('/partners/dashboard', { replace: true })
        }}
        onDecline={() => setInvites([])}
      />
    )
  }

  async function next() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (current.id === 'business') {
        let id = partnerId
        if (!id) {
          id = await partners.register({
            fullName: draft.fullName,
            businessName: draft.businessName,
            category: draft.category,
          })
          setPartnerId(id)
        }
        await partners.update(id, {
          name: draft.businessName.trim(),
          category: draft.category,
          description: draft.description || null,
          website: normaliseUrl(draft.website),
          phone: draft.phone || null,
        })
      }

      if (current.id === 'location') {
        // Best-effort, and never blocking: a null just means the Date Spot
        // shows an address and a Directions link rather than a map.
        const coords =
          (await geocode({
            addressLine: draft.addressLine.trim(),
            city: draft.city,
            region: draft.region,
            postalCode: draft.postalCode,
          })) ?? {}
        const row = {
          address_line: draft.addressLine.trim(),
          city: draft.city || null,
          region: draft.region || null,
          postal_code: draft.postalCode || null,
          latitude: coords.latitude ?? null,
          longitude: coords.longitude ?? null,
          walk_minutes: draft.walkMinutes ? Number(draft.walkMinutes) : null,
          distance_miles: draft.distanceMiles ? Number(draft.distanceMiles) : null,
          price_level: draft.priceLevel,
          phone: draft.phone || null,
          is_primary: true,
        }
        if (locationId) {
          await partners.updateLocation(locationId, row)
        } else {
          const campus = await firstCampusId()
          const id = await partners.addLocation(partnerId, { ...row, university_id: campus })
          setLocationId(id)
        }
      }

      if (current.id === 'profile' || current.id === 'media' || current.id === 'hours') {
        await saveSpot()
      }

      setStep((s) => Math.min(STEPS.length - 1, s + 1))
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveSpot() {
    if (!locationId) return
    await partners.saveSpot(locationId, {
      name: draft.businessName.trim(),
      kind: PARTNER_CATEGORIES.find((c) => c.id === draft.category)?.label ?? 'Date spot',
      note: draft.note || null,
      date_types: draft.dateTypes,
      vibes: draft.vibes,
      price_level: draft.priceLevel,
      walk_minutes: draft.walkMinutes ? Number(draft.walkMinutes) : null,
      distance_miles: draft.distanceMiles ? Number(draft.distanceMiles) : null,
      address_line: draft.addressLine || null,
      website: normaliseUrl(draft.website),
      logo_path: draft.logoPath,
      cover_path: draft.coverPath,
      phone: draft.phone || null,
      hours: draft.hours,
      logo_path: draft.logoPath,
      cover_path: draft.coverPath,
      is_published: false,
    })
  }

  async function pickPhoto(kind, file) {
    if (!partnerId) return
    setUploading(kind)
    setError(null)
    try {
      const path = await media.upload(partnerId, file, kind)
      set(kind === 'logo' ? { logoPath: path } : { coverPath: path })
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(null)
    }
  }

  /**
   * Saves the draft offer and submits the application for review. That is the
   * whole of it now — there is no handoff to Stripe, because there is nothing
   * to pay for yet. A card is asked for later, at the point the business
   * decides to make an offer live, and only then.
   */
  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await saveSpot()

      if (draft.offer) {
        await partners.saveOffer(partnerId, {
          title: draft.offer.title,
          offer_type: draft.offer.type,
          percent_off: draft.offer.type === 'percent_off' ? Number(draft.offer.percentOff) || null : null,
          amount_off_cents: ['amount_off', 'spend_threshold'].includes(draft.offer.type)
            ? draft.offer.amountOffCents
            : null,
          min_spend_cents: draft.offer.type === 'spend_threshold' ? draft.offer.minSpendCents : null,
          free_item: draft.offer.type === 'free_item' ? draft.offer.freeItem : null,
          terms: draft.offer.terms || null,
          days_of_week: draft.offer.days,
          max_monthly_redemptions: draft.offer.monthlyCap || null,
          status: 'draft',
        })
      }

      await partners.update(partnerId, { status: 'pending' })
      await refresh()
      navigate('/partners/dashboard', { replace: true })
    } catch (e) {
      setError(`${e.message} Your application is saved — you can finish it from the dashboard.`)
      setBusy(false)
      await refresh()
    }
  }

  return (
    <PartnerShell cta={false}>
      <main className="mx-auto max-w-[820px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
        {/* progress */}
        <ol className="hide-scrollbar mb-9 flex gap-1 overflow-x-auto border-b border-rule">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => setStep(i)}
                className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                  i === step
                    ? 'border-coral text-navy'
                    : i < step
                      ? 'border-transparent text-graphite hover:text-navy'
                      : 'border-transparent text-mist'
                }`}
              >
                {i < step && <IconCheck size={12} className="mr-1.5 inline text-moss" />}
                {s.label}
              </button>
            </li>
          ))}
        </ol>

        {current.id === 'business' && (
          <Section
            title="Tell us about the place."
            body="This is what a student sees at the top of your Date Spot."
          >
            <Field label="Your name" required htmlFor="o-name">
              <TextInput id="o-name" value={draft.fullName} onChange={(v) => set({ fullName: v })} placeholder="Sam Okafor" />
            </Field>
            <Field label="Business name" required htmlFor="o-biz">
              <TextInput id="o-biz" value={draft.businessName} onChange={(v) => set({ businessName: v })} placeholder="The Lantern Room" />
            </Field>
            <Field label="What kind of place is it?" required htmlFor="o-cat">
              <Select id="o-cat" value={draft.category} onChange={(v) => set({ category: v })} options={PARTNER_CATEGORIES} />
            </Field>
            <Field
              label="Short description"
              hint="Two sentences. What is it actually like to sit there?"
              htmlFor="o-desc"
            >
              <TextArea id="o-desc" value={draft.description} onChange={(v) => set({ description: v })} maxLength={300} placeholder="Booths, a long menu, and nobody hurrying you out." />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Website" htmlFor="o-web">
                <TextInput id="o-web" value={draft.website} onChange={(v) => set({ website: v })} placeholder="yourplace.com" />
              </Field>
              <Field label="Phone" htmlFor="o-phone">
                <TextInput id="o-phone" value={draft.phone} onChange={(v) => set({ phone: v })} placeholder="(734) 555-0142" />
              </Field>
            </div>
          </Section>
        )}

        {current.id === 'location' && (
          <Section
            title="Where are you?"
            body="Loose Leaf doesn't know where any student is standing — it never stores that. Distances on your card are measured from campus, so this is the address and how far it is from the middle of it."
          >
            <Field label="Street address" required htmlFor="o-addr">
              <TextInput id="o-addr" value={draft.addressLine} onChange={(v) => set({ addressLine: v })} placeholder="118 W Liberty St" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="City" htmlFor="o-city">
                <TextInput id="o-city" value={draft.city} onChange={(v) => set({ city: v })} placeholder="Ann Arbor" />
              </Field>
              <Field label="State" htmlFor="o-region">
                <TextInput id="o-region" value={draft.region} onChange={(v) => set({ region: v })} placeholder="MI" />
              </Field>
              <Field label="ZIP" htmlFor="o-zip">
                <TextInput id="o-zip" value={draft.postalCode} onChange={(v) => set({ postalCode: v })} placeholder="48104" />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Walk from campus" hint="In minutes. A guess is fine." htmlFor="o-walk">
                <TextInput id="o-walk" inputMode="numeric" value={draft.walkMinutes} onChange={(v) => set({ walkMinutes: v.replace(/\D/g, '') })} placeholder="9" />
              </Field>
              <Field label="Distance from campus" hint="In miles." htmlFor="o-dist">
                <TextInput id="o-dist" inputMode="decimal" value={draft.distanceMiles} onChange={(v) => set({ distanceMiles: v.replace(/[^0-9.]/g, '') })} placeholder="0.8" />
              </Field>
            </div>
          </Section>
        )}

        {current.id === 'profile' && (
          <Section
            title="What kind of date are you good for?"
            body="This is the part that decides when Loose Leaf suggests you. Pick honestly — a place tagged for everything gets suggested for nothing, because it never looks like the right answer to a specific question."
          >
            <Field label="Date types" required hint="Pick every one that genuinely fits. Ask for coffee and Loose Leaf only shows places tagged for coffee.">
              <TagPicker options={DATE_TYPE_TAGS} value={draft.dateTypes} onChange={(v) => set({ dateTypes: v })} />
            </Field>
            <Field label="Vibe" hint="Up to four.">
              <TagPicker options={VIBE_TAGS} value={draft.vibes} onChange={(v) => set({ vibes: v })} max={4} />
            </Field>
            <Field label="Price range" required>
              <PricePicker value={draft.priceLevel} onChange={(v) => set({ priceLevel: v })} />
            </Field>
            <Field label="One line for the card" hint="The bit under your name. Keep it human." htmlFor="o-note">
              <TextInput id="o-note" value={draft.note} onChange={(v) => set({ note: v })} maxLength={90} placeholder="Never a bad table." />
            </Field>

            <Preview spot={previewSpot} />
          </Section>
        )}

        {current.id === 'media' && (
          <Section title="Show them the place." body="A logo and one good photo of the room. You can add more from the dashboard later.">
            <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
              <PhotoSlot
                label="Logo"
                aspect="aspect-square"
                path={draft.logoPath}
                url={draft.logoPath && media.publicUrl(draft.logoPath)}
                busy={uploading === 'logo'}
                onPick={(f) => pickPhoto('logo', f)}
                onClear={() => set({ logoPath: null })}
              />
              <PhotoSlot
                label="Cover photo"
                path={draft.coverPath}
                url={draft.coverPath && media.publicUrl(draft.coverPath)}
                busy={uploading === 'cover'}
                onPick={(f) => pickPhoto('cover', f)}
                onClear={() => set({ coverPath: null })}
              />
            </div>
            <p className="text-[13px] leading-relaxed text-mist">
              Photos of the space beat photos of the food here. Somebody is deciding whether it will
              be awkward to sit across from a stranger in this room.
            </p>
          </Section>
        )}

        {current.id === 'hours' && (
          <Section title="When are you open?" body="Used to mark you open or closed on a card, and to keep you out of suggestions for a Tuesday night you're shut.">
            <HoursEditor value={draft.hours} onChange={(v) => set({ hours: v })} />
          </Section>
        )}

        {current.id === 'offer' && (
          <OfferStep offer={draft.offer} onChange={(o) => set({ offer: o })} feeCents={feeCents} />
        )}

        {current.id === 'review' && (
          <Section
            title="Here's how you'll look."
            body="This is the card students see. Submitting sends your application to Loose Leaf — a person reads every one, usually within a day or two. Nothing is charged, and we don't ask for a card."
          >
            <div className="max-w-[440px]">
              <DateSpotCard spot={previewSpot} fit={92} />
            </div>

            <dl className="mt-2 grid gap-x-8 gap-y-3 rounded-card border border-rule bg-cream/50 px-5 py-5 sm:grid-cols-2">
              <Row label="Business" value={draft.businessName} />
              <Row label="Category" value={PARTNER_CATEGORIES.find((c) => c.id === draft.category)?.label} />
              <Row label="Address" value={[draft.addressLine, draft.city].filter(Boolean).join(', ')} />
              <Row label="Date types" value={draft.dateTypes.length ? `${draft.dateTypes.length} selected` : '—'} />
              <Row label="Cost to be here" value="Free" />
              <Row label="Offer" value={draft.offer ? draft.offer.title : 'None yet'} />
            </dl>

            <div className="mt-1 rounded-card border border-notebook/50 bg-notebook-soft px-5 py-5">
              <p className="text-[14.5px] font-medium text-navy">What Loose Leaf costs you</p>
              <p className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed text-graphite">
                Nothing to join and nothing per month. You are charged {fee(feeCents)} when a
                couple hands over a Date Pass and one of your staff scans it — billed once at the
                end of the month, and not at all in a month where that never happened.
              </p>
              <p className="mt-2.5 max-w-[58ch] text-[13px] leading-relaxed text-mist">
                We'll ask for a card when you're ready to turn an offer on, not before.
              </p>
            </div>
          </Section>
        )}

        {error && (
          <p className="mt-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
            {error}
          </p>
        )}

        <div className="mt-9 flex items-center justify-between gap-3 border-t border-rule pt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || busy}
            className="press focus-ring -ml-2 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[14px] font-medium text-graphite hover:text-navy disabled:opacity-0"
          >
            <IconBack size={18} />
            Back
          </button>

          {current.id === 'review' ? (
            <Button variant="coral" size="lg" onClick={submit} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit application'}
            </Button>
          ) : (
            <Button variant="coral" size="lg" onClick={next} disabled={!valid || busy}>
              {busy ? 'Saving…' : 'Continue'}
            </Button>
          )}
        </div>
      </main>
    </PartnerShell>
  )
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

/**
 * What somebody sees when their boss added them rather than when they signed
 * up. Accepting is one tap; the only field is their name, because the rest of
 * the business already exists and none of it is theirs to fill in.
 */
function InviteWelcome({ invites, onAccepted, onDecline }) {
  const [name, setName] = useState(readStashedName())
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const roleWords = {
    owner: 'run the account, including billing',
    manager: 'edit the Date Spot and the offers',
    staff: 'scan Date Passes at the till',
  }

  return (
    <PartnerShell cta={false}>
      <main className="mx-auto max-w-[560px] px-5 pb-24 pt-12 sm:px-8">
        <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em]">
          {invites.length === 1
            ? `${invites[0].partnerName} added you.`
            : 'You’ve been added to a few places.'}
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-graphite">
          Accept and you’ll be able to {roleWords[invites[0].role] ?? 'help run this business'} on
          Loose Leaf. You don’t need to set anything up.
        </p>

        <div className="mt-7">
          <Field label="What should we call you?" htmlFor="inv-name">
            <TextInput id="inv-name" value={name} onChange={setName} placeholder="Dee" />
          </Field>
        </div>

        <ul className="mt-6 space-y-3">
          {invites.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center gap-4 rounded-card border border-rule bg-white px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-medium text-navy">{i.partnerName}</p>
                <p className="mt-0.5 text-[13px] text-mist">
                  as {i.role} · {roleWords[i.role]}
                </p>
              </div>
              <Button
                variant="coral"
                size="md"
                disabled={busy === i.id}
                onClick={async () => {
                  setBusy(i.id)
                  setError(null)
                  try {
                    await partners.acceptInvite(i.id, name.trim() || null)
                    await onAccepted()
                  } catch (e) {
                    setError(e.message)
                    setBusy(null)
                  }
                }}
              >
                {busy === i.id ? 'Joining…' : 'Accept'}
              </Button>
            </li>
          ))}
        </ul>

        {error && (
          <p className="mt-5 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onDecline}
          className="focus-ring mt-8 rounded-lg text-[13.5px] font-medium text-graphite underline underline-offset-4 hover:text-navy"
        >
          I’m here to list my own business instead
        </button>
      </main>
    </PartnerShell>
  )
}

function Section({ title, body, children }) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="relative inline-block font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">
          {title}
          <Underline className="absolute -bottom-1.5 left-0 text-coral/50" width={Math.min(240, title.length * 11)} />
        </h1>
        {body && <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-graphite">{body}</p>}
      </header>
      {children}
    </section>
  )
}

function Row({ label, value }) {
  return (
    <div>
      <dt className="text-[12.5px] text-mist">{label}</dt>
      <dd className="mt-0.5 text-[14.5px] text-navy">{value || '—'}</dd>
    </div>
  )
}

function Preview({ spot }) {
  return (
    <div className="rounded-card border border-dashed border-navy/20 bg-cream/40 px-4 py-4">
      <p className="mb-3 font-hand text-[16px] text-graphite">how it’ll look</p>
      <div className="max-w-[400px]">
        <DateSpotCard spot={spot} />
      </div>
    </div>
  )
}

const OFFER_TYPES = [
  { id: 'percent_off', label: 'Percentage off' },
  { id: 'amount_off', label: 'Dollars off' },
  { id: 'free_item', label: 'Something free' },
  { id: 'bogo', label: 'Buy one, get one' },
  { id: 'spend_threshold', label: 'Off a minimum spend' },
  { id: 'package', label: 'A couple package' },
  { id: 'custom', label: 'Something else' },
]

const blankOffer = {
  title: '',
  type: 'percent_off',
  percentOff: 15,
  amountOffCents: null,
  minSpendCents: null,
  freeItem: '',
  terms: '',
  days: [0, 1, 2, 3, 4],
  monthlyCap: 100,
}

function OfferStep({ offer, onChange, feeCents = 150 }) {
  const o = offer ?? blankOffer

  return (
    <Section
      title="Make it worth the walk."
      body="Optional, and you can add it later. Most partners run something modest on the nights they're quiet rather than something dramatic on a Friday they're already full."
    >
      <p className="-mt-1 max-w-[58ch] rounded-2xl border border-notebook/50 bg-notebook-soft px-4 py-3 text-[13.5px] leading-relaxed text-graphite">
        This is the part Loose Leaf charges for, and only this part: {fee(feeCents)} when somebody
        redeems a pass for it. Drafting it now costs nothing — it goes live when you turn it on
        from the dashboard, which is also when we'll ask for a card.
      </p>

      {!offer ? (
        <Button variant="outline" size="md" onClick={() => onChange(blankOffer)}>
          Create an offer
        </Button>
      ) : (
        <>
          <Field label="What do you want to call it?" htmlFor="of-title">
            <TextInput id="of-title" value={o.title} onChange={(v) => onChange({ ...o, title: v })} placeholder="Weeknight Date" />
          </Field>

          <Field label="What is it?" htmlFor="of-type">
            <Select id="of-type" value={o.type} onChange={(v) => onChange({ ...o, type: v })} options={OFFER_TYPES} placeholder="Choose" />
          </Field>

          {o.type === 'percent_off' && (
            <Field label="How much off?" htmlFor="of-pct">
              <TextInput id="of-pct" inputMode="numeric" value={String(o.percentOff ?? '')} onChange={(v) => onChange({ ...o, percentOff: v.replace(/\D/g, '').slice(0, 3) })} placeholder="15" />
            </Field>
          )}

          {o.type === 'amount_off' && (
            <Field label="How much off?" htmlFor="of-amt">
              <MoneyInput id="of-amt" cents={o.amountOffCents} onChange={(c) => onChange({ ...o, amountOffCents: c })} />
            </Field>
          )}

          {o.type === 'spend_threshold' && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Amount off" htmlFor="of-amt2">
                <MoneyInput id="of-amt2" cents={o.amountOffCents} onChange={(c) => onChange({ ...o, amountOffCents: c })} />
              </Field>
              <Field label="Minimum spend" htmlFor="of-min">
                <MoneyInput id="of-min" cents={o.minSpendCents} onChange={(c) => onChange({ ...o, minSpendCents: c })} />
              </Field>
            </div>
          )}

          {o.type === 'free_item' && (
            <Field label="What's free?" htmlFor="of-item">
              <TextInput id="of-item" value={o.freeItem} onChange={(v) => onChange({ ...o, freeItem: v })} placeholder="dessert" />
            </Field>
          )}

          <Field label="Which days?" hint="A Sunday–Thursday offer is never shown on a Friday.">
            <DayPicker value={o.days} onChange={(d) => onChange({ ...o, days: d })} />
          </Field>

          <Field label="Cap it per month" hint="Once you hit this, the offer stops being handed out until next month." htmlFor="of-cap">
            <TextInput id="of-cap" inputMode="numeric" value={String(o.monthlyCap ?? '')} onChange={(v) => onChange({ ...o, monthlyCap: Number(v.replace(/\D/g, '')) || null })} placeholder="100" />
          </Field>

          <Field label="Terms" hint="The small print on the pass." htmlFor="of-terms">
            <TextArea id="of-terms" rows={3} value={o.terms} onChange={(v) => onChange({ ...o, terms: v })} maxLength={240} placeholder="Dine-in only. One pass per couple." />
          </Field>

          <button
            type="button"
            onClick={() => onChange(null)}
            className="focus-ring rounded-lg text-[13.5px] font-medium text-graphite hover:text-coral-deep"
          >
            Remove this offer
          </button>
        </>
      )}
    </Section>
  )
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function readStashedName() {
  try {
    return sessionStorage.getItem('looseleaf.partner.name') ?? ''
  } catch {
    return ''
  }
}

function normaliseUrl(v) {
  const s = (v ?? '').trim()
  if (!s) return null
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

function offerSummary(o) {
  const dollars = (c) => `$${((c ?? 0) / 100).toFixed(0)}`
  switch (o.type) {
    case 'percent_off':
      return `${o.percentOff}% off your date`
    case 'amount_off':
      return `${dollars(o.amountOffCents)} off`
    case 'free_item':
      return `Free ${o.freeItem || 'treat'}`
    case 'bogo':
      return 'Buy one, get one'
    case 'spend_threshold':
      return `${dollars(o.amountOffCents)} off ${dollars(o.minSpendCents)}+`
    default:
      return o.title || 'Loose Leaf offer'
  }
}

/**
 * Which campus a location serves. Single-campus for now, so this picks the
 * only one — the column exists because "one business, several campuses" is a
 * real thing later and retrofitting it onto rows would be much worse.
 */
async function firstCampusId() {
  const { supabase } = await import('../../lib/supabase')
  const { data, error } = await supabase.from('universities').select('id').order('created_at').limit(1)
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('No campus is set up yet.')
  return data[0].id
}
