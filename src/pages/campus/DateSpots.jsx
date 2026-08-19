import SubPageHeader from '../../components/common/SubPageHeader'
import RailCard from '../../components/common/RailCard'
import { Chip } from '../../components/ui/Chip'
import { useRail } from '../../components/nav/AppLayout'
import { DATE_SPOTS, SPONSORED_OFFERS } from '../../data/catalog'
import { IconPin } from '../../components/ui/Icons'

export default function DateSpots() {
  useRail(
    <RailCard title="About sponsored spots">
      <p className="text-[13.5px] leading-relaxed text-graphite">
        Local places can sponsor an offer here, and it’s always labelled. Sponsorship buys a spot on this page and
        nothing else — it can’t touch who appears in Discover or Likes.
      </p>
    </RailCard>,
    []
  )

  return (
    <>
      <SubPageHeader
        title="Date Spots"
        subtitle="Places around campus that work when you barely know each other yet."
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {DATE_SPOTS.map((s) => (
          <li key={s.id} className="lift-corner rounded-card border border-rule bg-white px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-graphite">
                <IconPin size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[15.5px] font-medium leading-tight text-navy">{s.name}</p>
                <p className="mt-1 text-[12.5px] text-mist">
                  {s.kind} · {s.walk}
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-graphite">{s.note}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <Chip key={t} tone="cream" className="!px-2.5 !py-1 !text-[11.5px]">
                      {t}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-6">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
          Need somewhere to go?
        </h2>
        {SPONSORED_OFFERS.map((o) => (
          <div key={o.id} className="rounded-card border border-[#F2E6D6] bg-cream px-5 py-5">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[22px]">
                <span aria-hidden="true">{o.emoji}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[18px] font-semibold leading-tight">{o.headline}</p>
                <p className="mt-1 text-[14.5px] text-graphite">{o.detail}</p>
                <p className="mt-1 text-[13px] text-mist">
                  {o.sponsor} · {o.distance}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-rule bg-white px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-mist">
                Sponsored
              </span>
            </div>
          </div>
        ))}
        <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-mist">
          This is how Looseleaf plans to make money — offers that are useful when you’re already going out, never
          ads placed between people.
        </p>
      </section>
    </>
  )
}
