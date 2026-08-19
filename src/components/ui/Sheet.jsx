import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from './Icons'
import { IconButton } from './Button'

/**
 * One overlay primitive: a centered sheet on desktop, a bottom sheet on
 * mobile. Used for notes, reporting, date planning, filters.
 */
export default function Sheet({ open, onClose, title, subtitle, children, footer, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-navy/35 backdrop-blur-[2px] animate-[pop-in_180ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${maxWidth} animate-pop-in overflow-hidden rounded-t-sheet bg-paper shadow-lift sm:rounded-sheet`}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-navy/10 sm:hidden" />
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-5">
            <div>
              {title && <h2 className="font-display text-[21px] font-semibold leading-tight">{title}</h2>}
              {subtitle && <p className="mt-1 text-[13.5px] text-graphite">{subtitle}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1 shrink-0">
              <IconX size={20} />
            </IconButton>
          </div>
        )}
        <div className="px-6 pb-5">{children}</div>
        {footer && <div className="border-t border-rule bg-cream/60 px-6 py-4 pb-safe">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
