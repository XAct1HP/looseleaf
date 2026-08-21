import { useCallback, useEffect, useState } from 'react'
import { PageHead } from '../DashboardLayout'
import Button from '../../../components/ui/Button'
import Sheet from '../../../components/ui/Sheet'
import { Chip } from '../../../components/ui/Chip'
import { Field, TextInput } from '../../../components/partners/fields'
import { IconPeople, IconMail } from '../../../components/ui/Icons'
import { usePartnerAccount } from '../../../state/partnerAccount'
import * as partners from '../../../services/partners'

/**
 * ── Who can act for this business ───────────────────────────────────────────
 *
 * The person who signs the contract is not the person at the till at 9pm
 * scanning a Date Pass, so the roles are drawn around what each one could
 * break rather than around seniority:
 *
 *   Owner    billing, the team, everything below. Usually one person.
 *   Manager  the Date Spot, the offers, the targeting. Not the card.
 *   Staff    scan a pass and see that it worked. Nothing else.
 *
 * Giving a new starter a scanning login should be a thirty-second job on a
 * phone, so the invite form is three fields and no confirmation step.
 */

const ROLES = [
  {
    id: 'staff',
    label: 'Staff',
    blurb: 'Scan Date Passes. Can’t change anything.',
  },
  {
    id: 'manager',
    label: 'Manager',
    blurb: 'Everything except billing and the team.',
  },
  {
    id: 'owner',
    label: 'Owner',
    blurb: 'Billing and the team too.',
  },
]

const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label ?? id

/**
 * The database refuses to remove the last owner. Hiding the button rather than
 * letting somebody press it and read an error is the difference between a rule
 * and a trap.
 */
function canRemove(member, isOwner, members) {
  if (!isOwner && !member.isYou) return false
  if (member.role !== 'owner') return true
  return members.filter((m) => m.role === 'owner').length > 1
}

function RoleControl({ member, editable, busy, onChange }) {
  if (!editable) {
    return (
      <Chip tone={member.role === 'owner' ? 'navy' : 'cream'} className="!px-2.5 !py-1 !text-[11.5px]">
        {roleLabel(member.role)}
      </Chip>
    )
  }
  return (
    <select
      value={member.role}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Role for ${member.name}`}
      className="rounded-xl border border-rule bg-white px-3 py-1.5 text-[13px] text-navy focus:outline-none"
    >
      {ROLES.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label}
        </option>
      ))}
    </select>
  )
}

function RemoveButton({ member, partner, canRemove: allowed, busy, onRemove }) {
  if (!allowed) return null
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        const msg = member.isYou
          ? `Leave ${partner.name}? You'll lose access to this dashboard.`
          : `Remove ${member.name} from ${partner.name}?`
        if (window.confirm(msg)) onRemove()
      }}
      className="focus-ring rounded-lg px-2 py-1 text-[13px] font-medium text-graphite hover:text-coral-deep"
    >
      {member.isYou ? 'Leave' : 'Remove'}
    </button>
  )
}

export default function Team() {
  const { partner } = usePartnerAccount()

  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)

  const isOwner = members.find((m) => m.isYou)?.role === 'owner'

  const load = useCallback(async () => {
    if (!partner) return
    try {
      const [t, i] = await Promise.all([
        partners.team(partner.id),
        partners.pendingInvites(partner.id).catch(() => []),
      ])
      setMembers(t)
      setInvites(i)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [partner])

  useEffect(() => {
    load()
  }, [load])

  async function act(key, fn) {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHead
        title="Team"
        subtitle="Everyone who can act for this business, and what each of them can reach."
        action={
          isOwner && (
            <Button variant="coral" size="md" onClick={() => setInviting(true)}>
              Add someone
            </Button>
          )
        }
      />

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
          {error}
        </p>
      )}

      {sent && (
        <p className="mb-6 rounded-2xl border border-moss/30 bg-moss-soft px-4 py-3 text-[13.5px] leading-relaxed text-[#3F7454]">
          Invitation sent to {sent}. They’ll see it the next time they sign in at{' '}
          <span className="font-medium">looseleaf/partners</span> with that address.
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-[14px] text-mist">Loading…</p>
      ) : (
        <>
          <ul className="divide-y divide-rule overflow-hidden rounded-card border border-rule bg-white">
            {members.map((m) => (
              <li key={m.id} className="px-5 py-4">
                {/* Stacked on a phone. Squeezing a name, an address, a role
                    picker and a Remove onto one 390px row turns every email
                    into "dee@l…", which is worse than a second line. */}
                <div className="flex items-center gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-graphite">
                    <IconPeople size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-navy">
                      {m.name}
                      {m.isYou && <span className="ml-2 text-[12.5px] font-normal text-mist">you</span>}
                    </p>
                    <p className="truncate text-[12.5px] text-mist">{m.email}</p>
                  </div>

                  {/* On a wide row the controls sit inline; on a narrow one
                      they drop below, so this is the desktop position. */}
                  <div className="hidden shrink-0 items-center gap-3 sm:flex">
                    <RoleControl
                      member={m}
                      editable={isOwner && !m.isYou}
                      busy={busy === m.id}
                      onChange={(role) => act(m.id, () => partners.setMemberRole(partner.id, m.id, role))}
                    />
                    <RemoveButton
                      member={m}
                      partner={partner}
                      canRemove={canRemove(m, isOwner, members)}
                      busy={busy === m.id}
                      onRemove={() => act(m.id, () => partners.removeMember(partner.id, m.id))}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 pl-[54px] sm:hidden">
                  <RoleControl
                    member={m}
                    editable={isOwner && !m.isYou}
                    busy={busy === m.id}
                    onChange={(role) => act(m.id, () => partners.setMemberRole(partner.id, m.id, role))}
                  />
                  <RemoveButton
                    member={m}
                    partner={partner}
                    canRemove={canRemove(m, isOwner, members)}
                    busy={busy === m.id}
                    onRemove={() => act(m.id, () => partners.removeMember(partner.id, m.id))}
                  />
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-mist">
            A business always keeps at least one owner, so the last one can’t step down or leave
            until somebody else is promoted.
          </p>

          {invites.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
                Waiting to be accepted
              </h2>
              <ul className="divide-y divide-rule overflow-hidden rounded-card border border-dashed border-navy/20 bg-cream/40">
                {invites.map((i) => (
                  <li key={i.id} className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <IconMail size={17} className="shrink-0 text-mist" />
                      <span className="min-w-0 flex-1 truncate text-[14.5px] text-navy">{i.email}</span>
                      <Chip tone="cream" className="hidden shrink-0 !px-2.5 !py-1 !text-[11.5px] sm:inline-flex">
                        {roleLabel(i.role)}
                      </Chip>
                      <span className="hidden shrink-0 text-[12px] text-mist sm:inline">
                        expires {new Date(i.expiresAt).toLocaleDateString()}
                      </span>
                      {isOwner && (
                        <button
                          type="button"
                          disabled={busy === i.id}
                          onClick={() => act(i.id, () => partners.revokeInvite(i.id))}
                          className="focus-ring shrink-0 rounded-lg px-2 py-1 text-[13px] font-medium text-graphite hover:text-coral-deep"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 pl-[29px] text-[12px] text-mist sm:hidden">
                      {roleLabel(i.role)} · expires {new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="mt-8 rounded-card border border-rule bg-cream/60 px-6 py-6">
        <h2 className="font-display text-[18px] font-semibold leading-tight">
          What a staff login can see.
        </h2>
        <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-graphite">
          A scanner can check a code, confirm a redemption, and see that it worked. Not your
          billing, not your analytics, and — like every partner login, including yours — nothing at
          all about the people on the date.
        </p>
      </section>

      <InviteSheet
        open={inviting}
        partnerName={partner?.name}
        onClose={() => setInviting(false)}
        onInvite={async (email, role) => {
          await partners.invite(partner.id, email, role)
          setSent(email)
          setInviting(false)
          await load()
        }}
      />
    </>
  )
}

function InviteSheet({ open, partnerName, onClose, onInvite }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setEmail('')
      setRole('staff')
      setError(null)
    }
  }, [open])

  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add someone"
      subtitle={`They'll get access to ${partnerName ?? 'this business'} when they sign in with this address.`}
    >
      <div className="space-y-5">
        <Field label="Their email" htmlFor="inv-email">
          <TextInput
            id="inv-email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="dee@yourplace.com"
            autoComplete="off"
          />
        </Field>

        <div>
          <span className="label">What can they do?</span>
          <div className="space-y-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                aria-pressed={role === r.id}
                className={`focus-ring flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  role === r.id ? 'border-coral bg-coral-wash' : 'border-rule bg-white hover:border-navy/20'
                }`}
              >
                <span
                  className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-[4px] ${
                    role === r.id ? 'border-coral bg-white' : 'border-white bg-cream ring-1 ring-rule'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-medium text-navy">{r.label}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-graphite">
                    {r.blurb}
                  </span>
                </span>
              </button>
            ))}
          </div>
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
            await onInvite(email.trim(), role)
          } catch (e) {
            setError(e.message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Sending…' : 'Send invitation'}
      </Button>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-mist">
        The invitation is tied to that exact address — forwarding the email doesn’t pass it on.
      </p>
    </Sheet>
  )
}
