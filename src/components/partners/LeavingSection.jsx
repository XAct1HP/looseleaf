import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import * as partners from '../../services/partners'
import * as account from '../../services/live/account'

/**
 * ── Leaving, from the business side ─────────────────────────────────────────
 *
 * Two different departures used to have no button at all between them. A
 * partner could pause an offer, remove a colleague, and hand their card to
 * Stripe's portal — but the only way to remove the business was to email us
 * and have staff run `staff_remove_partner`, and there was no way whatsoever
 * to remove a login.
 *
 * They are kept apart here because they are genuinely different decisions and
 * conflating them is how a business ends up with no owner:
 *
 *   · **Close the business.** The Date Spot stops being suggested, the offers
 *     go, the team goes. Owner-only, and refused outright once a redemption
 *     has been invoiced — the ledger is what those invoices were built from,
 *     and suspending does everything closing would do from a student's side.
 *
 *   · **Delete my login.** One person, who may be on other teams. Refused
 *     while they are the sole owner of anything, and it says which.
 *
 * Both confirmations are typed rather than clicked. A red button under a
 * paragraph nobody read is how an account gets closed by somebody who meant
 * to close a tab; typing the name of your own business is four seconds and it
 * makes the sentence above it get read.
 */

function Confirm({ phrase, label, hint, busy, error, onConfirm, onCancel }) {
  const [typed, setTyped] = useState('')
  const ready = typed.trim().toLowerCase() === phrase.toLowerCase()

  return (
    <div className="mt-4 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-4">
      <p className="text-[13.5px] leading-relaxed text-coral-deep">{hint}</p>
      <label className="mt-3 block text-[13px] font-medium text-coral-deep">
        Type <span className="font-semibold">{phrase}</span> to confirm
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="field mt-1.5 !bg-white"
        />
      </label>

      {error && <p className="mt-3 text-[13px] leading-relaxed text-coral-deep">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="danger" size="md" disabled={!ready || busy} onClick={onConfirm}>
          {busy ? 'Working…' : label}
        </Button>
        <Button variant="ghost" size="md" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default function LeavingSection({ partner, onClosed }) {
  const isOwner = partner?.role === 'owner'

  const [open, setOpen] = useState(null) // 'business' | 'login'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [counts, setCounts] = useState(null)
  const [blockers, setBlockers] = useState([])

  // Read before either confirmation is offered, so the paragraph above the box
  // is this business's situation rather than a general warning. The invoiced
  // count in particular decides whether closing is possible at all, and
  // finding that out from a raised exception after typing the name is a worse
  // way to learn it.
  useEffect(() => {
    let live = true
    if (!partner?.id || !isOwner) return undefined
    partners
      .partnerDeletePreview(partner.id)
      .then((c) => live && setCounts(c))
      .catch(() => live && setCounts(null))
    return () => {
      live = false
    }
  }, [partner?.id, isOwner])

  useEffect(() => {
    let live = true
    account
      .partnerLoginBlockers()
      .then((b) => live && setBlockers(b))
      .catch(() => live && setBlockers([]))
    return () => {
      live = false
    }
  }, [partner?.id])

  const start = (which) => {
    setError(null)
    setOpen((v) => (v === which ? null : which))
  }

  const closeBusiness = async () => {
    setBusy(true)
    setError(null)
    try {
      await partners.deleteBusiness(partner.id)
      await onClosed?.()
      setOpen(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const deleteLogin = async () => {
    setBusy(true)
    setError(null)
    try {
      await account.deletePartnerLogin()
      window.location.assign('/partners')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const billed = counts?.billed ?? 0
  const stuck = blockers.map((b) => b.name)

  return (
    <section className="mt-6 rounded-card border border-rule bg-white px-6 py-6">
      <h2 className="font-display text-[18px] font-semibold leading-tight">Leaving Loose Leaf</h2>
      <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-graphite">
        Nothing here is reversible and none of it is the same as pausing. If you only want to stop
        being suggested for a while, set your Date Spot to paused — students stop seeing you and
        everything else stays where it is.
      </p>

      {/* ── the business ─────────────────────────────────────────────────── */}
      {isOwner && (
        <div className="mt-6 border-t border-rule pt-5">
          <h3 className="text-[15px] font-semibold text-navy">Close {partner.name}</h3>
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-graphite">
            Removes the Date Spot, {counts?.offers ?? 0} offer
            {counts?.offers === 1 ? '' : 's'}, and {counts?.team ?? 0} team member
            {counts?.team === 1 ? '' : 's'}. Logins are not removed — yours and your team's keep
            working, they just no longer reach this business.
          </p>

          {counts?.live_passes > 0 && (
            <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-coral-deep">
              {counts.live_passes} Date Pass{counts.live_passes === 1 ? '' : 'es'} for your place
              {counts.live_passes === 1 ? ' is' : ' are'} in somebody's hands right now. Closing
              voids {counts.live_passes === 1 ? 'it' : 'them'}, and they'll find out at your counter.
            </p>
          )}

          {billed > 0 ? (
            // Said before the button rather than raised after it. This is the
            // one refusal a partner cannot work around, and it is not a bug to
            // be reported — it is the ledger doing its job.
            <p className="mt-3 max-w-[62ch] rounded-2xl border border-rule bg-cream/70 px-4 py-3 text-[13.5px] leading-relaxed text-graphite">
              This business can't be closed here: {billed} redemption{billed === 1 ? ' has' : 's have'}{' '}
              been invoiced, and those rows are the record of what you were charged for. Suspend the
              Date Spot instead — from a student's side there is no difference — or write to us if
              you need the account ended for good.
            </p>
          ) : open === 'business' ? (
            <Confirm
              phrase={partner.name}
              label={`Close ${partner.name}`}
              hint="This can't be undone. Your team loses the dashboard immediately and the Date Spot stops being suggested."
              busy={busy}
              error={error}
              onConfirm={closeBusiness}
              onCancel={() => setOpen(null)}
            />
          ) : (
            <Button variant="outline" size="md" className="mt-3" onClick={() => start('business')}>
              Close this business
            </Button>
          )}
        </div>
      )}

      {/* ── the login ────────────────────────────────────────────────────── */}
      <div className="mt-6 border-t border-rule pt-5">
        <h3 className="text-[15px] font-semibold text-navy">Delete my login</h3>
        <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-graphite">
          Removes you from every team you're on and deletes the account you sign in with. Scans you
          confirmed stay on the businesses' records with your name taken off them.
        </p>

        {stuck.length > 0 ? (
          <p className="mt-3 max-w-[62ch] rounded-2xl border border-rule bg-cream/70 px-4 py-3 text-[13.5px] leading-relaxed text-graphite">
            You're the only owner of {stuck.join(', ')}. Make someone else an owner on the Team page,
            or close {stuck.length === 1 ? 'it' : 'them'} first — a business with no owner is one
            nobody can fix.
          </p>
        ) : open === 'login' ? (
          <Confirm
            phrase="delete my login"
            label="Delete my login"
            hint="This can't be undone. You'll be signed out and this email will no longer reach any Loose Leaf Partner dashboard."
            busy={busy}
            error={error}
            onConfirm={deleteLogin}
            onCancel={() => setOpen(null)}
          />
        ) : (
          <Button variant="outline" size="md" className="mt-3" onClick={() => start('login')}>
            Delete my login
          </Button>
        )}
      </div>
    </section>
  )
}
