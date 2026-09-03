import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { applyScannerManifest, applyStudentManifest } from './lib/pwaManifest'
import { Suspense, lazy, useEffect } from 'react'
import { useStore, useCampusOpen } from './state/store'
import { isDemo } from './services/backend'
import { PartnerAccountProvider } from './state/partnerAccount'

import AppLayout from './components/nav/AppLayout'
import Landing from './pages/Landing'
import SignUp from './pages/auth/SignUp'
import Login from './pages/auth/Login'
import Verify from './pages/auth/Verify'
import Onboarding from './pages/onboarding/Onboarding'
import Waitlist from './pages/Waitlist'
import Discover from './pages/Discover'
import PersonPage from './pages/PersonPage'
import Likes from './pages/Likes'
import Matches from './pages/Matches'
import Chat from './pages/Chat'
import Campus from './pages/Campus'
import Tonight from './pages/campus/Tonight'
import DoubleDate from './pages/campus/DoubleDate'
import Formals from './pages/campus/Formals'
import DateSpots from './pages/campus/DateSpots'
import Events from './pages/campus/Events'
import Profile from './pages/Profile'
import EditProfile from './pages/EditProfile'
import Settings from './pages/Settings'
import Notifications from './pages/Notifications'
import DatePasses from './pages/DatePasses'
import Mutuals from './pages/Mutuals'
import MutualChat from './pages/MutualChat'
import BackstageOverview from './pages/backstage/Overview'
import BackstageReports from './pages/backstage/Reports'
import BackstageEvents from './pages/backstage/EventQueue'
import BackstagePartners from './pages/backstage/Partners'
import BackstageSpots from './pages/backstage/Spots'
import BackstageLiveEvents from './pages/backstage/LiveEvents'
import Logo from './components/brand/Logo'

/**
 * The partner platform is a whole second product — a marketing site, an
 * onboarding flow, and a seven-page dashboard — and almost no student will
 * ever load a byte of it. Lazily importing it keeps all of that out of the
 * bundle a nineteen-year-old downloads on campus wifi.
 */
/**
 * Live events are their own lazy island, for the same reason the partner
 * platform is: a student opening Discover should download none of the host
 * console, and somebody scanning a poster at a door — on campus wifi, in a
 * hurry — should download none of the dating app.
 */
const JoinCode = lazy(() => import('./pages/events/JoinCode'))
const LiveEventPage = lazy(() => import('./pages/events/LiveEventPage'))
const HostHome = lazy(() => import('./pages/host/HostHome'))
const EventEditor = lazy(() => import('./pages/host/EventEditor'))
const RunConsole = lazy(() => import('./pages/host/RunConsole'))
const PrintKit = lazy(() => import('./pages/host/PrintKit'))

const PartnersLanding = lazy(() => import('./pages/partners/PartnersLanding'))
const PartnerAuth = lazy(() => import('./pages/partners/PartnerAuth'))
const PartnerOnboarding = lazy(() => import('./pages/partners/PartnerOnboarding'))
const PartnerDashboard = lazy(() => import('./pages/partners/DashboardLayout'))
const PartnerOverview = lazy(() => import('./pages/partners/dashboard/Overview'))
const PartnerSpot = lazy(() => import('./pages/partners/dashboard/DateSpotEditor'))
const PartnerOffers = lazy(() => import('./pages/partners/dashboard/Offers'))
const PartnerScan = lazy(() => import('./pages/partners/dashboard/Scan'))
const PartnerRedemptions = lazy(() => import('./pages/partners/dashboard/Redemptions'))
const PartnerAnalytics = lazy(() => import('./pages/partners/dashboard/Analytics'))
const PartnerTeam = lazy(() => import('./pages/partners/dashboard/Team'))
const PartnerBilling = lazy(() => import('./pages/partners/dashboard/Billing'))
const PartnerSettings = lazy(() => import('./pages/partners/dashboard/Settings'))

/**
 * ── Which app does this page offer to install? ──────────────────────────────
 *
 * `index.html` names one manifest and Looseleaf ships two products, so the tag
 * is swapped by route. It lives here rather than in the dashboard because the
 * first version *did* live in the dashboard, and that left /partners,
 * /partners/login and /partners/join still advertising the student app — so a
 * member of staff adding "the scanner" from the login page got an icon that
 * opened the dating app.
 *
 * `pwaManifest` is imported rather than `pwa`: this file is in the main bundle
 * every student downloads, and `pwa` installs a `beforeinstallprompt` listener
 * that would suppress the student app's own install banner. The tag swapping
 * is pure DOM and carries no such cost.
 */
function ManifestForRoute() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname.startsWith('/partners')) applyScannerManifest()
    else applyStudentManifest()
  }, [pathname])
  return null
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

/** Shown while the session and profile are being fetched. */
function Booting() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="animate-pulse">
        <Logo size="lg" />
      </div>
    </div>
  )
}

/**
 * Signed in, onboarded, and on an open campus — otherwise sent to whichever
 * step is actually next. In demo mode every campus is open.
 */
function RequireCampus({ children }) {
  const { state } = useStore()
  const open = useCampusOpen()

  if (!state.session.authed) return <Navigate to="/" replace />
  if (!state.session.onboarded) return <Navigate to="/onboarding" replace />
  if (!open) return <Navigate to="/waitlist" replace />
  return children
}

/**
 * Matches and the thread inside it, plus the one exception to the closed-campus
 * rule: staff.
 *
 * A campus that hasn't opened yet has no matches and no conversations — in live
 * mode `useDeck()` returns nothing and both lists are empty by construction —
 * so what a staff member actually reaches here is an empty page and the test
 * thread in `data/testThread.js`. Which is the point: the founder of a campus
 * that hasn't opened is precisely the person who needs to be able to look
 * inside a conversation. No student sees anything different.
 */
function RequireCampusOrStaff({ children }) {
  const { state } = useStore()
  if (state.me?.isAdmin) return <RequireProfile>{children}</RequireProfile>
  return <RequireCampus>{children}</RequireCampus>
}

/** Signed in and onboarded, but usable whether or not the campus is open. */
function RequireProfile({ children }) {
  const { state } = useStore()
  if (!state.session.authed) return <Navigate to="/" replace />
  if (!state.session.onboarded) return <Navigate to="/onboarding" replace />
  return children
}

/**
 * Backstage is staff-only. The database enforces this too — every staff RPC
 * checks is_admin() — so this guard is about not showing a door that won't
 * open, not about security.
 */
function RequireStaff({ children }) {
  const { state } = useStore()
  if (!state.session.authed) return <Navigate to="/" replace />
  if (!state.me?.isAdmin) return <Navigate to="/app/discover" replace />
  return children
}

/** Everything under /partners. Split out so the whole subtree can be lazy. */
function PartnerRoutes() {
  return (
    <Routes>
      <Route index element={<PartnersLanding />} />
      <Route path="join" element={<PartnerAuth />} />
      <Route path="login" element={<PartnerAuth />} />
      <Route path="onboarding" element={<PartnerOnboarding />} />

      <Route path="dashboard" element={<PartnerDashboard />}>
        <Route index element={<PartnerOverview />} />
        <Route path="spot" element={<PartnerSpot />} />
        <Route path="offers" element={<PartnerOffers />} />
        <Route path="scan" element={<PartnerScan />} />
        <Route path="redemptions" element={<PartnerRedemptions />} />
        <Route path="analytics" element={<PartnerAnalytics />} />
        <Route path="team" element={<PartnerTeam />} />
        <Route path="billing" element={<PartnerBilling />} />
        <Route path="settings" element={<PartnerSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/partners" replace />} />
    </Routes>
  )
}

export default function App() {
  const { state } = useStore()

  if (state.boot === 'loading') return <Booting />

  return (
    <>
      <ScrollToTop />
      <ManifestForRoute />
      <Routes>
        {/* A signed-in visitor should never land back on the marketing page —
            send them to whichever step they actually stopped at. */}
        <Route
          path="/"
          element={
            state.session.isPartner ? (
              <Navigate to="/partners/dashboard" replace />
            ) : state.session.onboarded ? (
              <Navigate to="/app/discover" replace />
            ) : state.session.authed ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Landing />
            )
          }
        />

        {/* Loose Leaf for Partners — a whole second product, deliberately
            outside /app. A business is not a member: no member shell, no
            member store, and nothing here can reach dating data. */}
        <Route
          path="/partners/*"
          element={
            <Suspense fallback={<Booting />}>
              <PartnerAccountProvider>
                <PartnerRoutes />
              </PartnerAccountProvider>
            </Suspense>
          }
        />

        {/* ── Live events ──────────────────────────────────────────────
            Outside /app entirely, and that is the point. `/app` requires an
            onboarded `profiles` row; a participant has no dating profile and a
            club president running a rush night may not want one either.

            `/e/:code` is what a printed QR encodes, so it is deliberately
            short — every character is another module in a grid that has to
            read off a door, at an angle, in bad light. */}
        <Route
          path="/e"
          element={
            <Suspense fallback={<Booting />}>
              <JoinCode />
            </Suspense>
          }
        />
        <Route
          path="/e/:code"
          element={
            <Suspense fallback={<Booting />}>
              <LiveEventPage />
            </Suspense>
          }
        />
        <Route
          path="/host"
          element={
            <Suspense fallback={<Booting />}>
              <HostHome />
            </Suspense>
          }
        />
        <Route
          path="/host/:id"
          element={
            <Suspense fallback={<Booting />}>
              <EventEditor />
            </Suspense>
          }
        />
        <Route
          path="/host/:id/run"
          element={
            <Suspense fallback={<Booting />}>
              <RunConsole />
            </Suspense>
          }
        />
        <Route
          path="/host/:id/print"
          element={
            <Suspense fallback={<Booting />}>
              <PrintKit />
            </Suspense>
          }
        />

        <Route path="/join" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/waitlist"
          element={
            <RequireProfile>
              <Waitlist />
            </RequireProfile>
          }
        />

        {/* Profile and settings stay reachable on a closed campus — you can
            keep editing while you wait. Everything social does not. */}
        <Route
          path="/app"
          element={
            <RequireProfile>
              <AppLayout />
            </RequireProfile>
          }
        >
          <Route index element={<Navigate to="/app/discover" replace />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/edit" element={<EditProfile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />

          {/* Mutuals work on a closed campus on purpose — building the list
              while you wait is the most useful thing you can do there. */}
          <Route path="mutuals" element={<Mutuals />} />
          <Route path="mutuals/:id" element={<MutualChat />} />

          <Route
            path="discover"
            element={
              <RequireCampus>
                <Discover />
              </RequireCampus>
            }
          />
          {/* Same exception, same reason: "See profile" from the staff test
              thread has to lead somewhere. In live mode `personById` resolves
              the demo cast and Avery and nothing else — it reads no rows — so
              a closed campus still shows a student nobody. */}
          <Route
            path="person/:id"
            element={
              <RequireCampusOrStaff>
                <PersonPage />
              </RequireCampusOrStaff>
            }
          />
          <Route
            path="likes"
            element={
              <RequireCampus>
                <Likes />
              </RequireCampus>
            }
          />
          <Route
            path="matches"
            element={
              <RequireCampusOrStaff>
                <Matches />
              </RequireCampusOrStaff>
            }
          />
          <Route
            path="chat/:id"
            element={
              <RequireCampusOrStaff>
                <Chat />
              </RequireCampusOrStaff>
            }
          />
          <Route path="campus" element={<Campus />} />
          <Route path="campus/events" element={<Events />} />
          <Route
            path="campus/tonight"
            element={
              <RequireCampus>
                <Tonight />
              </RequireCampus>
            }
          />
          <Route
            path="campus/double-date"
            element={
              <RequireCampus>
                <DoubleDate />
              </RequireCampus>
            }
          />
          <Route
            path="campus/formals"
            element={
              <RequireCampus>
                <Formals />
              </RequireCampus>
            }
          />
          <Route path="campus/spots" element={<DateSpots />} />
          {/* Passes are yours whether or not the campus is open — an unlocked
              perk shouldn't vanish because a campus closed behind you. */}
          <Route path="passes" element={<DatePasses />} />

          <Route
            path="backstage"
            element={
              <RequireStaff>
                <BackstageOverview />
              </RequireStaff>
            }
          />
          <Route
            path="backstage/reports"
            element={
              <RequireStaff>
                <BackstageReports />
              </RequireStaff>
            }
          />
          <Route
            path="backstage/events"
            element={
              <RequireStaff>
                <BackstageEvents />
              </RequireStaff>
            }
          />
          <Route
            path="backstage/partners"
            element={
              <RequireStaff>
                <BackstagePartners />
              </RequireStaff>
            }
          />
          <Route
            path="backstage/live"
            element={
              <RequireStaff>
                <BackstageLiveEvents />
              </RequireStaff>
            }
          />
          <Route
            path="backstage/spots"
            element={
              <RequireStaff>
                <BackstageSpots />
              </RequireStaff>
            }
          />
          {/* The old name, kept so any bookmarked link still lands. */}
          <Route
            path="backstage/sponsors"
            element={<Navigate to="/app/backstage/partners" replace />}
          />
        </Route>

        <Route path="*" element={<Navigate to={isDemo ? '/' : '/'} replace />} />
      </Routes>
    </>
  )
}
