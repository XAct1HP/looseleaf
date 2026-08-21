import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { IconScan, IconPeople, IconPin, IconSpark, IconTicket, IconEye, IconLock, IconDiscover } from '../ui/Icons'
import { usePartnerAccount } from '../../state/partnerAccount'
import * as partners from '../../services/partners'

/**
 * ── Who on the team can reach what ──────────────────────────────────────────
 *
 * The owner's answer to "I don't want to be the one doing all of this". Tick
 * Billing for managers and your manager handles the subscription; leave it and
 * they never see it.
 *
 * Two rows are fixed and say so rather than being hidden:
 *
 *   Scan a pass  is why the staff role exists. Taking it away would leave
 *                somebody with a login and nothing to do.
 *   Settings     is this page. Handing it over would let a manager grant
 *                themselves anything, which makes the whole grid decorative —
 *                so the database refuses it too, not just this component.
 */

const PAGES = [
  { id: 'scan', label: 'Scan a pass', Icon: IconScan, locked: true, note: 'Always on' },
  { id: 'team', label: 'Team', Icon: IconPeople },
  { id: 'overview', label: 'Overview', Icon: IconDiscover },
  { id: 'spot', label: 'Date Spot', Icon: IconPin },
  { id: 'offers', label: 'Offers', Icon: IconSpark },
  { id: 'redemptions', label: 'Redemptions', Icon: IconTicket },
  { id: 'analytics', label: 'Analytics', Icon: IconEye },
  { id: 'billing', label: 'Billing', Icon: IconLock },
]

const ROLES = [
  { id: 'manager', label: 'Managers', blurb: 'They run the floor and the rota.' },
  { id: 'staff', label: 'Staff', blurb: 'Usually just the scanner.' },
]

export default function RoleAccess({ className = '' }) {
  const { partner, refresh } = usePartnerAccount()

  const [grid, setGrid] = useState(null)
  const [busy, setBusy] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // `rolePages` comes back null for anybody who isn't an owner.
    if (partner?.rolePages) {
      setGrid({
        manager: partner.rolePages.manager ?? ['scan', 'team'],
        staff: partner.rolePages.staff ?? ['scan'],
      })
    }
  }, [partner])

  if (!partner || !partner.rolePages || !grid) return null

  const toggle = (role, page) => {
    const on = grid[role].includes(page)
    setGrid({
      ...grid,
      [role]: on ? grid[role].filter((p) => p !== page) : [...grid[role], page],
    })
    setSaved(false)
  }

  async function save(role) {
    setBusy(role)
    setError(null)
    try {
      // Scan is always included: the database would keep it out of the array
      // happily, and then a staff login would have nowhere to land.
      const pages = Array.from(new Set([...grid[role], 'scan']))
      await partners.setRolePages(partner.id, role, pages)
      await refresh()
      setSaved(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={`rounded-card border border-rule bg-white px-6 py-6 ${className}`}>
      <h2 className="font-display text-[20px] font-semibold leading-tight">
        What your team can reach
      </h2>
      <p className="mt-2.5 max-w-[62ch] text-[14px] leading-relaxed text-graphite">
        By default a manager gets the scanner and the team, and staff get the scanner. Hand over
        anything else you’d rather not be responsible for — Billing is the usual one.
      </p>

      <div className="mt-6 space-y-6">
        {ROLES.map((role) => (
          <div key={role.id}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-[15px] font-semibold text-navy">{role.label}</h3>
                <p className="mt-0.5 text-[12.5px] text-mist">{role.blurb}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => save(role.id)}
                disabled={busy === role.id}
              >
                {busy === role.id ? 'Saving…' : 'Save'}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {PAGES.map(({ id, label, Icon, locked, note }) => {
                const on = locked || grid[role.id].includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={locked}
                    aria-pressed={on}
                    onClick={() => toggle(role.id, id)}
                    title={locked ? note : undefined}
                    className={`press focus-ring inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition ${
                      on
                        ? 'border-navy bg-navy text-paper'
                        : 'border-rule bg-white text-graphite hover:border-navy/25 hover:text-navy'
                    } ${locked ? 'cursor-default opacity-80' : ''}`}
                  >
                    <Icon size={15} />
                    {label}
                    {locked && (
                      <span className="text-[10.5px] font-normal uppercase tracking-wide opacity-60">
                        always
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-5 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-5 text-[13px] text-[#3F7454]">
          Saved. It takes effect the next time they load the dashboard.
        </p>
      )}

      <p className="mt-5 max-w-[62ch] text-[12.5px] leading-relaxed text-mist">
        Settings isn’t on the list on purpose — it’s this page. If a manager could be given it,
        they could give themselves everything else, and the rest of this grid would be a
        suggestion. The database refuses it too, not just this screen.
      </p>
    </section>
  )
}
