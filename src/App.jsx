import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
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
import Logo from './components/brand/Logo'

/**
 * The partner platform is a whole second product — a marketing site, an
 * onboarding flow, and a seven-page dashboard — and almost no student will
 * ever load a byte of it. Lazily importing it keeps all of that out of the
 * bundle a nineteen-year-old downloads on campus wifi.
 */
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
          <Route
            path="person/:id"
            element={
              <RequireCampus>
                <PersonPage />
              </RequireCampus>
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
              <RequireCampus>
                <Matches />
              </RequireCampus>
            }
          />
          <Route
            path="chat/:id"
            element={
              <RequireCampus>
                <Chat />
              </RequireCampus>
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
