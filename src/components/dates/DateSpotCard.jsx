import { Chip } from '../ui/Chip'
import { IconTag } from '../ui/Icons'
import SpotImage from './SpotImage'
import { dateTypeLabel, priceLabel, walkLabel } from '../../data/partnerCatalog'

/**
 * ── One place, one card ─────────────────────────────────────────────────────
 *
 * Every card is the same height, whatever it contains. That is the whole
 * design constraint here and it drives the rest: a grid where the card with an
 * offer is two hundred pixels taller than its neighbour reads as broken, and
 * it also quietly tells students that the paying places are the important
 * ones — which is the opposite of the promise.
 *
 * So a perk is a small mark in the corner of the photo — one icon, out of the
 * flow — and the words for it go on the footer line next to the partner label,
 * clamped to a single row. A banner across the top of the photo would cost no
 * height either, but it would make the paying card the loudest thing on the
 * page, which is the thing we promised not to do. The name of the place stays
 * the largest thing on the card, because the question a card answers is "would
 * we like it here".
 *
 * Heights are held by construction rather than by luck: a fixed-aspect cover,
 * a note block that reserves its two lines whether or not there is a note, one
 * row of tags, and the footer pushed down by `mt-auto`. Two cards side by side
 * line up row for row, not just at the top and bottom edges.
 */
export default function DateSpotCard({
  spot,
  fit,
  onChoose,
  onDismiss,
  chooseLabel = 'View Date Spot',
  compact = false,
  priority = false,
  className = '',
}) {
  const meta = [spot.kind, priceLabel(spot.priceLevel), walkLabel(spot)].filter(Boolean)
  const goodFor = (spot.dateTypes ?? []).slice(0, 3).map(dateTypeLabel)

  return (
    <article
      className={`lift-corner relative flex h-full flex-col overflow-hidden rounded-card border border-rule bg-white ${className}`}
    >
      {!compact && (
        <div className="relative">
          <SpotImage
            path={spot.coverPath}
            alt=""
            className="aspect-[16/9] w-full"
            seed={spot.id ?? spot.name}
            priority={priority}
          />

          {/* The perk, as a mark rather than a message: one icon, fixed size,
              same on every card that has one. What it *is* is spelled out on
              the footer line below, where it can't grow. */}
          {spot.offer && (
            <span
              className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-black/5 bg-white/95 text-margin shadow-paper backdrop-blur"
              title={spot.offer.summary}
            >
              <IconTag size={15} />
              <span className="sr-only">Loose Leaf perk: {spot.offer.summary}</span>
            </span>
          )}

          {fit != null && (
            <span className="absolute right-3 top-3 rounded-full bg-moss px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-white shadow-paper">
              {fit}% fit
            </span>
          )}
        </div>
      )}

      <div className={`flex flex-1 flex-col ${compact ? 'px-4 py-4' : 'px-5 py-4'}`}>
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-display text-[18px] font-semibold leading-tight text-navy">
            <span className="line-clamp-1">{spot.name}</span>
          </p>
          {compact && fit != null && (
            <span className="shrink-0 rounded-full bg-moss-soft px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-[#3F7454]">
              {fit}% fit
            </span>
          )}
        </div>

        <p className="mt-1 line-clamp-1 text-[12.5px] text-mist">{meta.join(' · ')}</p>

        {/* Reserved whether or not there's a note, so the tag rows of two
            neighbouring cards sit on the same line. */}
        <p className="mt-2 line-clamp-2 min-h-[2.6em] text-[13.5px] leading-relaxed text-graphite">
          {spot.note}
        </p>

        <div className="mt-2.5 flex h-[26px] flex-nowrap gap-1.5 overflow-hidden">
          {goodFor.map((t) => (
            <Chip key={t} tone="cream" className="shrink-0 !px-2.5 !py-1 !text-[11.5px]">
              {t}
            </Chip>
          ))}
        </div>

        <div className="mt-auto pt-3.5">
          {/* One row, always occupied, so a partner card and an organic one
              line up even though only one of them says anything here. The
              partner label is never dropped to make room for the perk — a
              paying place is labelled as one, whatever else is on the card. */}
          <p className="flex min-h-[18px] items-center gap-1.5 text-[11.5px] font-medium text-mist">
            {spot.isPartner && (
              <>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-notebook-deep" />
                <span className="shrink-0">Loose Leaf Partner</span>
              </>
            )}
            {spot.offer && (
              <>
                {spot.isPartner && <span className="shrink-0 text-rule">·</span>}
                <IconTag size={12} className="shrink-0 text-margin" />
                <span className="min-w-0 truncate">{spot.offer.summary}</span>
              </>
            )}
          </p>

          {(onChoose || onDismiss) && (
            <div className="mt-3 flex gap-2">
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
    </article>
  )
}
