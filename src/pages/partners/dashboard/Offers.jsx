import { useEffect, useState } from 'react'
import { PageHead } from '../DashboardLayout'
import Button from '../../../components/ui/Button'
import Sheet from '../../../components/ui/Sheet'
import { Chip } from '../../../components/ui/Chip'
import { Field, TextInput, TextArea, Select, DayPicker, MoneyInput } from '../../../components/partners/fields'
import { IconSpark } from '../../../components/ui/Icons'
import { usePartnerAccount } from '../../../state/partnerAccount'
import { can, limit, fee } from '../../../lib/partnerBilling'
import { Link } from 'react-router-dom'
import * as partners from '../../../services/partners'
import { daysText } from '../../../data/partnerCatalog'

/**
 * Offer management, built around the thing restaurants actually asked for:
 * control over *when*. A Sunday–Thursday, 4pm-to-close, hundred-a-month offer
 * is the normal case, not the advanced one — so those controls are on the main
 * form rather than behind "advanced".
 */

const OFFER_TYPES = [
  { id: 'percent_off', label: 'Percentage off' },
  { id: 'amount_off', label: 'Dollars off' },
  { id: 'free_item', label: 'Something free' },
  { id: 'bogo', label: 'Buy one, get one' },
  { id: 'spend_threshold', label: 'Off a minimum spend' },
  { id: 'package', label: 'A couple package' },
  { id: 'custom', label: 'Something else' },
]

const blank = {
  title: '',
  offer_type: 'percent_off',
  percent_off: 15,
  amount_off_cents: null,
  min_spend_cents: null,
  free_item: '',
  description: '',
  terms: '',
  starts_on: '',
  ends_on: '',
  days_of_week: [0, 1, 2, 3, 4],
  start_time: '',
  end_time: '',
  max_total_redemptions: '',
  max_monthly_redemptions: 100,
  max_daily_redemptions: '',
  new_customers_only: false,
  multi_use: false,
  pass_valid_days: 14,
  status: 'draft',
}

export default function Offers() {
  const { partner, entitlements } = usePartnerAccount()
  const [list, setList] = useState([])
  const [usage, setUsage] = useState({})
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const allowed = can(entitlements, 'offers')
  const maxActive = limit(entitlements, 'max_active_offers', 0)
  const activeCount = list.filter((o) => o.status === 'active').length

  // Publishing an offer is the moment a business can start owing Loose Leaf
  // money, so it is the moment a card is required — and the only one. Read
  // here purely to explain the situation and disable a button that would
  // fail anyway; the database refuses the redemption regardless of this.
  const [billing, setBilling] = useState(null)
  const canPublish = Boolean(billing?.has_card)

  useEffect(() => {
    if (!partner) return
    let live = true
    partners
      .billingSummary(partner.id)
      .then((b) => live && setBilling(b))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [partner])

  const load = async () => {
    if (!partner) return
    try {
      const rows = await partners.offers(partner.id)
      setList(rows)
      const u = {}
      await Promise.all(
        rows.map(async (o) => {
          u[o.id] = await partners.offerUsage(o.id).catch(() => null)
        })
      )
      setUsage(u)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner])

  if (!allowed) {
    return (
      <>
        <PageHead title="Offers" />
        <div className="rounded-card border border-notebook/40 bg-notebook-soft/60 px-6 py-8">
          <IconSpark size={24} className="text-[#2F5C99]" />
          <h2 className="mt-4 font-display text-[21px] font-semibold leading-tight">
            Offers start at Featured Partner.
          </h2>
          <p className="mt-3 max-w-[54ch] text-[14.5px] leading-relaxed text-graphite">
            On the Date Spot plan you appear where students are browsing, with your photos and your
            hours. An offer is what turns being findable into being chosen — and it comes with the
            control to keep that traffic on the nights you actually want it.
          </p>
          <Button to="/partners/dashboard/billing" variant="coral" size="md" className="mt-6">
            See plans
          </Button>
        </div>
      </>
    )
  }

  async function save(offer) {
    setBusy(true)
    setError(null)
    try {
      await partners.saveOffer(partner.id, clean(offer))
      setEditing(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(offer, status) {
    if (status === 'active' && !canPublish) {
      setError(
        'Add a card before turning an offer on. Nothing is charged until somebody actually ' +
          'redeems a pass — the card is there so we can bill for it when they do.'
      )
      return
    }
    if (status === 'active' && activeCount >= maxActive && offer.status !== 'active') {
      setError(
        `You can run ${maxActive} offer${maxActive === 1 ? '' : 's'} at a time. Pause one first.`
      )
      return
    }
    setError(null)
    await partners.setOfferStatus(offer.id, status).catch((e) => setError(e.message))
    await load()
  }

  return (
    <>
      <PageHead
        title="Offers"
        subtitle={`What Loose Leaf couples get for choosing you. Free to draft; ${fee(billing?.fee_cents ?? 150)} when one is redeemed.`}
        action={
          <Button variant="coral" size="md" onClick={() => setEditing({ ...blank })}>
            New offer
          </Button>
        }
      />

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
          {error}
        </p>
      )}

      {/* The one place billing enters the product before it has to. Framed as
          the next step rather than as a block, because drafting an offer with
          no card is a perfectly reasonable thing to have just done. */}
      {billing && !billing.has_card && (
        <div className="mb-7 rounded-card border border-notebook/50 bg-notebook-soft px-5 py-5">
          <p className="text-[15px] font-medium text-navy">
            Add a card to turn an offer on.
          </p>
          <p className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed text-graphite">
            Nothing is charged for having one. You are billed {fee(billing.fee_cents)} at the end
            of the month for each Date Pass your staff actually scanned, and nothing at all in a
            month where none were. Draft as many offers as you like in the meantime.
          </p>
          <Link
            to="/partners/dashboard/billing"
            className="press focus-ring mt-4 inline-flex items-center rounded-full bg-coral px-4 py-2 text-[14px] font-medium text-white hover:bg-coral-deep"
          >
            Add a card
          </Link>
        </div>
      )}

      {billing?.has_card && !billing.can_issue && (
        <div className="mb-7 rounded-card border border-[#C9821F]/30 bg-[#FBF3E4] px-5 py-5">
          <p className="text-[15px] font-medium text-navy">
            Your offers are paused while an invoice is outstanding.
          </p>
          <p className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed text-graphite">
            They stay exactly as they are and students simply stop being shown them. Passes
            already in someone's hand are still being honoured, and everything comes back on its
            own once the invoice clears.
          </p>
          <Link
            to="/partners/dashboard/billing"
            className="press focus-ring mt-4 inline-flex items-center rounded-full border border-rule px-4 py-2 text-[14px] font-medium text-navy hover:border-navy/25"
          >
            Open billing
          </Link>
        </div>
      )}

      {!list.length ? (
        <div className="rounded-card border border-dashed border-navy/20 bg-white px-6 py-10 text-center">
          <IconSpark size={24} className="mx-auto text-mist" />
          <p className="mt-3 text-[16px] font-medium text-navy">Nothing running yet.</p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[14px] leading-relaxed text-graphite">
            Most partners start with something small on their quiet nights — fifteen percent,
            Sunday to Thursday, capped at a hundred a month.
          </p>
          <Button variant="outline" size="md" className="mt-6" onClick={() => setEditing({ ...blank })}>
            Create your first offer
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <OfferRow
              key={o.id}
              offer={o}
              usage={usage[o.id]}
              onEdit={() => setEditing(o)}
              onStatus={(s) => setStatus(o, s)}
            />
          ))}
        </ul>
      )}

      <OfferSheet
        offer={editing}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </>
  )
}

function OfferRow({ offer, usage, onEdit, onStatus }) {
  const used = Number(usage?.this_month ?? 0)
  const cap = offer.max_monthly_redemptions
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : null

  const tone =
    offer.status === 'active' ? 'moss' : offer.status === 'paused' ? 'cream' : offer.status === 'ended' ? 'default' : 'blue'

  return (
    <li className="rounded-card border border-rule bg-white px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="font-display text-[19px] font-semibold leading-tight text-navy">{offer.title}</p>
            <Chip tone={tone} className="!px-2.5 !py-1 !text-[11.5px] capitalize">
              {offer.status}
            </Chip>
          </div>
          <p className="mt-1.5 text-[14.5px] text-graphite">{summary(offer)}</p>
          <p className="mt-1 text-[12.5px] text-mist">
            {daysText(offer.days_of_week)}
            {offer.start_time && ` · ${timeText(offer.start_time)}–${timeText(offer.end_time) || 'close'}`}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="press focus-ring rounded-xl border border-rule px-3 py-2 text-[13px] font-medium text-graphite hover:border-navy/25 hover:text-navy"
          >
            Edit
          </button>
          {offer.status === 'active' ? (
            <button
              type="button"
              onClick={() => onStatus('paused')}
              className="press focus-ring rounded-xl border border-rule px-3 py-2 text-[13px] font-medium text-graphite hover:border-navy/25 hover:text-navy"
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStatus('active')}
              className="press focus-ring rounded-xl bg-navy px-3 py-2 text-[13px] font-medium text-paper hover:bg-navy-soft"
            >
              {offer.status === 'draft' ? 'Publish' : 'Resume'}
            </button>
          )}
        </div>
      </div>

      {cap != null && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[12.5px] text-graphite">
            <span className="tabular-nums">
              {used} / {cap} Loose Leaf dates this month
            </span>
            <span className="text-mist tabular-nums">
              {usage?.total ?? 0} all time
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream">
            <div
              className={`h-full rounded-full ${pct >= 100 ? 'bg-coral-deep' : 'bg-moss'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {pct >= 100 && (
            <p className="mt-2 text-[12.5px] text-coral-deep">
              Cap reached — this stops being handed out until next month.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

function OfferSheet({ offer, onClose, onSave, busy }) {
  const [form, setForm] = useState(offer)

  useEffect(() => setForm(offer), [offer])
  if (!form) return null

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const ready = form.title.trim().length > 1

  return (
    <Sheet
      open={Boolean(offer)}
      onClose={onClose}
      title={offer?.id ? 'Edit offer' : 'New offer'}
      subtitle="Couples see this on your Date Spot and carry it in as a Date Pass."
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        <Field label="Name it" hint="What a student sees on the pass." htmlFor="o-title">
          <TextInput id="o-title" value={form.title} onChange={(v) => set({ title: v })} placeholder="Weeknight Date" />
        </Field>

        <Field label="What is it?" htmlFor="o-type">
          <Select id="o-type" value={form.offer_type} onChange={(v) => set({ offer_type: v })} options={OFFER_TYPES} placeholder="Choose" />
        </Field>

        {form.offer_type === 'percent_off' && (
          <Field label="How much off?" htmlFor="o-pct">
            <TextInput id="o-pct" inputMode="numeric" value={String(form.percent_off ?? '')} onChange={(v) => set({ percent_off: Number(v.replace(/\D/g, '').slice(0, 3)) || null })} placeholder="15" />
          </Field>
        )}

        {form.offer_type === 'amount_off' && (
          <Field label="How much off?" htmlFor="o-amt">
            <MoneyInput id="o-amt" cents={form.amount_off_cents} onChange={(c) => set({ amount_off_cents: c })} />
          </Field>
        )}

        {form.offer_type === 'spend_threshold' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Amount off" htmlFor="o-amt2">
              <MoneyInput id="o-amt2" cents={form.amount_off_cents} onChange={(c) => set({ amount_off_cents: c })} />
            </Field>
            <Field label="Minimum spend" htmlFor="o-min">
              <MoneyInput id="o-min" cents={form.min_spend_cents} onChange={(c) => set({ min_spend_cents: c })} />
            </Field>
          </div>
        )}

        {form.offer_type === 'free_item' && (
          <Field label="What's free?" htmlFor="o-item">
            <TextInput id="o-item" value={form.free_item ?? ''} onChange={(v) => set({ free_item: v })} placeholder="dessert" />
          </Field>
        )}

        {['package', 'custom'].includes(form.offer_type) && (
          <Field label="Describe it" htmlFor="o-desc">
            <TextInput id="o-desc" value={form.description ?? ''} onChange={(v) => set({ description: v })} placeholder="Two courses and a shared dessert, $45" />
          </Field>
        )}

        <div className="border-t border-rule pt-5">
          <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
            When it runs
          </p>

          <Field label="Days" hint="A Sunday–Thursday offer is never shown on a Friday.">
            <DayPicker value={form.days_of_week ?? []} onChange={(d) => set({ days_of_week: d })} />
          </Field>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="From" hint="Leave empty for all day." htmlFor="o-start">
              <input id="o-start" type="time" value={form.start_time ?? ''} onChange={(e) => set({ start_time: e.target.value })} className="field" />
            </Field>
            <Field label="Until" htmlFor="o-end">
              <input id="o-end" type="time" value={form.end_time ?? ''} onChange={(e) => set({ end_time: e.target.value })} className="field" />
            </Field>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Starts on" hint="Optional." htmlFor="o-from">
              <input id="o-from" type="date" value={form.starts_on ?? ''} onChange={(e) => set({ starts_on: e.target.value })} className="field" />
            </Field>
            <Field label="Ends on" hint="Optional." htmlFor="o-to">
              <input id="o-to" type="date" value={form.ends_on ?? ''} onChange={(e) => set({ ends_on: e.target.value })} className="field" />
            </Field>
          </div>
        </div>

        <div className="border-t border-rule pt-5">
          <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
            How many
          </p>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Per month" htmlFor="o-mcap">
              <TextInput id="o-mcap" inputMode="numeric" value={String(form.max_monthly_redemptions ?? '')} onChange={(v) => set({ max_monthly_redemptions: Number(v.replace(/\D/g, '')) || null })} placeholder="100" />
            </Field>
            <Field label="Per day" hint="Optional." htmlFor="o-dcap">
              <TextInput id="o-dcap" inputMode="numeric" value={String(form.max_daily_redemptions ?? '')} onChange={(v) => set({ max_daily_redemptions: Number(v.replace(/\D/g, '')) || null })} />
            </Field>
            <Field label="Total ever" hint="Optional." htmlFor="o-tcap">
              <TextInput id="o-tcap" inputMode="numeric" value={String(form.max_total_redemptions ?? '')} onChange={(v) => set({ max_total_redemptions: Number(v.replace(/\D/g, '')) || null })} />
            </Field>
          </div>

          <Field
            label="Pass lifetime"
            hint="How long somebody has to actually come in after unlocking it."
            htmlFor="o-life"
          >
            <TextInput id="o-life" inputMode="numeric" value={String(form.pass_valid_days ?? 14)} onChange={(v) => set({ pass_valid_days: Number(v.replace(/\D/g, '')) || 14 })} />
          </Field>

          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-rule bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={Boolean(form.multi_use)}
              onChange={(e) => set({ multi_use: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[#FF6468]"
            />
            <span>
              <span className="block text-[14px] text-navy">Let one pass be used more than once</span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-mist">
                Off by default. With this off, a scanned pass cannot be scanned again.
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-3 rounded-2xl border border-rule bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={Boolean(form.new_customers_only)}
              onChange={(e) => set({ new_customers_only: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[#FF6468]"
            />
            <span className="text-[14px] text-navy">New customers only</span>
          </label>
        </div>

        <Field label="Terms" hint="The small print on the pass." htmlFor="o-terms">
          <TextArea id="o-terms" rows={3} value={form.terms ?? ''} onChange={(v) => set({ terms: v })} maxLength={240} placeholder="Dine-in only. One pass per couple. Not valid with other offers." />
        </Field>
      </div>

      <div className="mt-7 flex gap-3">
        <Button variant="coral" size="lg" full onClick={() => onSave(form)} disabled={!ready || busy}>
          {busy ? 'Saving…' : 'Save offer'}
        </Button>
      </div>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-mist">
        Saving keeps the offer where it is. Publish it from the list when you’re ready.
      </p>
    </Sheet>
  )
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function clean(o) {
  const nul = (v) => (v === '' || v === undefined ? null : v)
  return {
    ...(o.id ? { id: o.id } : {}),
    title: o.title.trim(),
    offer_type: o.offer_type,
    percent_off: o.offer_type === 'percent_off' ? nul(o.percent_off) : null,
    amount_off_cents: ['amount_off', 'spend_threshold'].includes(o.offer_type) ? nul(o.amount_off_cents) : null,
    min_spend_cents: o.offer_type === 'spend_threshold' ? nul(o.min_spend_cents) : null,
    free_item: o.offer_type === 'free_item' ? nul(o.free_item) : null,
    description: nul(o.description),
    terms: nul(o.terms),
    starts_on: nul(o.starts_on),
    ends_on: nul(o.ends_on),
    days_of_week: o.days_of_week?.length ? o.days_of_week : [0, 1, 2, 3, 4, 5, 6],
    start_time: nul(o.start_time),
    end_time: nul(o.end_time),
    max_total_redemptions: nul(o.max_total_redemptions),
    max_monthly_redemptions: nul(o.max_monthly_redemptions),
    max_daily_redemptions: nul(o.max_daily_redemptions),
    new_customers_only: Boolean(o.new_customers_only),
    multi_use: Boolean(o.multi_use),
    pass_valid_days: o.pass_valid_days || 14,
    status: o.status || 'draft',
  }
}

function summary(o) {
  const d = (c) => `$${((c ?? 0) / 100).toFixed(0)}`
  switch (o.offer_type) {
    case 'percent_off':
      return `${o.percent_off}% off your date`
    case 'amount_off':
      return `${d(o.amount_off_cents)} off`
    case 'free_item':
      return `Free ${o.free_item || 'treat'}`
    case 'bogo':
      return 'Buy one, get one'
    case 'spend_threshold':
      return `${d(o.amount_off_cents)} off ${d(o.min_spend_cents)}+`
    default:
      return o.description || o.title
  }
}

function timeText(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`
}
