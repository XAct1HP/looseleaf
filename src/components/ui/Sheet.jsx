import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from './Icons'
import { IconButton } from './Button'

/**
 * Open sheets, innermost last. Sheets can nest — enlarging a photo from
 * inside the add-a-mutual sheet, for one — and without this, Escape would
 * close every one of them at once instead of just the one you're looking at.
 */
const stack = []

/**
 * The `sheet-*` class names carry no styles of their own. They exist so the
 * print stylesheet can unwind this overlay — a fixed, centred, internally
 * scrolling box — back into ordinary flow for the one thing in Looseleaf that
 * is ever printed. Targeting Tailwind's utility classes for that would break
 * the day a padding value changed.
 *
 * One overlay primitive: a centered sheet on desktop, a bottom sheet on
 * mobile. Used for notes, reporting, date planning, filters.
 *
 * The panel is capped below the viewport and scrolls *inside* itself. Without
 * that, a tall sheet — a Date Spot with a cover photo, hours and a gallery —
 * simply ran off the bottom of the screen with no way to reach the button at
 * the end of it. `dvh` rather than `vh` because mobile browser chrome moves.
 */
export default function Sheet({ open, onClose, title, subtitle, children, footer, maxWidth = 'max-w-md' }) {
  const token = useRef({})

  useEffect(() => {
    if (!open) return
    const me = token.current
    stack.push(me)

    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (stack[stack.length - 1] !== me) return
      e.stopPropagation()
      onClose?.()
    }

    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(me)
      if (i > -1) stack.splice(i, 1)
      if (stack.length === 0) document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="sheet-root fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="sheet-scrim absolute inset-0 bg-navy/35 backdrop-blur-[2px] animate-[pop-in_180ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet-panel relative flex max-h-[92dvh] w-full ${maxWidth} animate-pop-in flex-col overflow-hidden rounded-t-sheet bg-paper shadow-lift sm:max-h-[88dvh] sm:rounded-sheet`}
      >
        <div className="sheet-grip mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-navy/10 sm:hidden" />
        {(title || onClose) && (
          <div className="sheet-head flex shrink-0 items-start justify-between gap-3 px-6 pb-2 pt-5">
            <div>
              {title && <h2 className="font-display text-[21px] font-semibold leading-tight">{title}</h2>}
              {subtitle && <p className="mt-1 text-[13.5px] text-graphite">{subtitle}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1 shrink-0">
              <IconX size={20} />
            </IconButton>
          </div>
        )}
        <div className="sheet-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-5">{children}</div>
        {footer && (
          <div className="sheet-foot shrink-0 border-t border-rule bg-cream/60 px-6 py-4 pb-safe">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  )
}
