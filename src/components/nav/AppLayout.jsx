import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import DesktopSidebar from './DesktopSidebar'
import MobileNav from './MobileNav'
import Logo from '../brand/Logo'
import { IconBell } from '../ui/Icons'
import { useStore, useUnreadCount } from '../../state/store'
import MatchModal from '../match/MatchModal'
import Toast from '../ui/Toast'

const RailContext = createContext(() => {})

/** Pages call this to fill the desktop right sidebar. Pass null for none. */
export function useRail(node, deps = []) {
  const setRail = useContext(RailContext)
  useEffect(() => {
    setRail(() => node)
    return () => setRail(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export default function AppLayout() {
  const [rail, setRail] = useState(null)
  const { pathname } = useLocation()
  const { state, newMatch, actions, toast, dismissToast } = useStore()
  const unread = useUnreadCount()

  // Both kinds of thread take the whole column: no page padding, no top bar.
  const isChat = pathname.startsWith('/app/chat/') || /^\/app\/mutuals\/[^/]+$/.test(pathname)
  const wide = isChat

  const setRailFn = useMemo(() => (fn) => setRail(() => (typeof fn === 'function' ? fn() : fn)), [])

  return (
    <RailContext.Provider value={setRailFn}>
      <div className="flex min-h-screen bg-paper">
        <DesktopSidebar />

        <div className="flex min-w-0 flex-1 justify-center">
          <div className="flex w-full min-w-0 max-w-[1180px]">
            <main className="min-w-0 flex-1">
              {/* Mobile top bar */}
              {!isChat && (
                <div
                  className="sticky top-0 z-30 flex items-center justify-between border-b border-rule/70 bg-paper/90 px-4 py-3 backdrop-blur-md md:hidden"
                  style={{ paddingTop: 'calc(var(--safe-top) + 0.6rem)' }}
                >
                  <Logo size="sm" />
                  <Link
                    to="/app/notifications"
                    aria-label="Notifications"
                    className="relative flex h-9 w-9 items-center justify-center rounded-full text-graphite"
                  >
                    <IconBell size={21} />
                    {unread > 0 && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-coral ring-2 ring-paper" />
                    )}
                  </Link>
                </div>
              )}

              {state.paused && !isChat && (
                <div className="mx-4 mt-4 rounded-2xl border border-notebook/50 bg-notebook-soft px-4 py-3 text-[13.5px] text-[#2F5C99] md:mx-8">
                  Looseleaf is paused — your profile is hidden. Your matches and messages are still here.{' '}
                  <button
                    className="font-semibold underline underline-offset-2"
                    onClick={() => actions.setPaused(false)}
                  >
                    Unpause
                  </button>
                </div>
              )}

              <div className={isChat ? '' : 'px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-9'}>
                <div className={wide ? '' : 'mx-auto w-full max-w-[720px]'}>
                  <Outlet />
                </div>
              </div>
            </main>

            {rail && (
              <aside className="hidden w-[280px] shrink-0 border-l border-rule/70 px-5 py-9 xl:block">
                <div className="sticky top-9 space-y-5">{rail}</div>
              </aside>
            )}
          </div>
        </div>

        <MobileNav />
      </div>

      <MatchModal person={newMatch} onClose={actions.dismissMatch} />
      <Toast toast={toast} onDismiss={dismissToast} />
    </RailContext.Provider>
  )
}
