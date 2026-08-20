import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/**
 * A QR code, drawn as one SVG path.
 *
 * The library gives us the module grid; the drawing is ours so the code can
 * sit on Loose Leaf's paper rather than on a white rectangle, and so the
 * quiet zone is a real four modules instead of whatever a wrapper decided.
 *
 * Error correction is M rather than L: this gets photographed off a phone
 * screen, at an angle, in a dim restaurant, sometimes with a thumb across one
 * corner. The extra redundancy is worth the denser grid.
 */
export default function QrCode({
  value,
  size = 176,
  dark = '#111C38',
  light = 'transparent',
  className = '',
  label = 'Date Pass QR code',
}) {
  const { path, dimension } = useMemo(() => {
    // 0 = pick the smallest version that fits.
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()

    const count = qr.getModuleCount()
    const quiet = 4
    const d = count + quiet * 2

    let out = ''
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) {
          out += `M${col + quiet} ${row + quiet}h1v1h-1z`
        }
      }
    }
    return { path: out, dimension: d }
  }, [value])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={className}
    >
      {light !== 'transparent' && <rect width={dimension} height={dimension} fill={light} />}
      <path d={path} fill={dark} />
    </svg>
  )
}
