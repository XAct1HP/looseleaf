import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from './state/store'

import AppLayout from './components/nav/AppLayout'
import Landing from './pages/Landing'
import SignUp from './pages/auth/SignUp'
import Login from './pages/auth/Login'
import Verify from './pages/auth/Verify'
import Onboarding from './pages/onboarding/Onboarding'
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

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'auto' : 'auto' })
  }, [pathname])
  return null
}

function RequireAuth({ children }) {
  const { state } = useStore()
  if (!state.session.authed) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/onboarding" element={<Onboarding />} />

        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/app/discover" replace />} />
          <Route path="discover" element={<Discover />} />
          <Route path="person/:id" element={<PersonPage />} />
          <Route path="likes" element={<Likes />} />
          <Route path="matches" element={<Matches />} />
          <Route path="chat/:id" element={<Chat />} />
          <Route path="campus" element={<Campus />} />
          <Route path="campus/tonight" element={<Tonight />} />
          <Route path="campus/double-date" element={<DoubleDate />} />
          <Route path="campus/formals" element={<Formals />} />
          <Route path="campus/spots" element={<DateSpots />} />
          <Route path="campus/events" element={<Events />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/edit" element={<EditProfile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
