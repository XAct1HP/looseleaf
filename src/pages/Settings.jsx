import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/ui/Button'
import Sheet from '../components/ui/Sheet'
import UniversityBadge from '../components/common/UniversityBadge'
import { SelectChip } from '../components/ui/Chip'
import { useStore } from '../state/store'
import { DATA_MODE } from '../lib/supabase'
import { isDemo } from '../services/backend'
import { INTENTIONS, UNIVERSITY } from '../data/catalog'
import { IconChevron, IconShield, IconLock, IconBell, IconHeart, IconPerson } from '../components/ui/Icons'
import * as mutualsApi from '../services/mutuals'
import * as account from '../services/live/account'

function Group({ title, Icon, children }) {
  return (
    <section className="rounded-card border border-rule bg-white">
      <h2 className="flex items-center gap-2.5 border-b border-rule px-5 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
        {Icon && <Icon size={16} className="text-mist" />}
        {title}
      </h2>
      <div className="divide-y divide-rule">{children}</div>
    </section>
  )
}

function Row({ label, value, onClick, danger = false }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors ${
        onClick ? 'hover:bg-cream/60' : ''
      }`}
    >
      <span className={`text-[15px] ${danger ? 'text-coral-deep' : 'text-navy'}`}>{label}</span>
      <span className="ml-auto flex items-center gap-2 text-[13.5px] text-mist">
        {value}
        {onClick && <IconChevron size={15} />}
      </span>
    </Tag>
  )
}

function Toggle({ label, description, on, onChange }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-navy">{label}</p>
        {description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-mist">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`press relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          on ? 'bg-coral' : 'bg-navy/15'
        }`}
      >
        {/* `left-0.5` is doing real work. Without a horizontal anchor an
            absolutely positioned box falls back to its static position — and a
            <button> keeps the UA's `text-align: center`, which puts that
            position at the middle of the track (22px). The translate was then
            added to 22 rather than to 0, so "off" sat flush against the right
            end and "on" landed twenty pixels past it, outside the track
            entirely. Anchored at 2px, the travel is the arithmetic it looks
            like: 44 track − 20 knob − 2 inset either side = 20px. */}
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export default function Settings() {
  const { state, actions } = useStore()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(null)
  const [notif, setNotif] = useState({
    likes: true,
    matches: true,
    messages: true,
    dates: true,
    campus: false,
  })
  const [privacy, setPrivacy] = useState({
    visible: true,
    findable: true,
    mutuals: true,
    activity: false,
  })

  /* ── Leaving ────────────────────────────────────────────────────────────
   *
   * This button called `actions.resetDemo()`, which in live mode is an
   * optional-chain onto a null demo module — a no-op — and then navigated
   * home. The account stayed. Somebody who wanted out was shown a
   * confirmation, given a redirect, and kept everything.
   *
   * So the live path now goes all the way through `services/live/account`,
   * and nothing here reports success on its own: the redirect is the last
   * line of `confirmDelete`, after the deletion resolved, and an error keeps
   * the sheet open with the reason on it. A delete button that lies is worse
   * than no delete button.
   */
  const [deleteCounts, setDeleteCounts] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const openDelete = async () => {
    setDeleteError(null)
    setDeleteCounts(null)
    setSheet('delete')
    if (isDemo) return
    // Best-effort. The sheet is honest without the numbers and it should not
    // wait on a round trip to open.
    try {
      setDeleteCounts(await account.deletePreview())
    } catch {
      /* no numbers, same sheet */
    }
  }

  const confirmDelete = async () => {
    if (isDemo) {
      actions.resetDemo()
      navigate('/')
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      const { keptPartnerLogin } = await account.deleteAccount()
      // Said out loud rather than quietly: the same email can hold a Loose
      // Leaf Partner login, and that one survives on purpose so a business is
      // never left without an owner. Somebody who thinks they have removed
      // every trace of themselves should not find out otherwise by signing in.
      if (keptPartnerLogin) {
        actions.showToast(
          'Your Looseleaf account is gone. Your Loose Leaf Partner login is separate and still works.'
        )
      }
      navigate('/')
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Everything here is free. There is no other tier." />

      <div className="space-y-4 pb-6">
        <Group title="Account" Icon={IconPerson}>
          <Row label="Email" value={state.session.email || state.me?.email} />
          {isDemo && <Row label="Password" value="••••••••" onClick={() => setSheet('password')} />}
          {!isDemo && <Row label="Sign in" value="Six-digit code by email" />}
          <Row label="University" value={<UniversityBadge size="sm" name={UNIVERSITY.short} />} />
        </Group>

        <Group title="Dating preferences" Icon={IconHeart}>
          <Row
            label="Who I see"
            value={(state.me?.prefs?.interestedIn ?? []).join(', ') || 'Everyone'}
            onClick={() => setSheet('who')}
          />
          <Row
            label="Age range"
            value={`${state.me?.prefs?.ageRange?.[0] ?? 18}–${state.me?.prefs?.ageRange?.[1] ?? 30}`}
            onClick={() => setSheet('age')}
          />
          <Row
            label="Intentions"
            value={INTENTIONS.find((i) => i.id === state.me?.intention)?.label}
            onClick={() => navigate('/app/profile/edit#intention')}
          />
        </Group>

        <Group title="Privacy" Icon={IconLock}>
          <Toggle
            label="Profile visibility"
            description="Turn this off and only people you’ve already matched with can see you."
            on={privacy.visible}
            onChange={(v) => setPrivacy({ ...privacy, visible: v })}
          />
          <Toggle
            label="Findable as a mutual"
            description="On, someone who already knows your first name and your major can look you up to add you. Off, nobody can find you that way at all."
            on={privacy.findable}
            onChange={(v) => {
              setPrivacy({ ...privacy, findable: v })
              mutualsApi.setFindable(state.session.userId, v).catch((err) => actions.showToast(err.message))
            }}
          />
          <Toggle
            label="Show mutual connections"
            description="Lets profiles show that you know some of the same people."
            on={privacy.mutuals}
            onChange={(v) => setPrivacy({ ...privacy, mutuals: v })}
          />
          <Toggle
            label="Activity visibility"
            description="Off by default. Looseleaf never shows a last-seen time."
            on={privacy.activity}
            onChange={(v) => setPrivacy({ ...privacy, activity: v })}
          />
        </Group>

        <Group title="Notifications" Icon={IconBell}>
          <Toggle label="New likes" on={notif.likes} onChange={(v) => setNotif({ ...notif, likes: v })} />
          <Toggle label="Matches" on={notif.matches} onChange={(v) => setNotif({ ...notif, matches: v })} />
          <Toggle label="Messages" on={notif.messages} onChange={(v) => setNotif({ ...notif, messages: v })} />
          <Toggle label="Date invitations" on={notif.dates} onChange={(v) => setNotif({ ...notif, dates: v })} />
          <Toggle
            label="Campus activity"
            description="Occasional — never the “someone likes you, open now” kind."
            on={notif.campus}
            onChange={(v) => setNotif({ ...notif, campus: v })}
          />
        </Group>

        <Group title="Safety" Icon={IconShield}>
          <Row label="Blocked accounts" value={state.blocked.length} onClick={() => setSheet('blocked')} />
          <Row label="Reported accounts" value={state.reported.length} onClick={() => setSheet('reported')} />
          <Row label="Safety resources" onClick={() => setSheet('safety')} />
        </Group>

        <Group title="Account controls">
          <Row
            label={state.paused ? 'Unpause Looseleaf' : 'Pause Looseleaf'}
            onClick={() => setSheet('pause')}
          />
          {isDemo && <Row label="Reset demo data" onClick={() => setSheet('reset')} />}
          <Row label="Log out" onClick={async () => { await actions.signOut(); navigate('/') }} />
          <Row label="Delete account" danger onClick={openDelete} />
        </Group>

        <p className="px-2 text-center text-[12.5px] leading-relaxed text-mist">
          Looseleaf · Ann Arbor, MI · Free, and staying that way.
          <br />
          Data source: <span className="font-medium text-graphite">{DATA_MODE}</span>
        </p>
      </div>

      {/* ── sheets ─────────────────────────────────────────────── */}

      <Sheet
        open={sheet === 'pause'}
        onClose={() => setSheet(null)}
        title="Taking a break?"
        subtitle="Pause Looseleaf and we’ll stop showing your profile. Your matches and conversations will still be here when you return."
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="coral"
            size="lg"
            full
            onClick={() => {
              actions.setPaused(!state.paused)
              setSheet(null)
            }}
          >
            {state.paused ? 'Unpause my profile' : 'Pause my profile'}
          </Button>
          <Button variant="ghost" size="lg" full onClick={() => setSheet(null)}>
            Not now
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'delete'}
        onClose={() => (deleting ? null : setSheet(null))}
        title="Delete your account?"
        subtitle="It can’t be undone — pausing is usually what people actually want."
      >
        <div className="flex flex-col gap-2">
          {/* What is about to go, counted. The sheet used to describe deletion
              in general terms — "your profile, matches, and messages" — which
              is true of everybody and checkable by nobody. These are this
              account's own numbers, and the live passes line is the one that
              earns its place: a pass in hand is a promise to a business too,
              and it is better to learn it is about to be void here than at a
              counter. */}
          {deleteCounts && (
            <ul className="mb-1 rounded-2xl border border-rule bg-cream/60 px-4 py-3 text-[13.5px] leading-relaxed text-graphite">
              <li>{deleteCounts.matches ?? 0} match{deleteCounts.matches === 1 ? '' : 'es'}, and everything said in them</li>
              <li>{deleteCounts.photos ?? 0} photo{deleteCounts.photos === 1 ? '' : 's'}</li>
              <li>{deleteCounts.mutuals ?? 0} mutual{deleteCounts.mutuals === 1 ? '' : 's'}</li>
              {deleteCounts.live_passes > 0 && (
                <li className="mt-1 font-medium text-coral-deep">
                  {deleteCounts.live_passes} Date Pass{deleteCounts.live_passes === 1 ? '' : 'es'} you
                  are holding right now — deleting voids {deleteCounts.live_passes === 1 ? 'it' : 'them'}.
                </li>
              )}
            </ul>
          )}

          {deleteError && (
            <p className="mb-1 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
              {deleteError}
            </p>
          )}

          <Button
            variant="soft"
            size="lg"
            full
            disabled={deleting}
            onClick={() => {
              setSheet(null)
              actions.setPaused(true)
            }}
          >
            Pause instead
          </Button>
          <Button variant="danger" size="lg" full disabled={deleting} onClick={confirmDelete}>
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'reset'}
        onClose={() => setSheet(null)}
        title="Reset the demo?"
        subtitle="Puts every profile, like, and conversation back to how it started."
      >
        <Button
          variant="coral"
          size="lg"
          full
          onClick={() => {
            actions.resetDemo()
            setSheet(null)
          }}
        >
          Reset demo data
        </Button>
      </Sheet>

      <Sheet open={sheet === 'who'} onClose={() => setSheet(null)} title="Who I see">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'women', label: 'Women' },
            { id: 'men', label: 'Men' },
            { id: 'nonbinary', label: 'Nonbinary people' },
            { id: 'everyone', label: 'Everyone' },
          ].map((o) => (
            <SelectChip
              key={o.id}
              selected={(state.me?.prefs?.interestedIn ?? []).includes(o.id)}
              onClick={() => {
                const current = state.me?.prefs?.interestedIn ?? []
                if (o.id === 'everyone') return actions.updatePrefs({ interestedIn: ['everyone'] })
                const without = current.filter((x) => x !== 'everyone')
                actions.updatePrefs({
                  interestedIn: without.includes(o.id) ? without.filter((x) => x !== o.id) : [...without, o.id],
                })
              }}
            >
              {o.label}
            </SelectChip>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-mist">
          Filters that help you find compatible people are free. They always will be.
        </p>
      </Sheet>

      <Sheet open={sheet === 'age'} onClose={() => setSheet(null)} title="Age range">
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex justify-between text-[13px] text-graphite">
              <span>Minimum</span>
              <span className="font-semibold tabular-nums">{(state.me?.prefs?.ageRange?.[0] ?? 18)}</span>
            </div>
            <input
              type="range"
              min="18"
              max="30"
              value={(state.me?.prefs?.ageRange?.[0] ?? 18)}
              onChange={(e) =>
                actions.updatePrefs({
                  ageRange: [Math.min(+e.target.value, (state.me?.prefs?.ageRange?.[1] ?? 30) - 1), (state.me?.prefs?.ageRange?.[1] ?? 30)],
                })
              }
              className="w-full accent-coral"
            />
          </div>
          <div>
            <div className="mb-2 flex justify-between text-[13px] text-graphite">
              <span>Maximum</span>
              <span className="font-semibold tabular-nums">{(state.me?.prefs?.ageRange?.[1] ?? 30)}</span>
            </div>
            <input
              type="range"
              min="18"
              max="30"
              value={(state.me?.prefs?.ageRange?.[1] ?? 30)}
              onChange={(e) =>
                actions.updatePrefs({
                  ageRange: [(state.me?.prefs?.ageRange?.[0] ?? 18), Math.max(+e.target.value, (state.me?.prefs?.ageRange?.[0] ?? 18) + 1)],
                })
              }
              className="w-full accent-coral"
            />
          </div>
        </div>
      </Sheet>

      <Sheet open={sheet === 'safety'} onClose={() => setSheet(null)} title="Safety resources">
        <ul className="space-y-3 text-[14px] leading-relaxed text-graphite">
          <li className="rounded-2xl border border-rule bg-cream/60 px-4 py-3">
            <span className="block font-medium text-navy">Meet somewhere public the first time.</span>
            Coffee, food, a campus event. Somewhere you can leave easily.
          </li>
          <li className="rounded-2xl border border-rule bg-cream/60 px-4 py-3">
            <span className="block font-medium text-navy">Tell a friend where you’re going.</span>
            Your own plans, your own people — not something the app needs to track.
          </li>
          <li className="rounded-2xl border border-rule bg-cream/60 px-4 py-3">
            <span className="block font-medium text-navy">Report anything that feels off.</span>
            It’s private, and we review every one. Blocking is instant and permanent.
          </li>
          <li className="rounded-2xl border border-rule bg-cream/60 px-4 py-3">
            <span className="block font-medium text-navy">Campus resources.</span>
            U-M SAPAC and campus safety numbers are in your student portal, and worth saving.
          </li>
        </ul>
      </Sheet>

      <Sheet open={sheet === 'blocked'} onClose={() => setSheet(null)} title="Blocked accounts">
        {state.blocked.length === 0 ? (
          <p className="rounded-2xl bg-cream/70 px-4 py-4 text-[14px] text-graphite">
            You haven’t blocked anyone.
          </p>
        ) : (
          <ul className="space-y-2 text-[14px] text-graphite">
            {state.blocked.map((id) => (
              <li key={id} className="rounded-2xl border border-rule px-4 py-3">
                {id.replace('p-', '')}
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet open={sheet === 'reported'} onClose={() => setSheet(null)} title="Reported accounts">
        {state.reported.length === 0 ? (
          <p className="rounded-2xl bg-cream/70 px-4 py-4 text-[14px] text-graphite">Nothing reported.</p>
        ) : (
          <ul className="space-y-2 text-[14px] text-graphite">
            {state.reported.map((r, i) => (
              <li key={i} className="rounded-2xl border border-rule px-4 py-3">
                <span className="block font-medium text-navy">{r.personId.replace('p-', '')}</span>
                {r.reason}
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet open={sheet === 'password'} onClose={() => setSheet(null)} title="Change password">
        <div className="space-y-3">
          <input type="password" className="field" placeholder="Current password" />
          <input type="password" className="field" placeholder="New password" />
        </div>
        <Button variant="coral" size="lg" full className="mt-5" onClick={() => setSheet(null)}>
          Update password
        </Button>
      </Sheet>
    </>
  )
}
