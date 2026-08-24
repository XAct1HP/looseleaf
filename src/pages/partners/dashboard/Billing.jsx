import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHead } from '../DashboardLayout'
import CreditMeter from '../../../components/partners/CreditMeter'
import Pricing from '../../../components/partners/Pricing'
import Button from '../../../components/ui/Button'
import { usePartnerAccount } from '../../../state/partnerAccount'
import { billingNotice, fee, money } from '../../../lib/partnerBilling'
import * as partners from '../../../services/partners'

/**
 * ── Billing ─────────────────────────────────────────────────────────────────
 *
 * There is no plan to change any more, so this page answers three questions
 * and nothing else: is there a card, what have we run up this month, and how
 * much further can we go before Loose Leaf wants paying.
 *
 * Card details never touch this app. Adding one and every change afterwards
 * happen on Stripe's own pages, reached through a URL minted by an edge
 * function that holds the secret key — the browser only ever sees a redirect.
 *
 * The one thing worth reading twice: coming back from Stripe with
 * `?billing=ok` is a *hint*, not proof. All it does here is trigger a refetch
 * and show a "give it a moment" line. The card becomes real when the webhook
 * writes `payment_method_at`, because a redirect URL is something a person
 * can type.
 */
export default function Billing() {
  const { partner } = usePartnerAccount()
  const [params, setParams] = useSearchParams()

  const [summary, setSummary] = useState(null)
  const [ledger, setLedger] = useState([])
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const justReturned = params.get('billing') === 'ok'

  const load = useCallback(async () => {
    if (!partner) return null
    const s = await partners.billingSummary(partner.id).catch(() => null)
    setSummary(s)
    return s
  }, [partner])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!partner) return
    let live = true
    partners
      .billableRedemptions(partner.id, 25)
      .then((rows) => live && setLedger(rows))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [partner])

  // Stripe has redirected back. Poll briefly for the webhook to land, then
  // stop — this is a nicety, not the source of truth.
  useEffect(() => {
    if (!justReturned || !partner) return
    let tries = 0
    const id = setInterval(async () => {
      tries += 1
      const s = await load()
      if (s?.has_card || tries >= 6) {
        clearInterval(id)
        if (s?.has_card) setParams({}, { replace: true })
      }
    }, 2500)
    return () => clearInterval(id)
  }, [justReturned, partner, load, setParams])

  async function addCard() {
    setBusy('card')
    setError(null)
    try {
      const url = await partners.billingSetupUrl(
        partner.id,
        `${window.location.origin}/partners/dashboard/billing?billing=ok`
      )
      window.location.assign(url)
    } catch (e) {
      setError(e.message)
      setBusy(null)
    }
  }

  async function manage() {
    setBusy('portal')
    setError(null)
    try {
      const url = await partners.billingPortalUrl(
        partner.id,
        `${window.location.origin}/partners/dashboard/billing`
      )
      window.location.assign(url)
    } catch (e) {
      setError(e.message)
      setBusy(null)
    }
  }

  const notice = billingNotice(summary)

  return (
    <>
      <PageHead
        title="Billing"
        subtitle="Free to be here. You pay only for Date Passes your staff actually scanned."
      />

      {justReturned && !summary?.has_card && (
        <p className="mb-6 rounded-2xl border border-notebook/50 bg-notebook-soft px-4 py-3 text-[13.5px] leading-relaxed text-[#2F5C99]">
          Thanks — Stripe is confirming your card. This usually takes a few seconds; the page will
          update itself.
        </p>
      )}

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
          {error}
        </p>
      )}

      {notice && (
        <div
          className={`mb-7 rounded-card border px-5 py-5 ${
            notice.tone === 'bad'
              ? 'border-coral/30 bg-coral-wash'
              : notice.tone === 'warn'
                ? 'border-[#C9821F]/30 bg-[#FBF3E4]'
                : 'border-notebook/50 bg-notebook-soft'
          }`}
        >
          <p
            className={`text-[15px] font-medium ${
              notice.tone === 'bad' ? 'text-coral-deep' : 'text-navy'
            }`}
          >
            {notice.title}
          </p>
          <p className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed text-graphite">
            {notice.body}
          </p>
          <Button
            variant={notice.tone === 'ask' ? 'coral' : 'outline'}
            size="md"
            className="mt-4"
            onClick={summary?.has_card ? manage : addCard}
            disabled={Boolean(busy)}
          >
            {busy ? 'Opening…' : notice.cta}
          </Button>
        </div>
      )}

      {/* this month */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-card border border-rule bg-white px-6 py-6">
          <p className="text-[12.5px] font-medium text-mist">This month so far</p>
          <p className="mt-1.5 font-display text-[30px] font-semibold leading-tight text-navy">
            {money(summary?.this_month_cents ?? 0)}
          </p>
          <p className="mt-1 text-[14.5px] text-graphite">
            {summary?.this_month_count ?? 0}{' '}
            {(summary?.this_month_count ?? 0) === 1 ? 'redemption' : 'redemptions'} ·{' '}
            {fee(summary?.fee_cents ?? 150)} each
          </p>

          <dl className="mt-5 flex flex-wrap gap-x-9 gap-y-3 border-t border-rule pt-4">
            <div>
              <dt className="text-[12.5px] text-mist">Last month</dt>
              <dd className="mt-1 text-[14.5px] font-medium tabular-nums text-navy">
                {money(summary?.last_month_cents ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-mist">Card on file</dt>
              <dd className="mt-1 text-[14.5px] font-medium capitalize text-navy">
                {summary?.has_card ? 'Yes' : 'None yet'}
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-mist">Invoices paid</dt>
              <dd className="mt-1 text-[14.5px] font-medium tabular-nums text-navy">
                {summary?.paid_invoices ?? 0}
              </dd>
            </div>
          </dl>

          {summary?.has_card && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
              <Button variant="outline" size="md" onClick={manage} disabled={busy === 'portal'}>
                {busy === 'portal' ? 'Opening…' : 'Manage billing'}
              </Button>
              <p className="max-w-[38ch] text-[12.5px] leading-relaxed text-mist">
                Change your card, download invoices, or close the account — all on Stripe.
              </p>
            </div>
          )}
        </div>

        <CreditMeter summary={summary} />
      </section>

      {/* the ledger */}
      <section className="mt-9">
        <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
          Recent redemptions
        </h2>
        <p className="mb-4 max-w-[62ch] text-[13px] leading-relaxed text-mist">
          Every line here is a pass one of your staff scanned, priced at the fee in force when it
          happened. This is the same list your invoice is built from — if a total ever looks wrong,
          this is where to check it.
        </p>

        <div className="overflow-x-auto rounded-card border border-rule bg-white">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="border-b border-rule text-[12px] uppercase tracking-[0.06em] text-mist">
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Offer</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Fee</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-[14px] text-mist">
                    Nothing yet. Nothing to pay, either.
                  </td>
                </tr>
              )}
              {ledger.map((row) => (
                <tr key={row.id} className="border-b border-rule/60 last:border-0">
                  <td className="px-5 py-3 text-[14px] text-graphite">
                    {new Date(row.redeemed_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-5 py-3 text-[14px] text-navy">{row.offer_title}</td>
                  <td className="px-5 py-3 text-[13.5px] text-mist">{statusWord(row.bill_status)}</td>
                  <td className="px-5 py-3 text-right text-[14px] font-medium tabular-nums text-navy">
                    {row.fee_cents ? money(row.fee_cents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* the deal, restated */}
      <section className="mt-9">
        <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
          How pricing works
        </h2>
        <Pricing feeCents={summary?.fee_cents ?? 150} compact />
        <p className="mt-6 max-w-[62ch] text-[13px] leading-relaxed text-mist">
          The fee is read live from Loose Leaf, so what you see here is what you will be charged.
          A redemption is priced when it is scanned — if we ever change the fee, it applies to
          what happens after the change and never to what already did.
        </p>
      </section>
    </>
  )
}

function statusWord(status) {
  switch (status) {
    case 'pending':
      return 'Not yet billed'
    case 'metered':
      return 'On this month’s bill'
    case 'invoiced':
      return 'Invoiced'
    case 'paid':
      return 'Paid'
    case 'waived':
      return 'Waived'
    case 'failed':
      return 'Payment failed'
    default:
      return '—'
  }
}
