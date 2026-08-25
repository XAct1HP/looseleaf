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
  // idle · checking · done · none · unreachable — the last two are the states
  // that used to not exist, which is why the banner could never resolve.
  const [checking, setChecking] = useState('idle')
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

  // Stripe has redirected back. Ask Stripe what the card situation actually
  // is, rather than waiting to be told by a webhook that might not arrive —
  // that wait is what left a partner staring at "this usually takes a few
  // seconds" for several minutes with no way out.
  //
  // The redirect is not being trusted here. It decides that we should go and
  // look; `partner-billing-sync` asks Stripe, and Stripe decides what is true.
  // Typing `?billing=ok` into the address bar gets you a reconcile that
  // reports no card.
  useEffect(() => {
    if (!justReturned || !partner) return
    let live = true
    let tries = 0
    let timer

    async function check() {
      tries += 1
      let result = null
      try {
        result = await partners.syncBilling(partner.id)
      } catch {
        /* fall through to the reload below; the summary is still worth having */
      }
      if (!live) return

      const s = await load()
      if (!live) return

      if (s?.has_card) {
        setParams({}, { replace: true })
        setChecking('done')
        return
      }

      // Stripe unreachable (has_card === null) is worth one more go. A clean
      // "no card" after a successful sync is a real answer, so stop asking.
      const unreachable = result && result.has_card === null
      if (tries >= 3 && !unreachable) {
        setChecking('none')
        return
      }
      if (tries >= 5) {
        setChecking('unreachable')
        return
      }
      timer = setTimeout(check, 2000)
    }

    setChecking('checking')
    check()

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [justReturned, partner, load, setParams])

  /** Manual retry, for when the automatic pass above gave up. */
  async function recheck() {
    setChecking('checking')
    setError(null)
    try {
      await partners.syncBilling(partner.id)
      const s = await load()
      if (s?.has_card) {
        setParams({}, { replace: true })
        setChecking('done')
      } else {
        setChecking('none')
      }
    } catch (e) {
      setError(e.message)
      setChecking('unreachable')
    }
  }

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

      {/* Every one of these ends somewhere. The version of this banner that
          only had the first state could sit on "a few seconds" forever, which
          is worse than an error — an error at least tells you to do something. */}
      {justReturned && !summary?.has_card && checking === 'checking' && (
        <p className="mb-6 rounded-2xl border border-notebook/50 bg-notebook-soft px-4 py-3 text-[13.5px] leading-relaxed text-[#2F5C99]">
          Checking with Stripe…
        </p>
      )}

      {justReturned && !summary?.has_card && checking === 'none' && (
        <div className="mb-6 rounded-card border border-[#C9821F]/30 bg-[#FBF3E4] px-5 py-5">
          <p className="text-[15px] font-medium text-navy">
            Stripe doesn’t show a payment method on this account yet.
          </p>
          <p className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed text-graphite">
            If you closed the Stripe page before finishing, nothing was saved — start again below.
            If you did complete it, give it a moment and check once more.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" size="md" onClick={recheck}>
              Check again
            </Button>
            <Button variant="coral" size="md" onClick={addCard} disabled={busy === 'card'}>
              {busy === 'card' ? 'Opening…' : 'Add a card'}
            </Button>
          </div>
        </div>
      )}

      {justReturned && !summary?.has_card && checking === 'unreachable' && (
        <div className="mb-6 rounded-card border border-coral/30 bg-coral-wash px-5 py-5">
          <p className="text-[15px] font-medium text-coral-deep">
            We can’t reach Stripe right now.
          </p>
          <p className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed text-coral-deep/90">
            Your card is almost certainly fine — we just can’t confirm it this second, and we’d
            rather say so than tell you something wrong. Nothing has been changed.
          </p>
          <Button variant="outline" size="md" className="mt-4" onClick={recheck}>
            Try again
          </Button>
        </div>
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
              {/* Named rather than assumed. Telling somebody who paid with
                  their bank account that their *card* is on file is a small
                  lie that makes them doubt everything else on the page. */}
              <dt className="text-[12.5px] text-mist">Payment method</dt>
              <dd className="mt-1 text-[14.5px] font-medium text-navy">
                {summary?.has_card ? (summary.payment_method ?? 'On file') : 'None yet'}
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
