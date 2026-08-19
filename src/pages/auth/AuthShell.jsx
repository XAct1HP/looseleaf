import { Link } from 'react-router-dom'
import Logo from '../../components/brand/Logo'
import { Star } from '../../components/brand/Doodles'

export default function AuthShell({ children, step, footer, back = '/' }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <span className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-coral-soft/50 blur-3xl" />
      <span className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-notebook-soft/70 blur-3xl" />

      <header className="relative mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
        <Link to={back} className="focus-ring rounded-lg">
          <Logo size="sm" />
        </Link>
        {step && <span className="text-[13px] font-medium text-mist">{step}</span>}
      </header>

      <main className="relative mx-auto flex max-w-[520px] flex-col px-5 pb-16 pt-6 sm:px-8 sm:pt-12">
        <div className="relative">
          <Star className="absolute -left-6 -top-4 hidden text-coral/50 sm:block" size={16} />
          {children}
        </div>
        {footer && <div className="mt-8 text-center text-[13.5px] text-graphite">{footer}</div>}
      </main>
    </div>
  )
}
