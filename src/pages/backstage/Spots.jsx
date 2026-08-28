import { useCallback, useEffect, useState } from 'react'
import BackstageHeader from './BackstageHeader'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import EmptyState from '../../components/common/EmptyState'
import DateSpotCard from '../../components/dates/DateSpotCard'
import { IconPlus, IconTrash } from '../../components/ui/Icons'
import {
  Field, TextInput, Select, TagPicker, PricePicker, PhotoSlot, HoursEditor,
} from '../../components/partners/fields'
import { PARTNER_CATEGORIES, DATE_TYPE_TAGS, VIBE_TAGS, dateTypeLabel } from '../../data/partnerCatalog'
import { useStore } from '../../state/store'
import * as staff from '../../services/staff'
import * as media from '../../services/live/partnerMedia'
import { geocode } from '../../lib/geocode'

/**
 * ── Backstage → Spots ───────────────────────────────────────────────────────
 *
 * Places on the Date Spots page that no business is behind: somewhere you've
 * actually been, added by hand, so the page has something on it while
 * partners are still signing up. They are meant to be temporary, and the
 * fastest thing on this page is removing one.
 *
 * Two lines it will not cross, both held by the database rather than by this
 * form:
 *
 *   · **No perk, ever.** A spot with no partner cannot carry an offer or a
 *     sponsorship — there is a check constraint on the table. So this page has
 *     no field for one, and a business that hasn't agreed to anything can
 *     never appear to have.
 *   · **Not a suggestion by default.** These sit where a couple is browsing.
 *     "Where should we go?" answers with businesses that opted into being in
 *     that answer, unless you deliberately tick the box on one.
 *
 * A partner's own card is not editable here. The policy behind this page is
 * `is_admin() and partner_id is null`, so the attempt fails in Postgres, not
 * in a disabled button.
 */

const BLANK = {
  name: '',
  category: 'coffee',
  note: '',
  dateTypes: [],
  vibes: [],
  priceLevel: null,
  addressLine: '',
  walkMinutes: '',
  distanceMiles: '',
  website: '',
  phone: '',
  hours: {},
  coverPath: null,
  indoorOutdoor: '',
  reservations: '',
  minAge: '',
  isPublished: true,
  suggestable: false,
}

/** A stored row back into the form. `kind` is the label, not the id. */
function toForm(row) {
  if (!row) return { ...BLANK }
  return {
    name: row.name ?? '',
    category: PARTNER_CATEGORIES.find((c) => c.label === row.kind)?.id ?? 'other',
    note: row.note ?? '',
    dateTypes: row.date_types ?? [],
    vibes: row.vibes ?? [],
    priceLevel: row.price_level ?? null,
    addressLine: row.address_line ?? '',
    walkMinutes: row.walk_minutes ?? '',
    distanceMiles: row.distance_miles ?? '',
    website: row.website ?? '',
    phone: row.phone ?? '',
    hours: row.hours ?? {},
    coverPath: row.cover_path ?? null,
    indoorOutdoor: row.indoor_outdoor ?? '',
    reservations: row.reservations ?? '',
    minAge: row.min_age ?? '',
    isPublished: row.is_published ?? true,
    suggestable: row.suggestable ?? false,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
  }
}

export default function BackstageSpots() {
  const { actions } = useStore()
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // a row, or 'new'
  const [removing, setRemoving] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSpots(await staff.houseSpots())
    } catch (e) {
      actions.showToast(e.message)
    } finally {
      setLoading(false)
    }
  }, [actions])

  useEffect(() => {
    load()
  }, [load])

  const remove = async () => {
    try {
      await staff.removeHouseSpot(removing.id, removing.cover_path)
      actions.showToast('Taken off Date Spots.')
      setRemoving(null)
      load()
    } catch (e) {
      actions.showToast(e.message)
    }
  }

  const live = spots.filter((s) => s.is_published)
  const drafts = spots.filter((s) => !s.is_published)

  return (
    <>
      <BackstageHeader
        title="Spots"
        subtitle="Date Spots you've added by hand. They keep the page worth opening while partners are still signing up — and they come off the same way they went on."
        action={
          <Button variant="coral" size="md" onClick={() => setEditing('new')}>
            Add a spot
          </Button>
        }
      />

      {loading ? (
        <p className="py-12 text-center text-[14px] text-mist">Loading…</p>
      ) : !spots.length ? (
        <EmptyState
          art="coffee"
          title="No spots added yet"
          body="Date Spots currently shows only Loose Leaf Partners. Add a few places you'd actually send someone on a first date."
          action={
            <Button variant="coral" size="md" onClick={() => setEditing('new')}>
              <IconPlus size={16} />
              Add the first one
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <Section
            label="On Date Spots"
            count={live.length}
            rows={live}
            onEdit={setEditing}
            onRemove={setRemoving}
          />
          {drafts.length > 0 && (
            <Section
              label="Not published"
              count={drafts.length}
              rows={drafts}
              onEdit={setEditing}
              onRemove={setRemoving}
              muted
            />
          )}
        </div>
      )}

      <p className="mt-8 max-w-[62ch] text-[12.5px] leading-relaxed text-mist">
        A spot added here can never carry a perk or a “Sponsored” label — the table refuses it. An
        offer means a business agreed to one, and nothing on this page is an agreement.
      </p>

      <SpotEditor
        open={editing !== null}
        row={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
      />

      <Sheet
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? 'this spot'}?`}
        subtitle="It comes off Date Spots straight away. Anyone who already planned a date around it keeps the plan."
      >
        <div className="flex gap-3">
          <Button variant="ghost" size="lg" full onClick={() => setRemoving(null)}>
            Keep it
          </Button>
          <Button variant="danger" size="lg" full onClick={remove}>
            Remove
          </Button>
        </div>
      </Sheet>
    </>
  )
}

function Section({ label, count, rows, onEdit, onRemove, muted = false }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-display text-[17px] font-semibold text-navy">{label}</h2>
        <span className="text-[13px] tabular-nums text-mist">{count}</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((s) => (
          <li
            key={s.id}
            className={`flex items-center gap-4 rounded-card border border-rule bg-white px-4 py-3.5 ${
              muted ? 'opacity-75' : ''
            }`}
          >
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-cream">
              {s.cover_path && (
                <img
                  src={media.publicUrl(s.cover_path, 'sm')}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-navy">{s.name}</p>
              <p className="mt-0.5 truncate text-[13px] text-graphite">
                {s.kind}
                {s.walk_minutes != null && ` · ${s.walk_minutes} min walk`}
                {s.suggestable && ' · in the planner'}
              </p>
              <p className="mt-1 truncate text-[12.5px] text-mist">
                {(s.date_types ?? []).length
                  ? (s.date_types ?? []).map(dateTypeLabel).join(', ')
                  : 'No date types — it can only be found by browsing'}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit(s)}>
                Edit
              </Button>
              <button
                type="button"
                onClick={() => onRemove(s)}
                aria-label={`Remove ${s.name}`}
                className="press focus-ring flex h-9 w-9 items-center justify-center rounded-full text-mist transition hover:bg-coral-wash hover:text-coral-deep"
              >
                <IconTrash size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The form. The card students will see sits at the top of it and updates as
 * you type, for the same reason the partner-side editor has one: the date-type
 * tags are the thing that decides where this place can ever appear, and seeing
 * the card change is what makes that legible.
 */
function SpotEditor({ open, row, onClose, onSaved }) {
  const { actions } = useStore()
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm(toForm(row))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const kindLabel = PARTNER_CATEGORIES.find((c) => c.id === form.category)?.label ?? 'Date spot'
  const ready = form.name.trim().length > 1

  const preview = {
    id: row?.id ?? 'preview',
    coverPath: form.coverPath,
    name: form.name || 'Somewhere good',
    kind: kindLabel,
    note: form.note,
    priceLevel: form.priceLevel,
    walkMinutes: form.walkMinutes ? Number(form.walkMinutes) : null,
    distanceMiles: form.distanceMiles ? Number(form.distanceMiles) : null,
    dateTypes: form.dateTypes,
    vibes: form.vibes,
    isPartner: false,
  }

  async function pickCover(file) {
    setUploading(true)
    setError(null)
    try {
      set({ coverPath: await media.upload(media.HOUSE_FOLDER, file, 'cover') })
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (busy || !ready) return
    setBusy(true)
    setError(null)
    try {
      // Look the address up so the sheet can show a map. Best-effort: a null
      // here means the spot shows its address and a Directions link instead,
      // which is why nothing below depends on it.
      let coords = { latitude: form.latitude ?? null, longitude: form.longitude ?? null }
      const address = form.addressLine.trim()
      if (address && (address !== (row?.address_line ?? '') || coords.latitude == null)) {
        coords = (await geocode({ addressLine: address })) ?? { latitude: null, longitude: null }
      }

      await staff.saveHouseSpot(row?.id ?? null, {
        name: form.name.trim(),
        kind: kindLabel,
        note: form.note.trim() || null,
        date_types: form.dateTypes,
        vibes: form.vibes,
        price_level: form.priceLevel,
        walk_minutes: form.walkMinutes ? Number(form.walkMinutes) : null,
        distance_miles: form.distanceMiles ? Number(form.distanceMiles) : null,
        address_line: address || null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        website: form.website.trim() || null,
        phone: form.phone.trim() || null,
        hours: form.hours,
        cover_path: form.coverPath,
        indoor_outdoor: form.indoorOutdoor || null,
        reservations: form.reservations || null,
        min_age: form.minAge ? Number(form.minAge) : null,
        is_published: form.isPublished,
        suggestable: form.suggestable,
      })
      actions.showToast(row ? 'Saved.' : 'Added to Date Spots.')
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={row ? 'Edit spot' : 'Add a Date Spot'}
      subtitle="Somewhere you'd send two people who barely know each other yet."
      maxWidth="max-w-2xl"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" size="lg" full onClick={onClose}>
            Cancel
          </Button>
          <Button variant="coral" size="lg" full disabled={!ready || busy} onClick={save}>
            {busy ? 'Saving…' : row ? 'Save changes' : 'Add it'}
          </Button>
        </div>
      }
    >
      <div className="space-y-7">
        {/* At the width a card actually gets on the Date Spots grid. Left to
            fill the sheet it becomes a 400px-tall empty cover with the form
            pushed off the bottom of the screen — a preview that has to be
            scrolled past is not a preview. */}
        <div className="rounded-card border border-rule bg-cream/50 p-4">
          <p className="mb-3 font-hand text-[17px] text-graphite">what students see</p>
          <div className="mx-auto max-w-[320px]">
            <DateSpotCard spot={preview} />
          </div>
        </div>

        {error && (
          <p className="rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
            {error}
          </p>
        )}

        <Group title="The basics">
          <Field label="Name" htmlFor="h-name" required>
            <TextInput id="h-name" value={form.name} onChange={(v) => set({ name: v })} placeholder="The Lantern Room" />
          </Field>
          <Field label="Kind of place" htmlFor="h-kind">
            <Select id="h-kind" value={form.category} onChange={(v) => set({ category: v })} options={PARTNER_CATEGORIES} />
          </Field>
          <Field
            label="One line for the card"
            hint="Why you'd send someone here. Two lines at most — the cards are all the same height on purpose."
            htmlFor="h-note"
          >
            <TextInput
              id="h-note"
              value={form.note}
              onChange={(v) => set({ note: v })}
              maxLength={90}
              placeholder="Booths, long menu, nobody rushes you out."
            />
          </Field>
          {/* Same width as the preview above it, and for the same reason:
              PhotoSlot fills whatever it is given, and 3:2 across the whole
              sheet is a 400px-tall dashed rectangle. */}
          <div className="max-w-[320px]">
            <PhotoSlot
              label="Cover photo"
              url={form.coverPath && media.publicUrl(form.coverPath)}
              busy={uploading}
              onPick={pickCover}
              onClear={() => set({ coverPath: null })}
            />
          </div>
        </Group>

        <Group
          title="What kind of date"
          body="What the Date Spots filter reads. A spot with none is still on the page, but only under “Everything” — so tag what's true of it."
        >
          <Field label="Date types">
            <TagPicker options={DATE_TYPE_TAGS} value={form.dateTypes} onChange={(v) => set({ dateTypes: v })} />
          </Field>
          <Field label="Vibe" hint="Up to four.">
            <TagPicker options={VIBE_TAGS} value={form.vibes} onChange={(v) => set({ vibes: v })} max={4} />
          </Field>
          <Field label="Price range">
            <PricePicker value={form.priceLevel} onChange={(v) => set({ priceLevel: v })} />
          </Field>
        </Group>

        <Group title="Where and when">
          <Field
            label="Address"
            hint="The whole thing, the way you'd type it into Maps. It's what puts a map and a Directions button on the spot."
            htmlFor="h-addr"
          >
            <TextInput
              id="h-addr"
              value={form.addressLine}
              onChange={(v) => set({ addressLine: v })}
              placeholder="410 N Fourth Ave, Ann Arbor, MI"
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Walk from campus" hint="Minutes." htmlFor="h-walk">
              <TextInput
                id="h-walk"
                inputMode="numeric"
                value={String(form.walkMinutes ?? '')}
                onChange={(v) => set({ walkMinutes: v.replace(/\D/g, '') })}
              />
            </Field>
            <Field label="Distance from campus" hint="Miles." htmlFor="h-dist">
              <TextInput
                id="h-dist"
                inputMode="decimal"
                value={String(form.distanceMiles ?? '')}
                onChange={(v) => set({ distanceMiles: v.replace(/[^0-9.]/g, '') })}
              />
            </Field>
          </div>
          <Field label="Hours" hint="Optional. Leave it empty rather than guessing.">
            <HoursEditor value={form.hours} onChange={(v) => set({ hours: v })} />
          </Field>
        </Group>

        <Group title="The details people ask about">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Website" htmlFor="h-web">
              <TextInput id="h-web" value={form.website} onChange={(v) => set({ website: v })} placeholder="https://" />
            </Field>
            <Field label="Phone" htmlFor="h-phone">
              <TextInput id="h-phone" value={form.phone} onChange={(v) => set({ phone: v })} />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Indoor / outdoor" htmlFor="h-io">
              <Select
                id="h-io"
                value={form.indoorOutdoor}
                onChange={(v) => set({ indoorOutdoor: v })}
                placeholder="Not set"
                options={[
                  { id: 'indoor', label: 'Indoor' },
                  { id: 'outdoor', label: 'Outdoor' },
                  { id: 'both', label: 'Both' },
                ]}
              />
            </Field>
            <Field label="Reservations" htmlFor="h-res">
              <Select
                id="h-res"
                value={form.reservations}
                onChange={(v) => set({ reservations: v })}
                placeholder="Not set"
                options={[
                  { id: 'Not needed', label: 'Not needed' },
                  { id: 'Recommended', label: 'Recommended' },
                  { id: 'Required', label: 'Required' },
                ]}
              />
            </Field>
            <Field label="Minimum age" hint="Leave empty if there isn't one." htmlFor="h-age">
              <TextInput
                id="h-age"
                inputMode="numeric"
                value={String(form.minAge ?? '')}
                onChange={(v) => set({ minAge: v.replace(/\D/g, '') })}
                placeholder="21"
              />
            </Field>
          </div>
        </Group>

        <Group title="Where it shows up">
          <Check
            checked={form.isPublished}
            onChange={(v) => set({ isPublished: v })}
            title="Show it on Date Spots"
            body="Off means it stays here, half-finished, until you're happy with it."
          />
          <Check
            checked={form.suggestable}
            onChange={(v) => set({ suggestable: v })}
            title="Also let Loose Leaf suggest it"
            body="Off by default. “Where should we go?” answers with businesses that agreed to be in that answer — turn this on only for a place you'd genuinely put in front of a couple who asked."
          />
        </Group>
      </div>
    </Sheet>
  )
}

function Check({ checked, onChange, title, body }) {
  return (
    <label className="flex gap-3 rounded-2xl border border-rule bg-white px-4 py-3.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF6468]"
      />
      <span>
        <span className="block text-[14px] font-medium text-navy">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-mist">{body}</span>
      </span>
    </label>
  )
}

function Group({ title, body, children }) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">{title}</h2>
      {body && <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-graphite">{body}</p>}
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  )
}
