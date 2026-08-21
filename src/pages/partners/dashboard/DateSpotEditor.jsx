import { useCallback, useEffect, useState } from 'react'
import { PageHead } from '../DashboardLayout'
import Button from '../../../components/ui/Button'
import Sheet from '../../../components/ui/Sheet'
import DateSpotCard from '../../../components/dates/DateSpotCard'
import {
  Field, TextInput, Select, TagPicker, PricePicker, PhotoSlot, HoursEditor,
} from '../../../components/partners/fields'
import { IconPlus, IconBack, IconChevron } from '../../../components/ui/Icons'
import { usePartnerAccount } from '../../../state/partnerAccount'
import * as partners from '../../../services/partners'
import * as media from '../../../services/live/partnerMedia'
import { PARTNER_CATEGORIES, DATE_TYPE_TAGS, VIBE_TAGS } from '../../../data/partnerCatalog'
import { limit } from '../../../lib/partnerPlans'

/**
 * Everything about how a business appears, with the card students see sitting
 * beside the form and updating as you type. The preview isn't decoration: the
 * date-type tags are the single biggest thing a partner controls, and seeing
 * the card change is what makes that legible.
 *
 * One business, many locations — a chain with three cafes gets three Date
 * Spots, each with its own address, hours, and walk from campus, because "0.8
 * miles away" is a per-address fact and a shared one would be a lie about two
 * of them. The switcher only appears when there is something to switch
 * between, so a single-site restaurant never sees it.
 */
export default function DateSpotEditor() {
  const { partner, entitlements, refresh } = usePartnerAccount()

  const [locations, setLocations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [spot, setSpot] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [saved, setSaved] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  const location = locations.find((l) => l.id === activeId) ?? null
  const maxLocations = limit(entitlements, 'max_locations', 1)

  /** Loads one location's card into the form. */
  const open = useCallback(
    async (loc) => {
      if (!loc) return
      setForm(null)
      setActiveId(loc.id)
      const s = await partners.spotForLocation(loc.id).catch(() => null)
      setSpot(s)
      setSaved(false)
      setForm({
        name: s?.name ?? partner.name,
        category: partner.category,
        note: s?.note ?? '',
        dateTypes: s?.date_types ?? [],
        vibes: s?.vibes ?? [],
        priceLevel: s?.price_level ?? loc?.price_level ?? null,
        addressLine: s?.address_line ?? loc?.address_line ?? '',
        walkMinutes: s?.walk_minutes ?? loc?.walk_minutes ?? '',
        distanceMiles: s?.distance_miles ?? loc?.distance_miles ?? '',
        website: s?.website ?? '',
        phone: s?.phone ?? loc?.phone ?? '',
        hours: s?.hours ?? {},
        logoPath: s?.logo_path ?? null,
        coverPath: s?.cover_path ?? null,
        galleryPaths: s?.gallery_paths ?? [],
        indoorOutdoor: s?.indoor_outdoor ?? '',
        reservations: s?.reservations ?? '',
        minAge: s?.min_age ?? '',
        isPublished: s?.is_published ?? true,
      })
    },
    [partner]
  )

  useEffect(() => {
    if (!partner) return
    let live = true
    partners
      .locations(partner.id)
      .then((locs) => {
        if (!live) return
        setLocations(locs)
        open(locs[0] ?? null)
      })
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [partner, open])

  async function addLocation(row) {
    const id = await partners.addLocation(partner.id, {
      ...row,
      university_id: location?.university_id ?? (await firstCampusId()),
      is_primary: locations.length === 0,
    })
    const locs = await partners.locations(partner.id)
    setLocations(locs)
    setAdding(false)
    await open(locs.find((l) => l.id === id) ?? locs[0])
  }

  if (!form) return <p className="py-12 text-center text-[14px] text-mist">Loading…</p>

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setSaved(false)
  }

  const preview = {
    name: form.name || partner.name,
    kind: PARTNER_CATEGORIES.find((c) => c.id === form.category)?.label ?? 'Date spot',
    note: form.note,
    priceLevel: form.priceLevel,
    walkMinutes: form.walkMinutes ? Number(form.walkMinutes) : null,
    distanceMiles: form.distanceMiles ? Number(form.distanceMiles) : null,
    dateTypes: form.dateTypes,
    vibes: form.vibes,
    isPartner: true,
  }

  const galleryMax = limit(entitlements, 'gallery_photos', 4)

  async function save() {
    if (busy || !location) return
    setBusy(true)
    setError(null)
    try {
      await partners.updateLocation(location.id, {
        address_line: form.addressLine.trim() || location.address_line,
        walk_minutes: form.walkMinutes ? Number(form.walkMinutes) : null,
        distance_miles: form.distanceMiles ? Number(form.distanceMiles) : null,
        price_level: form.priceLevel,
        phone: form.phone || null,
      })
      await partners.saveSpot(location.id, {
        name: form.name.trim(),
        kind: PARTNER_CATEGORIES.find((c) => c.id === form.category)?.label ?? 'Date spot',
        note: form.note || null,
        date_types: form.dateTypes,
        vibes: form.vibes,
        price_level: form.priceLevel,
        walk_minutes: form.walkMinutes ? Number(form.walkMinutes) : null,
        distance_miles: form.distanceMiles ? Number(form.distanceMiles) : null,
        address_line: form.addressLine || null,
        website: form.website || null,
        phone: form.phone || null,
        hours: form.hours,
        logo_path: form.logoPath,
        cover_path: form.coverPath,
        gallery_paths: form.galleryPaths,
        indoor_outdoor: form.indoorOutdoor || null,
        reservations: form.reservations || null,
        min_age: form.minAge ? Number(form.minAge) : null,
        is_published: form.isPublished,
      })
      // With one location, renaming the card renames the business — that's
      // what a partner means by it. With several, "Lantern Room — Kerrytown"
      // is a card title and emphatically not the company's new name.
      const single = locations.length <= 1
      if (form.category !== partner.category || (single && form.name.trim() !== partner.name)) {
        await partners.update(partner.id, {
          ...(single ? { name: form.name.trim() } : {}),
          category: form.category,
        })
        await refresh()
      }
      setLocations(await partners.locations(partner.id))
      setSaved(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function pick(kind, file) {
    setUploading(kind)
    setError(null)
    try {
      const path = await media.upload(partner.id, file, kind)
      if (kind === 'logo') set({ logoPath: path })
      else if (kind === 'cover') set({ coverPath: path })
      else set({ galleryPaths: [...form.galleryPaths, path] })
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(null)
    }
  }

  return (
    <>
      <PageHead
        title="Date Spot"
        subtitle="How you appear to students browsing for somewhere to go. Changes go live as soon as you save."
        action={
          <Button variant="coral" size="md" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
          </Button>
        }
      />

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      {/* Only shown once there is something to switch between. */}
      {(locations.length > 1 || maxLocations > 1) && (
        <nav className="hide-scrollbar mb-6 flex gap-2 overflow-x-auto border-b border-rule pb-3">
          {locations.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => open(l)}
              className={`press focus-ring shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
                l.id === activeId
                  ? 'border-navy bg-navy text-paper'
                  : 'border-rule bg-white text-graphite hover:border-navy/25'
              }`}
            >
              {l.label || l.address_line}
              {l.is_primary && locations.length > 1 && (
                <span className={`ml-1.5 text-[10.5px] ${l.id === activeId ? 'text-paper/60' : 'text-mist'}`}>
                  main
                </span>
              )}
            </button>
          ))}

          {locations.length < maxLocations ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="press focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-navy/25 px-3.5 py-1.5 text-[13px] font-medium text-graphite transition hover:border-navy/40 hover:text-navy"
            >
              <IconPlus size={14} />
              Add a location
            </button>
          ) : (
            locations.length > 1 && (
              <span className="shrink-0 self-center px-2 text-[12px] text-mist">
                {maxLocations} of {maxLocations} on this plan
              </span>
            )
          )}
        </nav>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <Group title="The basics">
            <Field label="Name" htmlFor="s-name">
              <TextInput id="s-name" value={form.name} onChange={(v) => set({ name: v })} />
            </Field>
            <Field label="Category" htmlFor="s-cat">
              <Select id="s-cat" value={form.category} onChange={(v) => set({ category: v })} options={PARTNER_CATEGORIES} />
            </Field>
            <Field label="One line for the card" hint="Under your name. Keep it human." htmlFor="s-note">
              <TextInput id="s-note" value={form.note} onChange={(v) => set({ note: v })} maxLength={90} />
            </Field>
          </Group>

          <Group
            title="What kind of date"
            body="The most important thing on this page. Ask Loose Leaf for coffee and only places tagged for coffee come back — so tag what's true, not what's flattering."
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

          <Group title="Photos">
            <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
              <PhotoSlot
                label="Logo"
                aspect="aspect-square"
                path={form.logoPath}
                url={form.logoPath && media.publicUrl(form.logoPath)}
                busy={uploading === 'logo'}
                onPick={(f) => pick('logo', f)}
                onClear={() => set({ logoPath: null })}
              />
              <PhotoSlot
                label="Cover photo"
                path={form.coverPath}
                url={form.coverPath && media.publicUrl(form.coverPath)}
                busy={uploading === 'cover'}
                onPick={(f) => pick('cover', f)}
                onClear={() => set({ coverPath: null })}
              />
            </div>

            <div>
              <p className="label">
                Gallery{' '}
                <span className="font-normal text-mist">
                  ({form.galleryPaths.length}/{galleryMax})
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {form.galleryPaths.map((p, i) => (
                  <div key={p} className="relative">
                    <PhotoSlot
                      label=""
                      aspect="aspect-square"
                      path={p}
                      url={media.publicUrl(p)}
                      onPick={() => {}}
                      onClear={() => set({ galleryPaths: form.galleryPaths.filter((x) => x !== p) })}
                    />
                    {/* Arrows rather than drag-and-drop: this gets used on a
                        phone behind a counter, where dragging a thumbnail
                        inside a scrolling page is a fight. */}
                    {form.galleryPaths.length > 1 && (
                      <div className="absolute bottom-2 left-2 flex gap-1">
                        <button
                          type="button"
                          disabled={i === 0}
                          aria-label="Move earlier"
                          onClick={() => set({ galleryPaths: move(form.galleryPaths, i, i - 1) })}
                          className="press flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-graphite shadow-paper transition disabled:opacity-30 hover:text-navy"
                        >
                          <IconBack size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={i === form.galleryPaths.length - 1}
                          aria-label="Move later"
                          onClick={() => set({ galleryPaths: move(form.galleryPaths, i, i + 1) })}
                          className="press flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-graphite shadow-paper transition disabled:opacity-30 hover:text-navy"
                        >
                          <IconChevron size={13} />
                        </button>
                      </div>
                    )}
                    {i === 0 && (
                      <span className="absolute left-2 top-2 rounded-full bg-navy/85 px-2 py-0.5 text-[10px] font-medium text-paper">
                        First
                      </span>
                    )}
                  </div>
                ))}
                {form.galleryPaths.length < galleryMax && (
                  <PhotoSlot
                    label=""
                    aspect="aspect-square"
                    busy={uploading === 'gallery'}
                    onPick={(f) => pick('gallery', f)}
                    onClear={() => {}}
                  />
                )}
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
                The first photo is the one students see beside your cover.
              </p>
            </div>
          </Group>

          <Group title="Where and when">
            <Field label="Address" htmlFor="s-addr">
              <TextInput id="s-addr" value={form.addressLine} onChange={(v) => set({ addressLine: v })} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Walk from campus" hint="Minutes." htmlFor="s-walk">
                <TextInput id="s-walk" inputMode="numeric" value={String(form.walkMinutes ?? '')} onChange={(v) => set({ walkMinutes: v.replace(/\D/g, '') })} />
              </Field>
              <Field label="Distance from campus" hint="Miles." htmlFor="s-dist">
                <TextInput id="s-dist" inputMode="decimal" value={String(form.distanceMiles ?? '')} onChange={(v) => set({ distanceMiles: v.replace(/[^0-9.]/g, '') })} />
              </Field>
            </div>
            <Field label="Hours">
              <HoursEditor value={form.hours} onChange={(v) => set({ hours: v })} />
            </Field>
          </Group>

          <Group title="The details people ask about">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Website" htmlFor="s-web">
                <TextInput id="s-web" value={form.website} onChange={(v) => set({ website: v })} placeholder="https://" />
              </Field>
              <Field label="Phone" htmlFor="s-phone">
                <TextInput id="s-phone" value={form.phone} onChange={(v) => set({ phone: v })} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Indoor / outdoor" htmlFor="s-io">
                <Select
                  id="s-io"
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
              <Field label="Reservations" htmlFor="s-res">
                <Select
                  id="s-res"
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
              <Field label="Minimum age" hint="Leave empty if there isn't one." htmlFor="s-age">
                <TextInput id="s-age" inputMode="numeric" value={String(form.minAge ?? '')} onChange={(v) => set({ minAge: v.replace(/\D/g, '') })} placeholder="21" />
              </Field>
            </div>

            <Field label="Visibility" hint="Unpublished takes you off Date Spots without cancelling anything.">
              <label className="flex items-center gap-3 rounded-2xl border border-rule bg-white px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(e) => set({ isPublished: e.target.checked })}
                  className="h-4 w-4 accent-[#FF6468]"
                />
                <span className="text-[14px] text-navy">Show my Date Spot to students</span>
              </label>
            </Field>
          </Group>

          <div className="border-t border-rule pt-6">
            <Button variant="coral" size="lg" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
            </Button>
          </div>
        </div>

        {/* live preview */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 font-hand text-[17px] text-graphite">what students see</p>
          <DateSpotCard spot={preview} />
          {!spot?.is_published && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
              Not published yet — this is a preview only.
            </p>
          )}
        </aside>
      </div>

      <AddLocationSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={addLocation}
      />
    </>
  )
}

/**
 * A second address. Only the street is required — walk and distance can be
 * filled in later, and a location with neither still shows up, just without a
 * "9 min walk" on the card.
 */
function AddLocationSheet({ open, onClose, onAdd }) {
  const blank = { label: '', address_line: '', city: '', region: '', postal_code: '', walk_minutes: '', distance_miles: '' }
  const [row, setRow] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setRow(blank)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (patch) => setRow((r) => ({ ...r, ...patch }))
  const ready = row.address_line.trim().length > 3

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a location"
      subtitle="Each one gets its own Date Spot, with its own hours and its own walk from campus."
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        <Field label="Name this one" hint="How you tell them apart — Kerrytown, Main Street." htmlFor="loc-label">
          <TextInput id="loc-label" value={row.label} onChange={(v) => set({ label: v })} placeholder="Kerrytown" />
        </Field>
        <Field label="Street address" htmlFor="loc-addr">
          <TextInput id="loc-addr" value={row.address_line} onChange={(v) => set({ address_line: v })} placeholder="410 N Fourth Ave" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="City" htmlFor="loc-city">
            <TextInput id="loc-city" value={row.city} onChange={(v) => set({ city: v })} />
          </Field>
          <Field label="State" htmlFor="loc-region">
            <TextInput id="loc-region" value={row.region} onChange={(v) => set({ region: v })} />
          </Field>
          <Field label="ZIP" htmlFor="loc-zip">
            <TextInput id="loc-zip" value={row.postal_code} onChange={(v) => set({ postal_code: v })} />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Walk from campus" hint="Minutes." htmlFor="loc-walk">
            <TextInput id="loc-walk" inputMode="numeric" value={row.walk_minutes} onChange={(v) => set({ walk_minutes: v.replace(/\D/g, '') })} />
          </Field>
          <Field label="Distance from campus" hint="Miles." htmlFor="loc-dist">
            <TextInput id="loc-dist" inputMode="decimal" value={row.distance_miles} onChange={(v) => set({ distance_miles: v.replace(/[^0-9.]/g, '') })} />
          </Field>
        </div>

        {error && <p className="text-[13.5px] leading-relaxed text-coral-deep">{error}</p>}
      </div>

      <Button
        variant="coral"
        size="lg"
        full
        className="mt-6"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await onAdd({
              label: row.label.trim() || null,
              address_line: row.address_line.trim(),
              city: row.city || null,
              region: row.region || null,
              postal_code: row.postal_code || null,
              walk_minutes: row.walk_minutes ? Number(row.walk_minutes) : null,
              distance_miles: row.distance_miles ? Number(row.distance_miles) : null,
            })
          } catch (e) {
            setError(e.message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Adding…' : 'Add it'}
      </Button>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-mist">
        It starts unpublished, so you can fill in the details before students see it.
      </p>
    </Sheet>
  )
}

/** Single-campus for now; the column exists because that changes later. */
async function firstCampusId() {
  const { supabase } = await import('../../../lib/supabase')
  const { data, error } = await supabase.from('universities').select('id').order('created_at').limit(1)
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('No campus is set up yet.')
  return data[0].id
}

/** Immutable single-item reorder. */
function move(list, from, to) {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
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
