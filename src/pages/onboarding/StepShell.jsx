import Logo from '../../components/brand/Logo'
import Button from '../../components/ui/Button'
import { IconBack } from '../../components/ui/Icons'
import { Underline } from '../../components/brand/Doodles'

export default function StepShell({
  step,
  total,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = 'Continue',
  canContinue = true,
  skip,
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b border-rule/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] items-center gap-3 px-5 py-4 sm:px-8">
          {onBack ? (
            <button
              onClick={onBack}
              aria-label="Back"
              className="press focus-ring -ml-2 flex h-9 w-9 items-center justify-center rounded-full text-graphite hover:bg-navy/[0.05]"
            >
              <IconBack size={20} />
            </button>
          ) : (
            <Logo size="sm" />
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[12.5px] font-medium tabular-nums text-mist">
              {step} of {total}
            </span>
            <span className="flex gap-1" aria-hidden="true">
              {Array.from({ length: total }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i < step ? 'w-4 bg-coral' : 'w-2 bg-navy/10'
                  }`}
                />
              ))}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[640px] flex-1 px-5 pb-40 pt-8 sm:px-8 sm:pt-12">
        <h1 className="relative inline-block font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[35px]">
          {title}
          <Underline className="absolute -bottom-1 left-0 text-coral/50" width={Math.min(240, title.length * 11)} />
        </h1>
        {subtitle && <p className="mt-5 max-w-[46ch] text-[15.5px] leading-relaxed text-graphite">{subtitle}</p>}

        <div className="mt-9 animate-fade-up">{children}</div>
      </main>

      <footer className="sticky bottom-0 border-t border-rule bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] items-center gap-3 px-5 py-4 pb-safe sm:px-8">
          {skip && (
            <Button variant="ghost" size="lg" onClick={skip.onClick}>
              {skip.label}
            </Button>
          )}
          <Button variant="coral" size="lg" full disabled={!canContinue} onClick={onNext} className="ml-auto">
            {nextLabel}
          </Button>
        </div>
      </footer>
    </div>
  )
}
