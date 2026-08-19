import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { DATA_MODE, isDemo, loadDemo, auth, profiles as profileApi } from '../services/backend'
import { PEOPLE, personById } from '../data/people'

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
  session: { authed: false, email: '', userId: null, verified: false, onboarded: false },
  me: null,
  campus: null,
  seen: [],
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

    dispatch({
      type: 'hydrate',
      state: {
        session: {
          authed: true,
          email,
          userId,
          verified: true,
          onboarded: Boolean(me?.onboarded),
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
export function useDeck() {
  const { state } = useStore()
  return useMemo(() => {
    if (!isDemo) return []
    const excluded = new Set([...state.seen, ...state.blocked, ...state.matches.map((m) => m.personId)])
    const wants = state.me?.prefs?.interestedIn ?? []
    const [minAge, maxAge] = state.me?.prefs?.ageRange ?? [18, 30]
    const genderOk = (p) =>
      wants.length === 0 ||
      wants.includes('everyone') ||
      (wants.includes('women') && p.gender === 'woman') ||
      (wants.includes('men') && p.gender === 'man') ||
      (wants.includes('nonbinary') && p.gender === 'nonbinary')

    return PEOPLE.filter((p) => !excluded.has(p.id) && genderOk(p) && p.age >= minAge && p.age <= maxAge)
  }, [state.seen, state.blocked, state.matches, state.me])
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
