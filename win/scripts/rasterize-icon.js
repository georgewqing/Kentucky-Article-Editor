/**
 * Rebuild app icon PNG from the SVG mark (1024², transparent corners).
 * Source of truth: build/icon.svg
 *
 *   node scripts/rasterize-icon.js
 */
const { writeFileSync, copyFileSync } = require('fs')
const { join } = require('path')
const { PNG } = require('pngjs')

const root = join(__dirname, '..')
const SIZE = 1024
/** ~21.5% — Cursor / macOS-style squircle (was 135 ≈ 13%). */
const OUTER_R = 220
/** Inset of the K mark (was 108 ≈ 10.5%). Cursor-like ~18% gutter. */
const PAD = 184
const LIGHT = [239, 239, 239]
const INK = [2, 2, 2]

/** Original fit in 1024 space (pad 108, mark to ~890). */
const SRC_ORIGIN = 108
const SRC_SPAN = 782
const SCALE = (SIZE - 2 * PAD) / SRC_SPAN

function mapPt(x, y) {
  return [PAD + (x - SRC_ORIGIN) * SCALE, PAD + (y - SRC_ORIGIN) * SCALE]
}

/** Inner rounded square, cut by a 45° half-plane. */
const INNER = {
  x: PAD + (108 - SRC_ORIGIN) * SCALE,
  y: PAD + (108 - SRC_ORIGIN) * SCALE,
  s: 762 * SCALE,
  r: 100 * SCALE
}
/** Original cut x+y<=1024, after the same affine map. */
const DIAG = (1024 - 2 * SRC_ORIGIN) * SCALE + 2 * PAD

/** Right mark — RDP of the source PNG contour, then padded/scaled. */
const TRI_SRC = [
  [869.8, 345.9],
  [881.1, 350.9],
  [886.1, 376],
  [888.6, 854.8],
  [884.9, 864.8],
  [872.3, 869.8],
  [856, 859.8],
  [631.7, 638],
  [621.7, 611.6],
  [624.2, 594.1],
  [635.5, 576.5],
  [857.3, 352.2],
  [868.6, 347.2]
]
const TRI_POLY = TRI_SRC.map(([x, y]) => mapPt(x, y))

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function fmt(n) {
  return Number(n.toFixed(2))
}

function polyPath(pts) {
  return (
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(p[0])} ${fmt(p[1])}`).join(' ') + ' Z'
  )
}

function diagArcHit(cx, cy, r, diag, pick) {
  const k = diag - cy
  const a = 2
  const b = -2 * (cx + k)
  const c = cx * cx + k * k - r * r
  const disc = Math.max(0, b * b - 4 * a * c)
  const s = Math.sqrt(disc)
  const x1 = (-b + s) / (2 * a)
  const x2 = (-b - s) / (2 * a)
  const x = pick(x1, x2)
  return { x, y: diag - x }
}

function blob0Path() {
  const x0 = INNER.x
  const y0 = INNER.y
  const x1 = INNER.x + INNER.s
  const y1 = INNER.y + INNER.s
  const r = INNER.r
  const tr = diagArcHit(x1 - r, y0 + r, r, DIAG, (a, b) => Math.max(a, b))
  const bl = diagArcHit(x0 + r, y1 - r, r, DIAG, (a, b) => Math.min(a, b))
  return [
    `M ${fmt(x0 + r)} ${fmt(y0)}`,
    `H ${fmt(x1 - r)}`,
    `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(tr.x)} ${fmt(tr.y)}`,
    `L ${fmt(bl.x)} ${fmt(bl.y)}`,
    `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x0)} ${fmt(y1 - r)}`,
    `V ${fmt(y0 + r)}`,
    `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x0 + r)} ${fmt(y0)}`,
    'Z'
  ].join(' ')
}

function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2
  const cy = y + h / 2
  const hw = w / 2
  const hh = h / 2
  const dx = Math.abs(px - cx) - (hw - r)
  const dy = Math.abs(py - cy) - (hh - r)
  const ox = Math.max(dx, 0)
  const oy = Math.max(dy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r
}

function asPoly(pts) {
  return pts.map((p) => ({ x: p[0], y: p[1] }))
}

function pointInPoly(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const hit = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 0.0) + xi
    if (hit) inside = !inside
  }
  return inside
}

function buildSvg(blob0, triPath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>KENTUCKY</title>
  <rect width="1024" height="1024" rx="${OUTER_R}" ry="${OUTER_R}" fill="#020202"/>
  <path fill="#EFEFEF" d="${blob0}"/>
  <path fill="#EFEFEF" d="${triPath}"/>
</svg>
`
}

function rasterize(blob0Inside, triPoly) {
  const aa = 4
  const big = SIZE * aa
  const acc = new Float32Array(SIZE * SIZE * 4)
  for (let y = 0; y < big; y++) {
    const py = (y + 0.5) / aa
    for (let x = 0; x < big; x++) {
      const px = (x + 0.5) / aa
      const plate = sdRoundRect(px, py, 0, 0, SIZE, SIZE, OUTER_R)
      if (plate > 0.6) continue
      const cover = plate < -0.6 ? 1 : clamp(0.5 - plate, 0, 1)
      const light = blob0Inside(px, py) || pointInPoly(px, py, triPoly)
      const rgb = light ? LIGHT : INK
      const dx = Math.floor(x / aa)
      const dy = Math.floor(y / aa)
      const i = (dy * SIZE + dx) * 4
      acc[i] += rgb[0] * cover
      acc[i + 1] += rgb[1] * cover
      acc[i + 2] += rgb[2] * cover
      acc[i + 3] += 255 * cover
    }
  }
  const png = new PNG({ width: SIZE, height: SIZE })
  const n = aa * aa
  for (let i = 0; i < SIZE * SIZE; i++) {
    const o = i * 4
    const a = acc[o + 3] / n
    if (a < 0.5) {
      png.data[o] = 0
      png.data[o + 1] = 0
      png.data[o + 2] = 0
      png.data[o + 3] = 0
      continue
    }
    png.data[o] = Math.round(acc[o] / n)
    png.data[o + 1] = Math.round(acc[o + 1] / n)
    png.data[o + 2] = Math.round(acc[o + 2] / n)
    png.data[o + 3] = Math.round(a)
  }
  return PNG.sync.write(png)
}

function blob0Inside(px, py) {
  if (px + py > DIAG) return false
  return sdRoundRect(px, py, INNER.x, INNER.y, INNER.s, INNER.s, INNER.r) <= 0
}

const blob0 = blob0Path()
const triPoly = asPoly(TRI_POLY)
const svg = buildSvg(blob0, polyPath(TRI_POLY))

const svgPath = join(root, 'build', 'icon.svg')
const pngPath = join(root, 'build', 'icon.png')
const resPath = join(root, 'resources', 'icon.png')

writeFileSync(svgPath, svg)
console.log('wrote', svgPath)
const png = rasterize(blob0Inside, triPoly)
writeFileSync(pngPath, png)
copyFileSync(pngPath, resPath)
console.log('wrote', pngPath)
console.log('copied', resPath)
