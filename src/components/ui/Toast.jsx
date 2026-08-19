import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { HandHeart } from '../brand/Doodles'

export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, 2600)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  if (!toast) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 md:bottom-8">
      <div className="pointer-events-auto flex animate-slide-note items-center gap-2.5 rounded-2xl border border-rule bg-white px-4 py-3 shadow-lift">
        {toast.tone === 'coral' && <HandHeart size={17} className="text-coral" />}
        <span className="text-[14px] font-medium text-navy">{toast.text}</span>
      </div>
    </div>,
    document.body
  )
}
