import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHead } from '../DashboardLayout'
import PlanCards from '../../../components/partners/PlanCards'
import Button from '../../../components/ui/Button'
import { usePartnerAccount } from '../../../state/partnerAccount'
import { money, performanceFeeLine, planById } from '../../../lib/partnerPlans'
import * as partners from '../../../services/partners'

/**
 * ── Billing ─────────────────────────────────────────────────────────────────
 *
 * Card details never touch this app. Checkout and every change afterwards
 * happen on Stripe's own pages, reached through a URL minted by an edge
 * function that holds the secret key — the browser only ever sees a redirect.
 *
 * The one thing worth reading twice: coming back from Stripe with
 * `?checkout=success` is a *hint*, not proof. All it does here is trigger a
 * refetch and show a "give it a moment" line. The subscription becomes real
 * when the webhook says so, because a redirect URL is something a person can
 * type.
 */
export default function Billing() {
  const { partner, refresh } = usePartnerAccount()
  const [params, setParams] = useSearchParams()

  const [plans, setPlans] = useState([])
  const [sub, setSub] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const justReturned = params.get('checkout') === 'success'

  useEffect(() => {
    partners.plans().then(setPlans).catch(() => {})
  }, [])

  useEffect(() => {
    if (!partner) return
    let live = true
    partners
      .subscription(partner.id)
      .then((s) => live && setSub(s))
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
      const rows = await refresh()
      const live = rows.find((p) => p.id === partner.id)
      if (live?.subStatus === 'active' || tries >= 6) {
        clearInterval(id)
        if (live?.subStatus === 'active') {
          setParams({}, { replace: true })
        }
      }
    }, 2500)
    return () => clearInterval(id)
  }, [justReturned, partner, refresh, setParams])

  async function start(planId) {
    setBusy(planId)
    setError(null)
    try {
      const url = await partners.checkoutUrl(
        partner.id,
        planId,
        `${window.location.origin}/partners/dashboard/billing?checkout=success`
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

  const plan = planById(plans, partner?.planId)
  const active = ['active', 'trialing'].includes(partner?.subStatus)
  const feeLine = performanceFeeLine(plan, sub)

  return (
    <>
      <PageHead title="Billing" subtitle="Handled by Stripe. We never see or store your card." />

      {justReturned && !active && (
        <p className="mb-6 rounded-2xl border border-notebook/50 bg-notebook-soft px-4 py-3 text-[13.5px] leading-relaxed text-[#2F5C99]">
          Thanks — Stripe is confirming the payment. This usually takes a few seconds; the page will
          update itself.
        </p>
      )}

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
          {error}
        </p>
      )}

      {/* current plan */}
      <section className="rounded-card border border-rule bg-white px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[12.5px] font-medium text-mist">Current plan</p>
            <p className="mt-1.5 font-display text-[26px] font-semibold leading-tight text-navy">
              {plan?.name ?? 'No plan yet'}
            </p>
            {plan && (
              <p className="mt-1 text-[15px] text-graphite">
                {money(plan.monthly_cents)}/month
                {feeLine && <span className="text-mist"> · {feeLine}</span>}
              </p>
            )}
          </div>

          <dl className="flex gap-8">
            <div>
              <dt className="text-[12.5px] text-mist">Status</dt>
              <dd className="mt-1 text-[14.5px] font-medium capitalize text-navy">
                {statusWord(partner?.subStatus)}
              </dd>
            </div>
            {partner?.periodEnd && (
              <div>
                <dt className="text-[12.5px] text-mist">
                  {partner.cancelAtEnd ? 'Ends' : 'Next billing date'}
                </dt>
                <dd className="mt-1 text-[14.5px] font-medium text-navy">
                  {new Date(partner.periodEnd).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {active && (
          <div className="mt-6 flex flex-wrap gap-3 border-t border-rule pt-5">
            <Button variant="outline" size="md" onClick={manage} disabled={busy === 'portal'}>
              {busy === 'portal' ? 'Opening…' : 'Manage billing'}
            </Button>
            <p className="max-w-[44ch] self-center text-[12.5px] leading-relaxed text-mist">
              Change your card, download invoices, or cancel — all on Stripe.
            </p>
          </div>
        )}

        {['past_due', 'unpaid'].includes(partner?.subStatus) && (
          <div className="mt-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-4">
            <p className="text-[14px] font-medium text-coral-deep">Your last payment didn’t go through.</p>
            <p className="mt-1.5 max-w-[54ch] text-[13.5px] leading-relaxed text-coral-deep/90">
              Your Date Spot is hidden from students until it clears. Everything else — your
              profile, your offers, your history — is exactly where you left it.
            </p>
            <Button variant="coral" size="md" className="mt-4" onClick={manage} disabled={busy === 'portal'}>
              Update payment method
            </Button>
          </div>
        )}
      </section>

      {/* plans */}
      <section className="mt-9">
        <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
          {active ? 'Change plan' : 'Choose a plan'}
        </h2>

        <PlanCards
          plans={plans}
          currentPlanId={partner?.planId}
          onSelect={active ? manage : start}
          ctaLabel={active ? 'Switch' : busy ? 'Opening Stripe…' : 'Choose plan'}
        />

        <p className="mt-6 max-w-[62ch] text-[13px] leading-relaxed text-mist">
          Prices and what each plan unlocks are read live from Loose Leaf, so what you see here is
          what you’ll be charged. If a plan ever includes a per-verified-date fee, it will be named
          on the card above before it appears on an invoice.
        </p>
      </section>
    </>
  )
}

function statusWord(status) {
  switch (status) {
    case 'active':
      return 'Active'
    case 'trialing':
      return 'Trial'
    case 'past_due':
      return 'Payment failed'
    case 'unpaid':
      return 'Unpaid'
    case 'canceled':
      return 'Cancelled'
    case 'incomplete':
      return 'Not finished'
    default:
      return 'Not set up'
  }
}
