// Иконки трея из фирменного знака (три наклонные полоски) — PNG генерируется
// в коде, без файлов: состояние «подключено», «отключено», «kill switch».
// Геометрия — как у SVG логотипа: viewBox 40, translate(3.2 0) skewX(-9).

const zlib = require('zlib')

const POLY = 0xEDB88320
let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (POLY ^ (c >>> 1)) : (c >>> 1)
      crcTable[n] = c
    }
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF]
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  t.copy(out, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length)
  return out
}

function encodePng(size, rgba) {
  const stride = size * 4
  const rows = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    rows[y * (stride + 1)] = 0
    rgba.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 8 бит на канал
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// Цвета полосок по состоянию: [начало градиента, конец].
const PALETTES = {
  connected: [[0x34, 0xF5, 0xA3], [0x0F, 0xA9, 0x68]],
  disconnected: [[0xA7, 0xB1, 0xAC], [0x6E, 0x78, 0x73]],
  'kill-switch': [[0xFF, 0xA2, 0x4C], [0xFF, 0x4E, 0x1A]],
}

const TAN9 = Math.tan(9 * Math.PI / 180)
const BARS = [
  { x: 8, y: 7, w: 5.4, h: 26, r: 2.7, op: 1 },
  { x: 17, y: 19, w: 5.4, h: 14, r: 2.7, op: 0.82 },
  { x: 26, y: 13, w: 5.4, h: 20, r: 2.7, op: 0.62 },
]
// Кадр вокруг полосок (в единицах viewBox): знак крупнее, чем в квадрате 40×40.
const CROP = { x: 5.3, y: 6, size: 28 }

function inRoundRect(px, py, b) {
  if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) return false
  const cx = Math.max(b.x + b.r, Math.min(px, b.x + b.w - b.r))
  const cy = Math.max(b.y + b.r, Math.min(py, b.y + b.h - b.r))
  const dx = px - cx, dy = py - cy
  return dx * dx + dy * dy <= b.r * b.r
}

// makeLogoPng(size, state) → PNG-буфер size×size с прозрачным фоном.
function makeLogoPng(size, state = 'disconnected') {
  const [A, B] = PALETTES[state] || PALETTES.disconnected
  const scale = CROP.size / size
  const SS = 4 // суперсэмплинг для сглаживания краёв
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const vx = CROP.x + (x + (sx + 0.5) / SS) * scale
          const vy = CROP.y + (y + (sy + 0.5) / SS) * scale
          const bx = vx - 3.2 + TAN9 * vy
          for (const bar of BARS) {
            if (!inRoundRect(bx, vy, bar)) continue
            const t = Math.max(0, Math.min(1, ((bx - bar.x) / bar.w + (vy - bar.y) / bar.h) / 2))
            const al = bar.op
            r += (A[0] + (B[0] - A[0]) * t) * al
            g += (A[1] + (B[1] - A[1]) * t) * al
            b += (A[2] + (B[2] - A[2]) * t) * al
            a += al
            break
          }
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      if (a > 0) {
        rgba[o] = Math.round(r / a)
        rgba[o + 1] = Math.round(g / a)
        rgba[o + 2] = Math.round(b / a)
        rgba[o + 3] = Math.round((a / n) * 255)
      }
    }
  }
  return encodePng(size, rgba)
}

module.exports = { makeLogoPng, encodePng, PALETTES }
