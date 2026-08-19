import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore, useCampusOpen } from './state/store'
import { isDemo } from './services/backend'

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
import Logo from './components/brand/Logo'

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
            state.session.onboarded ? (
              <Navigate to="/app/discover" replace />
            ) : state.session.authed ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Landing />
            )
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
        </Route>

        <Route path="*" element={<Navigate to={isDemo ? '/' : '/'} replace />} />
      </Routes>
    </>
  )
}
