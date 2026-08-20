import { Chip } from '../ui/Chip'
import { IconPin, IconSpark } from '../ui/Icons'
import { dateTypeLabel, priceLabel, walkLabel } from '../../data/partnerCatalog'

/**
 * One place, one card.
 *
 * A Loose Leaf Partner is labelled — always, and in the same small quiet way
 * whatever they pay — and an offer sits underneath as a perk rather than above
 * as a headline. The name of the place is the largest thing on the card,
 * because the question the card answers is "would we like it here", not "who
 * bought this space".
 */
export default function DateSpotCard({
  spot,
  fit,
  onChoose,
  onDismiss,
  chooseLabel = 'View Date Spot',
  compact = false,
  className = '',
}) {
  const meta = [spot.kind, priceLabel(spot.priceLevel), walkLabel(spot)].filter(Boolean)
  const goodFor = (spot.dateTypes ?? []).slice(0, 3).map(dateTypeLabel)

  return (
    <div
      className={`lift-corner relative flex h-full flex-col rounded-card border border-rule bg-white ${
        compact ? 'px-4 py-4' : 'px-5 py-5'
      } ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cream text-graphite">
          <IconPin size={19} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-display text-[19px] font-semibold leading-tight text-navy">
              {spot.name}
            </p>
            {fit != null && (
              <span className="shrink-0 rounded-full bg-moss-soft px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-[#3F7454]">
                {fit}% fit
              </span>
            )}
          </div>

          <p className="mt-1 text-[12.5px] text-mist">{meta.join(' · ')}</p>

          {spot.note && (
            <p className="mt-2 text-[13.5px] leading-relaxed text-graphite">{spot.note}</p>
          )}

          {goodFor.length > 0 && !compact && (
            <div className="mt-3">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-mist">
                Great for
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {goodFor.map((t) => (
                  <Chip key={t} tone="cream" className="!px-2.5 !py-1 !text-[11.5px]">
                    {t}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {spot.isPartner && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-mist">
              <span className="h-1.5 w-1.5 rounded-full bg-notebook-deep" />
              Loose Leaf Partner
            </p>
          )}
        </div>
      </div>

      {/* Pushed to the bottom so cards in a row line their buttons up, whatever
          length the description or the tag list turned out to be. */}
      <div className="mt-auto">
      {spot.offer && (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#F2E6D6] bg-cream px-4 py-3">
          <IconSpark size={16} className="mt-0.5 shrink-0 text-margin" />
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-mist">
              Loose Leaf perk
            </p>
            <p className="mt-0.5 text-[14.5px] font-medium leading-snug text-navy">
              {spot.offer.summary}
            </p>
            {spot.offer.daysText && (
              <p className="mt-0.5 text-[12.5px] text-graphite">{spot.offer.daysText}</p>
            )}
          </div>
        </div>
      )}

      {(onChoose || onDismiss) && (
        <div className="mt-4 flex gap-2">
          {onChoose && (
            <button
              type="button"
              onClick={() => onChoose(spot)}
              className="press focus-ring flex-1 rounded-2xl bg-coral px-4 py-2.5 text-[14px] font-medium text-white transition hover:bg-coral-deep"
            >
              {chooseLabel}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(spot)}
              className="press focus-ring rounded-2xl border border-rule bg-white px-4 py-2.5 text-[14px] font-medium text-graphite transition hover:border-navy/25 hover:text-navy"
            >
              Not this one
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
