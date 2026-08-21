/**
 * ── Turning a business address into a point on a map ────────────────────────
 *
 * Used once, when a partner saves their address, so a Date Spot can show a map
 * and a Directions button. Not used for anything about a person: Looseleaf
 * stores no user location and this doesn't change that.
 *
 * Nominatim is OpenStreetMap's own geocoder — no key, no account. Its usage
 * policy asks for at most one request a second and an identifiable client;
 * a partner saving a shopfront address a handful of times a year sits well
 * inside that, and the browser sends an Origin header identifying us.
 *
 * Best-effort by design. A failure here must never stop somebody saving their
 * details, so every path resolves to null rather than throwing, and a Date
 * Spot without coordinates simply shows its address and a Directions link.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const TIMEOUT_MS = 6000

export async function geocode({ addressLine, city, region, postalCode, country = 'United States' }) {
  const parts = [addressLine, city, region, postalCode, country].filter(Boolean)
  if (parts.length < 2 || !addressLine) return null

  const url = `${ENDPOINT}?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(
    parts.join(', ')
  )}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null

    const [hit] = await res.json()
    if (!hit) return null

    const lat = Number(hit.lat)
    const lng = Number(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    return { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) }
  } catch {
    // Offline, blocked, rate-limited, or simply not found. All the same here.
    return null
  } finally {
    clearTimeout(timer)
  }
}
