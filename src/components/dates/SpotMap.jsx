import { IconPin, IconDirections } from '../ui/Icons'

/**
 * ── Where it is, and how to get there ───────────────────────────────────────
 *
 * The map is an OpenStreetMap embed, which needs no API key and no script —
 * one iframe, lazily loaded, so it costs nothing until somebody scrolls to it.
 * A partner's address is geocoded once when they save it; if that didn't
 * produce coordinates the map is simply left out and the address and the
 * Directions button carry the section on their own.
 *
 * Directions deliberately leaves Loose Leaf. A `?q=` maps link opens the
 * native app on both phones and Google Maps on a laptop, which is better than
 * anything we could build in a sheet — and it takes the *address*, so it works
 * whether or not we ever managed to geocode it.
 *
 * The only location in here is the restaurant's. Loose Leaf still has no idea
 * where the person reading this is standing.
 */
export default function SpotMap({ spot }) {
  const address = [spot.addressLine, spot.city, spot.region].filter(Boolean).join(', ')
  if (!address && spot.latitude == null) return null

  const lat = spot.latitude != null ? Number(spot.latitude) : null
  const lng = spot.longitude != null ? Number(spot.longitude) : null
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng)

  // A box roughly 400m across, which frames a street rather than a city.
  const d = 0.0035
  const bbox = hasPoint ? [lng - d, lat - d, lng + d, lat + d].join('%2C') : null

  const query = encodeURIComponent(address || `${lat},${lng}`)
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${query}`

  return (
    <div className="overflow-hidden rounded-card border border-rule bg-white">
      {hasPoint && (
        <iframe
          title={`Map showing ${spot.name}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="block h-[190px] w-full border-0 bg-cream"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream text-graphite">
          <IconPin size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug text-navy">{address || spot.name}</p>
          {spot.walkMinutes != null && (
            <p className="mt-0.5 text-[12.5px] text-mist">
              About {spot.walkMinutes} minutes from campus
            </p>
          )}
        </div>
        <a
          href={directions}
          target="_blank"
          rel="noreferrer noopener"
          className="press focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-rule bg-white px-3.5 py-2 text-[13.5px] font-medium text-navy transition hover:border-navy/25"
        >
          <IconDirections size={15} />
          Directions
        </a>
      </div>
    </div>
  )
}
