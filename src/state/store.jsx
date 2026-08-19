import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import * as db from '../services/backend'
import { PEOPLE, personById } from '../data/people'

const StoreContext = createContext(null)

function reducer(state, action) {
  switch (action.type) {
    case 'reset':
      return db.seedState()

    case 'session':
      return { ...state, session: { ...state.session, ...action.patch } }

    case 'me':
      return { ...state, me: { ...state.me, ...action.patch } }

    case 'prefs':
      return { ...state, me: { ...state.me, prefs: { ...state.me.prefs, ...action.patch } } }

    case 'pass':
      return { ...state, seen: [...state.seen, action.personId] }

    case 'like': {
      const like = db.buildLike(action.payload)
      return { ...state, outgoing: [...state.outgoing, like], seen: [...state.seen, action.payload.personId] }
    }

    case 'incoming-respond': {
      const incoming = state.incoming.map((l) =>
        l.id === action.likeId ? { ...l, status: action.status } : l
      )
      return { ...state, incoming }
    }

    case 'match': {
      const { match, conversation } = action.payload
      return {
        ...state,
        matches: [match, ...state.matches],
        conversations: { ...state.conversations, [conversation.id]: conversation },
        notifications: [
          db.buildNotification(
            'match',
            `You and ${personById(match.personId)?.firstName} found each other.`,
            match.personId
          ),
          ...state.notifications,
        ],
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
      return { ...state, reported: [...state.reported, { personId: action.personId, reason: action.reason, at: Date.now() }] }

    case 'pause':
      return { ...state, paused: action.paused }

    case 'double-date':
      return { ...state, doubleDate: { partnerId: action.partnerId } }

    case 'formal-create':
      return { ...state, formals: [action.formal, ...state.formals] }

    default:
      return state
  }
}

function init() {
  const saved = db.loadState()
  const seeded = db.seedState()
  // Merge so newly-added seed keys survive an older saved blob.
  return saved ? { ...seeded, ...saved } : seeded
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)
  const [newMatch, setNewMatch] = useState(null) // person object → drives MatchModal
  const [toast, setToast] = useState(null)
  const replyTimers = useRef([])

  useEffect(() => {
    db.saveState(state)
  }, [state])

  useEffect(() => () => replyTimers.current.forEach(clearTimeout), [])

  const showToast = (text, tone = 'default') => {
    setToast({ text, tone, id: Date.now() })
    setTimeout(() => setToast((t) => (t && Date.now() - t.id > 2400 ? null : t)), 2600)
  }

  const actions = useMemo(() => {
    const api = {
      /* ---- auth / onboarding ---- */
      signIn: (email) => dispatch({ type: 'session', patch: { authed: true, email } }),
      verify: () => dispatch({ type: 'session', patch: { verified: true } }),
      finishOnboarding: (patch) => {
        dispatch({ type: 'me', patch })
        dispatch({ type: 'session', patch: { onboarded: true } })
      },
      signOut: () => dispatch({ type: 'session', patch: { authed: false, verified: false, onboarded: false } }),
      updateMe: (patch) => dispatch({ type: 'me', patch }),
      updatePrefs: (patch) => dispatch({ type: 'prefs', patch }),
      resetDemo: () => {
        db.clearState()
        dispatch({ type: 'reset' })
      },

      /* ---- discovery ---- */
      pass: (personId) => dispatch({ type: 'pass', personId }),

      /**
       * You never "like a profile" — you like a specific thing about someone,
       * optionally with a note. That note becomes the start of the conversation.
       */
      like: ({ personId, target, targetLabel, note }) => {
        dispatch({ type: 'like', payload: { personId, target, targetLabel, note } })
        const person = personById(personId)
        showToast(
          note ? `Your note is on its way to ${person.firstName}.` : `${person.firstName} will know you noticed.`,
          'coral'
        )
        // Demo warmth: a few people like you back shortly after.
        const likesBack = ['p-emma', 'p-riley', 'p-andre', 'p-zoe', 'p-eli', 'p-dev']
        if (likesBack.includes(personId)) {
          const t = setTimeout(() => {
            const built = db.buildMatch(personId)
            if (note) {
              built.conversation.messages.push(
                db.buildMessage(note, 'me', { kind: 'note', meta: `liked their ${target?.type ?? 'profile'}` })
              )
            }
            dispatch({ type: 'match', payload: built })
            setNewMatch(personById(personId))
          }, 1400)
          replyTimers.current.push(t)
        }
      },

      /* ---- incoming likes ---- */
      passIncoming: (likeId) => dispatch({ type: 'incoming-respond', likeId, status: 'passed' }),

      likeBack: (like) => {
        dispatch({ type: 'incoming-respond', likeId: like.id, status: 'matched' })
        const built = db.buildMatch(like.personId)
        if (like.note) {
          built.conversation.messages.push(
            db.buildMessage(like.note, 'them', { kind: 'note', meta: `liked ${like.targetLabel}` })
          )
        }
        dispatch({ type: 'match', payload: built })
        setNewMatch(personById(like.personId))
        return built
      },

      dismissMatch: () => setNewMatch(null),

      /* ---- chat ---- */
      send: (conversationId, text) => {
        dispatch({ type: 'message', conversationId, message: db.buildMessage(text) })
        const t = setTimeout(() => {
          dispatch({
            type: 'message',
            conversationId,
            message: db.buildMessage(db.pickReply(text.length), 'them'),
          })
        }, 2200)
        replyTimers.current.push(t)
      },

      dismissNudge: (conversationId) =>
        dispatch({ type: 'convo-patch', conversationId, patch: { nudgeDismissed: true } }),

      setDatePlan: (conversationId, datePlan) =>
        dispatch({ type: 'convo-patch', conversationId, patch: { datePlan } }),

      /* ---- campus ---- */
      setTonight: (mood) => dispatch({ type: 'tonight', tonight: { active: !!mood, mood } }),
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
      setPaused: (paused) => dispatch({ type: 'pause', paused }),
      markNotificationsRead: () => dispatch({ type: 'notifications-read' }),
      showToast,
    }
    return api
  }, [])

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

export function useDeck() {
  const { state } = useStore()
  return useMemo(() => {
    const excluded = new Set([
      ...state.seen,
      ...state.blocked,
      ...state.matches.map((m) => m.personId),
    ])
    const wants = state.me.prefs?.interestedIn ?? []
    const [minAge, maxAge] = state.me.prefs?.ageRange ?? [18, 30]
    const genderOk = (p) =>
      wants.length === 0 ||
      wants.includes('everyone') ||
      (wants.includes('women') && p.gender === 'woman') ||
      (wants.includes('men') && p.gender === 'man') ||
      (wants.includes('nonbinary') && p.gender === 'nonbinary')

    return PEOPLE.filter(
      (p) => !excluded.has(p.id) && genderOk(p) && p.age >= minAge && p.age <= maxAge
    )
  }, [state.seen, state.blocked, state.matches, state.me.prefs])
}

export function useIncoming() {
  const { state } = useStore()
  return useMemo(
    () =>
      state.incoming
        .filter((l) => l.status === 'pending' && !state.blocked.includes(l.personId))
        .map((l) => ({ ...l, person: personById(l.personId) })),
    [state.incoming, state.blocked]
  )
}

export function useUnreadCount() {
  const { state } = useStore()
  return state.notifications.filter((n) => !n.read).length
}
