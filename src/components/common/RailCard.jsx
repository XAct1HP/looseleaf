export default function RailCard({ title, children, action, tone = 'default', className = '' }) {
  const tones = {
    default: 'border-rule bg-white',
    cream: 'border-[#F2E6D6] bg-cream',
    blue: 'border-notebook/45 bg-notebook-soft',
    coral: 'border-coral/25 bg-coral-wash',
    moss: 'border-moss/30 bg-moss-soft',
  }
  return (
    <section className={`rounded-card border px-5 py-4 ${tones[tone]} ${className}`}>
      {title && (
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-mist">{title}</h3>
      )}
      {children}
      {action && <div className="mt-3.5">{action}</div>}
    </section>
  )
}
