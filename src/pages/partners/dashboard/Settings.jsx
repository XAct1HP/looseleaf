import { useEffect, useState } from 'react'
import { PageHead } from '../DashboardLayout'
import Button from '../../../components/ui/Button'
import { Field, TextInput, TextArea, TagPicker, DayPicker } from '../../../components/partners/fields'
import { usePartnerAccount } from '../../../state/partnerAccount'
import { can } from '../../../lib/partnerBilling'
import RoleAccess from '../../../components/partners/RoleAccess'
import { InstallLink } from '../../../components/partners/InstallNudge'
import * as partners from '../../../services/partners'
import { DATE_TYPE_TAGS, VIBE_TAGS } from '../../../data/partnerCatalog'

/**
 * Contact details, and targeting.
 *
 * Targeting sits here rather than on its own page because of what it actually
 * is: a way to say "not those nights, not that kind of date" — a set of
 * exclusions, not a media buy. Nothing on this page can make Loose Leaf
 * recommend a business more often; every control on it can only narrow. The
 * copy says so plainly, because a partner who believes they are buying
 * placement will be disappointed by the results and right to be.
 */
export default function Settings() {
  const { partner, entitlements, refresh } = usePartnerAccount()

  const [details, setDetails] = useState(null)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)

  const canTarget = can(entitlements, 'targeting')

  useEffect(() => {
    if (!partner) return
    setDetails({
      description: '',
      website: '',
      phone: '',
    })
    partners
      .targeting(partner.id)
      .then((t) =>
        setTarget(
          t ?? {
            date_types: [],
            vibes: [],
            price_levels: [],
            days_of_week: [0, 1, 2, 3, 4, 5, 6],
            start_time: '',
            end_time: '',
            is_paused: false,
          }
        )
      )
      .catch(() => {})
  }, [partner])

  async function saveTargeting() {
    setBusy(true)
    setError(null)
    try {
      await partners.saveTargeting(partner.id, {
        date_types: target.date_types ?? [],
        vibes: target.vibes ?? [],
        price_levels: target.price_levels ?? [],
        days_of_week: target.days_of_week?.length ? target.days_of_week : [0, 1, 2, 3, 4, 5, 6],
        start_time: target.start_time || null,
        end_time: target.end_time || null,
        is_paused: Boolean(target.is_paused),
      })
      setSaved('targeting')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveDetails() {
    setBusy(true)
    setError(null)
    try {
      await partners.update(partner.id, {
        description: details.description || null,
        website: details.website || null,
        phone: details.phone || null,
      })
      await refresh()
      setSaved('details')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!partner) return null

  return (
    <>
      <PageHead
        title="Settings"
        subtitle="Who on your team can reach what, who to contact, and when Loose Leaf should consider you."
      />

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      {/* who can see what */}
      <RoleAccess className="mb-6" />

      {/* Owners and managers reach this here; staff cannot — `partner_can()`
          refuses `settings` before it reads the column — so their copy of this
          lives permanently in the scanner-only header instead. */}
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-rule bg-white px-6 py-5">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold leading-tight">
            The scanner on your own phone
          </h2>
          <p className="mt-1.5 max-w-[56ch] text-[13.5px] leading-relaxed text-graphite">
            Adds it to your home screen so it opens straight to the camera, with no browser chrome
            in the way. Your team can do the same from their own screen; there’s a printable card
            for them on the Team page.
          </p>
        </div>
        <InstallLink className="rounded-xl border border-rule px-4 py-2.5 hover:border-coral/40">
          Add to home screen
        </InstallLink>
      </section>

      {/* targeting */}
      <section className="rounded-card border border-rule bg-white px-6 py-6">
        <h2 className="font-display text-[20px] font-semibold leading-tight">
          When should Loose Leaf consider you?
        </h2>
        <p className="mt-2.5 max-w-[62ch] text-[14px] leading-relaxed text-graphite">
          These narrow when you’re eligible — they can’t widen it. Loose Leaf still decides what to
          suggest based on whether you actually fit what two people asked for. Leaving everything
          unticked means “no preference”, which is the right answer for most places.
        </p>

        {!canTarget ? (
          <div className="mt-5 rounded-2xl border border-notebook/40 bg-notebook-soft/60 px-5 py-4">
            <p className="text-[14px] leading-relaxed text-graphite">
              Targeting isn’t switched on for this account. Loose Leaf uses your Date Spot’s own
              tags and hours instead, which for most partners is the same answer.
            </p>
          </div>
        ) : target ? (
          <div className="mt-6 space-y-6">
            <Field label="Only for these date types" hint="Leave empty for all of them.">
              <TagPicker
                options={DATE_TYPE_TAGS}
                value={target.date_types ?? []}
                onChange={(v) => setTarget({ ...target, date_types: v })}
              />
            </Field>

            <Field label="Only for these vibes" hint="Leave empty for all of them.">
              <TagPicker
                options={VIBE_TAGS}
                value={target.vibes ?? []}
                onChange={(v) => setTarget({ ...target, vibes: v })}
              />
            </Field>

            <Field label="Only on these days">
              <DayPicker
                value={target.days_of_week ?? []}
                onChange={(d) => setTarget({ ...target, days_of_week: d })}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="From" hint="Leave empty for any time." htmlFor="t-start">
                <input
                  id="t-start"
                  type="time"
                  value={target.start_time ?? ''}
                  onChange={(e) => setTarget({ ...target, start_time: e.target.value })}
                  className="field"
                />
              </Field>
              <Field label="Until" htmlFor="t-end">
                <input
                  id="t-end"
                  type="time"
                  value={target.end_time ?? ''}
                  onChange={(e) => setTarget({ ...target, end_time: e.target.value })}
                  className="field"
                />
              </Field>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-rule bg-cream/50 px-4 py-3.5">
              <input
                type="checkbox"
                checked={Boolean(target.is_paused)}
                onChange={(e) => setTarget({ ...target, is_paused: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[#FF6468]"
              />
              <span>
                <span className="block text-[14px] font-medium text-navy">
                  Pause recommendations for now
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-mist">
                  Renovating, short-staffed, or just want a quiet month. Your Date Spot stays up;
                  Loose Leaf simply stops suggesting you.
                </span>
              </span>
            </label>

            <Button variant="coral" size="md" onClick={saveTargeting} disabled={busy}>
              {busy ? 'Saving…' : saved === 'targeting' ? 'Saved ✓' : 'Save targeting'}
            </Button>
          </div>
        ) : null}
      </section>

      {/* contact */}
      {details && (
        <section className="mt-6 rounded-card border border-rule bg-white px-6 py-6">
          <h2 className="font-display text-[20px] font-semibold leading-tight">Business details</h2>
          <p className="mt-2 text-[13.5px] text-graphite">
            Your name, category and photos live on the Date Spot page.
          </p>

          <div className="mt-6 space-y-5">
            <Field label="About the place" hint="Shown on your Date Spot." htmlFor="set-desc">
              <TextArea
                id="set-desc"
                value={details.description}
                onChange={(v) => setDetails({ ...details, description: v })}
                maxLength={300}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Website" htmlFor="set-web">
                <TextInput
                  id="set-web"
                  value={details.website}
                  onChange={(v) => setDetails({ ...details, website: v })}
                  placeholder="https://"
                />
              </Field>
              <Field label="Phone" htmlFor="set-phone">
                <TextInput
                  id="set-phone"
                  value={details.phone}
                  onChange={(v) => setDetails({ ...details, phone: v })}
                />
              </Field>
            </div>

            <Button variant="outline" size="md" onClick={saveDetails} disabled={busy}>
              {busy ? 'Saving…' : saved === 'details' ? 'Saved ✓' : 'Save details'}
            </Button>
          </div>
        </section>
      )}

      {/* what we don't share */}
      <section className="mt-6 rounded-card border border-rule bg-cream/60 px-6 py-6">
        <h2 className="font-display text-[18px] font-semibold leading-tight">
          What Loose Leaf never sends you.
        </h2>
        <ul className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-graphite">
          <li>· Names, photos, or profiles of the people who visit</li>
          <li>· Anything either of them said to the other</li>
          <li>· What they’re looking for, or who they matched with</li>
          <li>· Why Loose Leaf thought your place suited them</li>
        </ul>
        <p className="mt-4 max-w-[62ch] text-[13px] leading-relaxed text-mist">
          This isn’t a setting, which is the point — it’s how the database is built. There is no
          switch on this page that could turn it off.
        </p>
      </section>
    </>
  )
}
