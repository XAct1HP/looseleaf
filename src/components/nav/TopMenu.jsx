import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { IconMenu, IconX } from '../ui/Icons'
import Button from '../ui/Button'

/**
 * ── The small-screen top nav ────────────────────────────────────────────────
 *
 * Two or three links and a call to action fit comfortably across a laptop and
 * not at all across a 390px phone, where "Partner log in" and "Become a
 * Partner" end up shrunk, wrapped, or clipped. Below `sm` they collapse into
 * one button; from `sm` up nothing changes and the links sit in the bar as
 * they always did.
 *
 * The panel is deliberately not a full-screen takeover. A takeover on a page
 * with two links reads as an app that thinks it's more important than it is;
 * a sheet that drops under the bar, dims what's behind it and closes on the
 * next tap is the right weight for this.
 *
 * @param items  `[{ to, label, variant? }]` — `variant` is passed through to
 *               Button on desktop; the panel styles the primary one itself.
 */
export default function TopMenu({ items, label = 'Menu' }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const panelRef = useRef(null)
  const buttonRef = useRef(null)

  // Navigating is the most common way to leave the menu, and a panel still
  // hanging open over the new page is the classic version of this bug.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return undefined

    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointer = (e) => {
      if (panelRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <>
      {/* Roomy enough to be lived on the first tap: 44px is the smallest
          target Apple and Google both consider reliable. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : label}
        className="press focus-ring flex h-11 w-11 items-center justify-center rounded-2xl border border-rule bg-white text-navy transition hover:border-navy/25 sm:hidden"
      >
        {open ? <IconX size={20} /> : <IconMenu size={20} />}
      </button>

      {/* Desktop: exactly what was there before. */}
      <nav className="hidden items-center gap-2 sm:flex">
        {items.map((it) => (
          <Button key={it.to} to={it.to} variant={it.variant ?? 'ghost'} size="sm">
            {it.label}
          </Button>
        ))}
      </nav>

      {open && (
        <>
          <div
            className="fixed inset-0 top-[var(--menu-top,64px)] z-30 bg-navy/10 sm:hidden"
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            className="absolute inset-x-3 top-[calc(100%-0.35rem)] z-40 origin-top animate-pop-in rounded-sheet border border-rule bg-paper p-2 shadow-lift sm:hidden"
          >
            <ul>
              {items.map((it) => (
                <li key={it.to}>
                  <Link
                    to={it.to}
                    className={`flex items-center rounded-2xl px-4 py-3.5 text-[15.5px] font-medium transition ${
                      it.variant === 'coral' || it.variant === 'primary'
                        ? 'text-coral hover:bg-coral-wash'
                        : 'text-navy hover:bg-cream'
                    }`}
                  >
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  )
}
