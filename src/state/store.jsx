import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { DATA_MODE, isDemo, loadDemo, supabase, auth, profiles as profileApi } from '../services/backend'
import { PEOPLE, personById } from '../data/people'
import { compatibility } from '../lib/compatibility'

/**
 * One store, two modes.
 *
 * demo — the whole app runs off the bundled campus in services/demo.js, with
 *        state kept in localStorage. Every action resolves locally.
 * live — accounts, profiles, and photos come from Supabase. Discovery, likes,
 *        matches, and messaging are not ported yet; a live campus stays closed
 *        until it has enough members, so those surfaces aren't reachable.
 *
 * Pages don't branch on mode. They read state and call actions; the mode-aware
 * part stops here.
 */

const StoreContext = createContext(null)

const EMPTY = {
  mode: DATA_MODE,
  boot: 'loading',
  error: null,
  session: {
    authed: false,
    email: '',
    userId: null,
    verified: false,
    onboarded: false,
    // A business owner, not a student. Set at boot so the router never sends
    // a restaurant into the member onboarding flow.
    isPartner: false,
  },
  me: null,
  campus: null,
  seen: [],
  // Today's assignment, mirroring `deck_views` + `deck_size_for()`. Kept in
  // state rather than recomputed on every render, because a deck that
  // recomputes is a deck that refills itself — see `ensureDeck` below.
  deck: { date: null, assignedCount: 0, ids: [] },
  outgoing: [],
  incoming: [],
  matches: [],
  conversations: {},
  notifications: [],
  tonight: { active: false, mood: null },
  blocked: [],
  reported: [],
  paused: false,
  doubleDate: { partnerId: null },
  formals: [],
}

function reducer(state, action) {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.state, boot: 'ready' }

    case 'boot-error':
      return { ...state, boot: 'ready', error: action.error }

    case 'reset':
      return { ...EMPTY, ...action.state, boot: 'ready' }

    case 'session':
      return { ...state, session: { ...state.session, ...action.patch } }

    case 'campus':
      return { ...state, campus: action.campus }

    case 'me':
      return { ...state, me: state.me ? { ...state.me, ...action.patch } : action.patch }

    case 'prefs':
      return { ...state, me: { ...state.me, prefs: { ...state.me.prefs, ...action.patch } } }

    case 'deck-assign':
      return { ...state, deck: action.deck }

    case 'pass':
      return { ...state, seen: [...state.seen, action.personId] }

    case 'like':
      return {
        ...state,
        outgoing: [...state.outgoing, action.like],
        seen: [...state.seen, action.like.personId],
      }

    case 'incoming-respond':
      return {
        ...state,
        incoming: state.incoming.map((l) =>
          l.id === action.likeId ? { ...l, status: action.status } : l
        ),
      }

    case 'match': {
      const { match, conversation } = action.payload
      return {
        ...state,
        matches: [match, ...state.matches],
        conversations: { ...state.conversations, [conversation.id]: conversation },
        notifications: [action.notification, ...state.notifications],
      }
    }

    case 'message': {
      const convo = state.conversations[action.conversationId]
      if (!convo) return state
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.conversationId]: { ...convo, messages: [...convo.messages, action.message] },
        },
      }
    }

    case 'convo-patch': {
      const convo = state.conversations[action.conversationId]
      if (!convo) return state
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.conversationId]: { ...convo, ...action.patch },
        },
      }
    }

    case 'tonight':
      return { ...state, tonight: action.tonight }

    case 'notifications-read':
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) }

    case 'block':
      return {
        ...state,
        blocked: [...state.blocked, action.personId],
        seen: [...state.seen, action.personId],
        matches: state.matches.filter((m) => m.personId !== action.personId),
      }

    case 'report':
      return {
        ...state,
        reported: [...state.reported, { personId: action.personId, reason: action.reason, at: Date.now() }],
      }

    case 'pause':
      return { ...state, paused: action.paused, me: state.me ? { ...state.me, isPaused: action.paused } : state.me }

    case 'double-date':
      return { ...state, doubleDate: { partnerId: action.partnerId } }

    case 'formal-create':
      return { ...state, formals: [action.formal, ...state.formals] }

    default:
      return state
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const [newMatch, setNewMatch] = useState(null)
  const [toast, setToast] = useState(null)
  const demoRef = useRef(null)
  const timers = useRef([])

  const showToast = useCallback((text, tone = 'default') => {
    setToast({ text, tone, id: Date.now() })
  }, [])

  /* ── boot ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false

    async function bootDemo() {
      const demo = await loadDemo()
      demoRef.current = demo
      const saved = demo.loadState()
      const seeded = demo.seedState()
      if (!cancelled) dispatch({ type: 'hydrate', state: saved ? { ...seeded, ...saved } : seeded })
    }

    async function bootLive() {
      try {
        const session = await auth.getSession()
        if (cancelled) return
        if (!session) {
          dispatch({ type: 'hydrate', state: {} })
          return
        }
        await adoptSession(session, { silent: true })
      } catch (error) {
        if (!cancelled) dispatch({ type: 'boot-error', error: error.message })
      }
    }

    if (isDemo) bootDemo()
    else bootLive()

    const unsubscribe = isDemo
      ? null
      : auth.onAuthChange((session) => {
          if (!session) {
            dispatch({ type: 'reset', state: {} })
          }
        })

    const pending = timers.current
    return () => {
      cancelled = true
      unsubscribe?.()
      pending.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Persist demo state only; live state lives in Postgres. */
  useEffect(() => {
    if (!isDemo || state.boot !== 'ready' || !demoRef.current) return
    demoRef.current.saveState(state)
  }, [state])

  /**
   * Turns a Supabase session into app state: who you are, whether you've
   * finished onboarding, and whether your campus is open yet.
   */
  const adoptSession = useCallback(async (session, { silent = false } = {}) => {
    const userId = session.user.id
    const email = session.user.email

    const me = await profileApi.loadMe(userId)
    const campus = me?.onboarded ? await profileApi.campusStatus().catch(() => null) : null

    // No profile can mean two very different things: a student who hasn't
    // finished onboarding, or a business owner. Asking costs one round trip,
    // and only in the case where there was nothing to load anyway — while
    // getting it wrong would drop a restaurant into a dating questionnaire.
    // One RPC rather than an import of the partner service, so none of that
    // module graph is pulled into the bundle every student downloads.
    let isPartner = false
    if (!me && supabase) {
      isPartner = await supabase
        .rpc('is_partner_user')
        .then(({ data }) => Boolean(data))
        .catch(() => false)
    }

    dispatch({
      type: 'hydrate',
      state: {
        session: {
          authed: true,
          email,
          userId,
          verified: true,
          onboarded: Boolean(me?.onboarded),
          isPartner,
        },
        me,
        campus,
        paused: Boolean(me?.isPaused),
      },
    })

    if (!silent && me?.onboarded) showToast(`Welcome back, ${me.firstName}.`)
    return me
  }, [showToast])

  /* ── actions ──────────────────────────────────────────────────────────── */

  const actions = useMemo(() => {
    const demo = () => demoRef.current

    const notLiveYet = (what) => {
      showToast(`${what} isn’t wired to the live backend yet.`)
    }

    return {
      /* ---- auth ---- */

      /** Sends a six-digit code. In demo mode it's a formality. */
      sendCode: async (email, { existingOnly = false } = {}) => {
        if (isDemo) {
          dispatch({ type: 'session', patch: { authed: true, email } })
          return
        }
        if (existingOnly) await auth.sendLoginCode(email)
        else await auth.sendCode(email)
        dispatch({ type: 'session', patch: { email } })
      },

      verifyCode: async (email, code) => {
        if (isDemo) {
          dispatch({ type: 'session', patch: { authed: true, email, verified: true } })
          return { onboarded: false }
        }
        const session = await auth.verifyCode(email, code)
        const me = await adoptSession(session, { silent: true })
        return { onboarded: Boolean(me?.onboarded) }
      },

      signOut: async () => {
        if (isDemo) {
          dispatch({ type: 'session', patch: { authed: false, verified: false, onboarded: false } })
          return
        }
        await auth.signOut()
        dispatch({ type: 'reset', state: {} })
      },

      /* ---- profile ---- */

      finishOnboarding: async (draft, { onProgress } = {}) => {
        if (isDemo) {
          // Login takes a shortcut through here with an empty draft; don't let
          // that wipe the demo profile.
          if (draft?.firstName) {
            dispatch({
              type: 'me',
              patch: {
                firstName: draft.firstName,
                pronouns: draft.pronouns,
                gradYear: draft.gradYear,
                major: draft.major,
                minor: draft.minor,
                area: draft.area,
                orgs: (draft.orgsText ?? '').split(',').map((s) => s.trim()).filter(Boolean),
                photos: (draft.photos ?? []).filter(Boolean),
                prompts: (draft.prompts ?? []).filter((p) => p?.a?.trim()),
                interests: draft.interests,
                survey: draft.survey ?? {},
                intention: draft.intentions?.[0] ?? 'seeing',
                prefs: {
                  interestedIn: draft.interestedIn,
                  ageRange: draft.ageRange,
                  intentions: draft.intentions,
                },
              },
            })
          }
          dispatch({ type: 'session', patch: { onboarded: true } })
          return
        }
        const me = await profileApi.saveOnboarding(state.session.userId, state.session.email, draft, {
          onProgress,
        })
        const campus = await profileApi.campusStatus().catch(() => null)
        dispatch({ type: 'me', patch: me })
        dispatch({ type: 'campus', campus })
        dispatch({ type: 'session', patch: { onboarded: true } })
      },

      updateMe: async (patch) => {
        if (isDemo) {
          dispatch({ type: 'me', patch })
          return
        }
        const me = await profileApi.updateProfile(state.session.userId, patch)
        dispatch({ type: 'me', patch: me })
      },

      updatePrefs: async (patch) => {
        if (isDemo) {
          dispatch({ type: 'prefs', patch })
          return
        }
        const next = { ...state.me.prefs, ...patch }
        const me = await profileApi.updateProfile(state.session.userId, { prefs: next })
        dispatch({ type: 'me', patch: me })
      },

      refreshCampus: async () => {
        if (isDemo) return
        const campus = await profileApi.campusStatus().catch(() => null)
        dispatch({ type: 'campus', campus })
        return campus
      },

      resetDemo: () => {
        demo()?.clearState()
        if (demo()) dispatch({ type: 'reset', state: demo().seedState() })
      },

      /* ---- discovery (demo only for now) ---- */

      /**
       * Hand out today's people, once.
       *
       * The demo's counterpart to `get_deck()` writing `deck_views`, and it
       * exists for the same reason: a deck that is recomputed from "everyone
       * left, best first" every render is not a deck, it is an infinite scroll
       * with a slice on the end — pass on somebody and the next-best person
       * simply slides up to take their place, and the day never ends.
       *
       * So the day's people are chosen once and remembered. Unacted ones roll
       * over rather than expiring, and the top-up is what is capped per day,
       * not the pile.
       */
      ensureDeck: () => {
        if (!isDemo || !state.me) return
        const today = new Date().toISOString().slice(0, 10)
        const size = DEMO_DECK_SIZE

        const decided = new Set([
          ...state.seen,
          ...state.blocked,
          ...state.matches.map((m) => m.personId),
        ])
        const pending = (state.deck.ids ?? []).filter((id) => !decided.has(id))
        const assignedToday = state.deck.date === today ? state.deck.assignedCount ?? 0 : 0
        const room = Math.min(size - assignedToday, size - pending.length)

        if (room <= 0) {
          if (state.deck.date === today && pending.length === state.deck.ids.length) return
          dispatch({
            type: 'deck-assign',
            deck: { date: today, assignedCount: assignedToday, ids: pending },
          })
          return
        }

        const held = new Set(pending)
        const fresh = eligibleFor(state)
          .filter((p) => !held.has(p.id))
          .map((p) => ({ id: p.id, fit: compatibility(state.me, p).fit }))
          .sort((a, b) => b.fit - a.fit)
          .slice(0, room)
          .map((p) => p.id)

        dispatch({
          type: 'deck-assign',
          deck: {
            date: today,
            assignedCount: assignedToday + fresh.length,
            ids: [...pending, ...fresh],
          },
        })
      },

      pass: (personId) => {
        if (!isDemo) return notLiveYet('Discover')
        dispatch({ type: 'pass', personId })
      },

      like: ({ personId, target, targetLabel, note }) => {
        if (!isDemo) return notLiveYet('Liking')
        const d = demo()
        dispatch({ type: 'like', like: d.buildLike({ personId, target, targetLabel, note }) })
        const person = personById(personId)
        showToast(
          note ? `Your note is on its way to ${person.firstName}.` : `${person.firstName} will know you noticed.`,
          'coral'
        )
        const likesBack = ['p-emma', 'p-riley', 'p-andre', 'p-zoe', 'p-eli', 'p-dev']
        if (likesBack.includes(personId)) {
          const t = setTimeout(() => {
            const built = d.buildMatch(personId)
            if (note) {
              built.conversation.messages.push(
                d.buildMessage(note, 'me', { kind: 'note', meta: `liked their ${target?.type ?? 'profile'}` })
              )
            }
            dispatch({
              type: 'match',
              payload: built,
              notification: d.buildNotification('match', `You and ${person.firstName} found each other.`, personId),
            })
            setNewMatch(person)
          }, 1400)
          timers.current.push(t)
        }
      },

      passIncoming: (likeId) => dispatch({ type: 'incoming-respond', likeId, status: 'passed' }),

      likeBack: (like) => {
        const d = demo()
        if (!d) return notLiveYet('Likes')
        dispatch({ type: 'incoming-respond', likeId: like.id, status: 'matched' })
        const built = d.buildMatch(like.personId)
        if (like.note) {
          built.conversation.messages.push(
            d.buildMessage(like.note, 'them', { kind: 'note', meta: `liked ${like.targetLabel}` })
          )
        }
        const person = personById(like.personId)
        dispatch({
          type: 'match',
          payload: built,
          notification: d.buildNotification('match', `You and ${person.firstName} found each other.`, like.personId),
        })
        setNewMatch(person)
        return built
      },

      dismissMatch: () => setNewMatch(null),

      send: (conversationId, text) => {
        const d = demo()
        if (!d) return notLiveYet('Messaging')
        dispatch({ type: 'message', conversationId, message: d.buildMessage(text) })
        const t = setTimeout(() => {
          dispatch({
            type: 'message',
            conversationId,
            message: d.buildMessage(d.pickReply(text.length), 'them'),
          })
        }, 2200)
        timers.current.push(t)
      },

      dismissNudge: (conversationId) =>
        dispatch({ type: 'convo-patch', conversationId, patch: { nudgeDismissed: true } }),

      /**
       * A date suggestion actually reached the screen. Counted so the same
       * conversation isn't offered one over and over — the frequency rules
       * read these two fields. See lib/dateNudge.js.
       */
      noteNudgeShown: (conversationId) =>
        dispatch({
          type: 'convo-patch',
          conversationId,
          patch: {
            nudgesShown: (state.conversations[conversationId]?.nudgesShown ?? 0) + 1,
            lastNudgeAt: Date.now(),
          },
        }),

      setDatePlan: (conversationId, datePlan) =>
        dispatch({ type: 'convo-patch', conversationId, patch: { datePlan } }),

      /* ---- campus ---- */

      setTonight: (mood) => {
        if (!isDemo) return notLiveYet('Tonight')
        dispatch({ type: 'tonight', tonight: { active: !!mood, mood } })
      },
      setDoubleDatePartner: (partnerId) => dispatch({ type: 'double-date', partnerId }),
      createFormal: (formal) => dispatch({ type: 'formal-create', formal: { id: `f-${Date.now()}`, ...formal } }),

      /* ---- safety & account ---- */

      block: (personId) => {
        dispatch({ type: 'block', personId })
        showToast('Blocked. They won’t see you and you won’t see them.')
      },

      report: (personId, reason) => {
        dispatch({ type: 'report', personId, reason })
        showToast('Thanks for telling us. Our team reviews every report.')
      },

      setPaused: async (paused) => {
        dispatch({ type: 'pause', paused })
        if (!isDemo && state.session.userId) {
          await profileApi.setPaused(state.session.userId, paused).catch(() => {})
        }
      },

      markNotificationsRead: () => dispatch({ type: 'notifications-read' }),
      showToast,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.session.userId, state.session.email, state.me, showToast, adoptSession])

  const value = useMemo(
    () => ({ state, actions, newMatch, toast, dismissToast: () => setToast(null) }),
    [state, actions, newMatch, toast]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}

/* ------------------------------------------------------------ selectors -- */

/**
 * Today's deck. Empty in live mode — real discovery is not ported yet, and a
 * live campus stays closed until it has members, so there is nothing to show.
 * Returning the demo people here would put invented students in front of a
 * real person, which is the one thing this must never do.
 */
/**
 * How many people a day. Ten percent of the campus, capped at ten — the same
 * arithmetic as `deck_size_for()` in 20260828120000.
 *
 * The demo campus is eighteen invented people standing in for a real one, and
 * ten percent of eighteen is two, which would demonstrate the pacing rule by
 * making the product look broken. So the demo floors at five: five is what a
 * real campus actually shows on the day it opens at fifty, which is the
 * behaviour worth demonstrating.
 */
export const DECK_SIZE_CAP = 10
export function deckSizeFor(members) {
  return Math.max(1, Math.min(DECK_SIZE_CAP, Math.round(members / 10)))
}
const DEMO_DECK_SIZE = Math.max(5, deckSizeFor(PEOPLE.length))

/**
 * Everyone this person could ever be shown — preferences, blocks and what has
 * already been decided about. A filter, never a score. Mirrors
 * `deck_candidates()`, minus the half about *their* preferences, which the
 * invented campus has no answers for.
 */
function eligibleFor(state) {
  const decided = new Set([
    ...state.seen,
    ...state.blocked,
    ...state.matches.map((m) => m.personId),
  ])
  const wants = state.me?.prefs?.interestedIn ?? []
  const [minAge, maxAge] = state.me?.prefs?.ageRange ?? [18, 30]
  const genderOk = (p) =>
    wants.length === 0 ||
    wants.includes('everyone') ||
    (wants.includes('women') && p.gender === 'woman') ||
    (wants.includes('men') && p.gender === 'man') ||
    (wants.includes('nonbinary') && p.gender === 'nonbinary')

  return PEOPLE.filter(
    (p) => !decided.has(p.id) && genderOk(p) && p.age >= minAge && p.age <= maxAge
  )
}

/**
 * Today's deck: the people already assigned, scored and in order. It reads the
 * assignment rather than choosing — `actions.ensureDeck()` chooses, once, the
 * same way `get_deck()` does.
 */
export function useDeck() {
  const { state } = useStore()
  return useMemo(() => {
    if (!isDemo) return []
    const decided = new Set([
      ...state.seen,
      ...state.blocked,
      ...state.matches.map((m) => m.personId),
    ])
    return (state.deck.ids ?? [])
      .filter((id) => !decided.has(id))
      .map((id) => personById(id))
      .filter(Boolean)
      .map((p) => ({ ...p, ...compatibility(state.me, p) }))
      .sort((a, b) => b.fit - a.fit)
  }, [state.deck, state.seen, state.blocked, state.matches, state.me])
}

/**
 * What the Discover page needs to say something true when it is empty —
 * "that's everyone for today" and "there is nobody left on this campus for
 * you" are different sentences, and saying the first when the second is true
 * sends somebody back tomorrow to the same empty screen. Mirrors
 * `deck_status()`.
 */
export function useDeckStatus() {
  const { state } = useStore()
  return useMemo(() => {
    if (!isDemo) {
      return { dailySize: 0, shownToday: 0, poolLeft: 0, members: state.campus?.members ?? 0 }
    }
    return {
      dailySize: DEMO_DECK_SIZE,
      shownToday: Math.min(state.deck.assignedCount ?? 0, DEMO_DECK_SIZE),
      // What is left to *assign* — the question the empty state is asking.
      poolLeft: eligibleFor(state).filter((p) => !(state.deck.ids ?? []).includes(p.id)).length,
      members: PEOPLE.length,
    }
  }, [state.deck, state.seen, state.blocked, state.matches, state.me, state.campus])
}

export function useIncoming() {
  const { state } = useStore()
  return useMemo(
    () =>
      state.incoming
        .filter((l) => l.status === 'pending' && !state.blocked.includes(l.personId))
        .map((l) => ({ ...l, person: personById(l.personId) }))
        .filter((l) => l.person),
    [state.incoming, state.blocked]
  )
}

export function useUnreadCount() {
  const { state } = useStore()
  return state.notifications.filter((n) => !n.read).length
}

/** True once a campus has enough members for Discover to be worth opening. */
export function useCampusOpen() {
  const { state } = useStore()
  if (isDemo) return true
  return Boolean(state.campus?.is_open)
}
