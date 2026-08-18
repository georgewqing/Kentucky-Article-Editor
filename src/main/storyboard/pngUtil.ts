/**
 * Minimal RGB PNG encode/decode helpers (no native deps).
 * Encode: uncompressed/filtered scanlines + zlib. Decode: IHDR + IDAT via zlib.
 */
import { deflateSync, inflateSync } from 'zlib'
import { PNG } from 'pngjs'

export type RgbaBuffer = {
  width: number
  height: number
  /** length = width * height * 4 */
  data: Buffer
}

export const MAX_PNG_DIM = 16384
export const MAX_PNG_PIXELS = 80_000_000

export function assertPngLimits(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('Invalid PNG dimensions')
  }
  if (width > MAX_PNG_DIM || height > MAX_PNG_DIM) {
    throw new Error(`PNG too large (${width}×${height}); max edge ${MAX_PNG_DIM}`)
  }
  if (width * height > MAX_PNG_PIXELS) {
    throw new Error(`PNG too large (${width}×${height} pixels)`)
  }
}

function readPngIhdr(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24) throw new Error('PNG truncated')
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error('Not a PNG')
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

export function createRgba(width: number, height: number, fill = [240, 240, 240, 255]): RgbaBuffer {
  assertPngLimits(width, height)
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    data[o] = fill[0]
    data[o + 1] = fill[1]
    data[o + 2] = fill[2]
    data[o + 3] = fill[3]
  }
  return { width, height, data }
}

export function fillRect(
  img: RgbaBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: [number, number, number, number]
): void {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(img.width, Math.ceil(x + w))
  const y1 = Math.min(img.height, Math.ceil(y + h))
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const o = (py * img.width + px) * 4
      img.data[o] = rgba[0]
      img.data[o + 1] = rgba[1]
      img.data[o + 2] = rgba[2]
      img.data[o + 3] = rgba[3]
    }
  }
}

export function strokeRect(
  img: RgbaBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: [number, number, number, number],
  thickness = 2
): void {
  fillRect(img, x, y, w, thickness, rgba)
  fillRect(img, x, y + h - thickness, w, thickness, rgba)
  fillRect(img, x, y, thickness, h, rgba)
  fillRect(img, x + w - thickness, y, thickness, h, rgba)
}

/** Draw a simple 5×7 digit bitmap (scaled). */
export function drawTextLabel(
  img: RgbaBuffer,
  text: string,
  x: number,
  y: number,
  rgba: [number, number, number, number],
  scale = 3
): void {
  const glyphs: Record<string, number[]> = {
    '0': [0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f],
    '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
    '2': [0x1f, 0x01, 0x01, 0x1f, 0x10, 0x10, 0x1f],
    '3': [0x1f, 0x01, 0x01, 0x0f, 0x01, 0x01, 0x1f],
    '4': [0x11, 0x11, 0x11, 0x1f, 0x01, 0x01, 0x01],
    '5': [0x1f, 0x10, 0x10, 0x1f, 0x01, 0x01, 0x1f],
    '6': [0x1f, 0x10, 0x10, 0x1f, 0x11, 0x11, 0x1f],
    '7': [0x1f, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01],
    '8': [0x1f, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x1f],
    '9': [0x1f, 0x11, 0x11, 0x1f, 0x01, 0x01, 0x1f],
    '#': [0x0a, 0x1f, 0x0a, 0x0a, 0x1f, 0x0a, 0x0a],
    '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  }
  let cx = x
  for (const ch of text) {
    const g = glyphs[ch] || glyphs['#']
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row] & (1 << (4 - col))) {
          fillRect(img, cx + col * scale, y + row * scale, scale, scale, rgba)
        }
      }
    }
    cx += 6 * scale
  }
}

export function encodePng(img: RgbaBuffer): Buffer {
  const png = new PNG({ width: img.width, height: img.height })
  img.data.copy(png.data)
  return PNG.sync.write(png)
}

export function decodePng(buf: Buffer): RgbaBuffer {
  const ihdr = readPngIhdr(buf)
  assertPngLimits(ihdr.width, ihdr.height)
  const png = PNG.sync.read(buf)
  return { width: png.width, height: png.height, data: Buffer.from(png.data) }
}

export function extractRect(img: RgbaBuffer, x: number, y: number, w: number, h: number): RgbaBuffer {
  const out = createRgba(w, h, [0, 0, 0, 255])
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const sx = x + px
      const sy = y + py
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue
      const si = (sy * img.width + sx) * 4
      const di = (py * w + px) * 4
      out.data[di] = img.data[si]
      out.data[di + 1] = img.data[si + 1]
      out.data[di + 2] = img.data[si + 2]
      out.data[di + 3] = img.data[si + 3]
    }
  }
  return out
}

/** Nearest-neighbor scale entire image to target size. */
export function scaleNearest(img: RgbaBuffer, tw: number, th: number): RgbaBuffer {
  const out = createRgba(tw, th)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x / tw) * img.width))
      const sy = Math.min(img.height - 1, Math.floor((y / th) * img.height))
      const si = (sy * img.width + sx) * 4
      const di = (y * tw + x) * 4
      out.data[di] = img.data[si]
      out.data[di + 1] = img.data[si + 1]
      out.data[di + 2] = img.data[si + 2]
      out.data[di + 3] = img.data[si + 3]
    }
  }
  return out
}

// silence unused if tree-shaken — keep inflate available for future
void deflateSync
void inflateSync
