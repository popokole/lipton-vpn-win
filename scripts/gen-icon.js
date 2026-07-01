// Генерирует assets/icon.png (256×256) и assets/icon.ico под фирменный знак
// Lipton с сайта (тёмный скруглённый квадрат + три скошенных зелёных столбика).
// Запуск: node scripts/gen-icon.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const S = 256
const SCALE = S / 40 // viewBox сайта 40×40
const TAN9 = Math.tan((9 * Math.PI) / 180) // skewX(-9deg)

// --- утилиты цвета/геометрии ---
const A = [0x34, 0xf5, 0xa3] // #34F5A3
const B = [0x0f, 0xa9, 0x68] // #0FA968
const lerp = (a, b, t) => a + (b - a) * t
const mix = (t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]

// SDF скруглённого прямоугольника (в координатах viewBox)
function roundRectCover(vx, vy, x, y, w, h, r) {
  const cx = Math.max(x + r, Math.min(vx, x + w - r))
  const cy = Math.max(y + r, Math.min(vy, y + h - r))
  const inCore = vx >= x && vx <= x + w && vy >= y && vy <= y + h
  if (!inCore) return 0
  // мягкая граница по углам
  const dx = vx - cx
  const dy = vy - cy
  const d = Math.sqrt(dx * dx + dy * dy)
  if (vx < x + r && vy < y + r) return d <= r ? 1 : 0
  if (vx > x + w - r && vy < y + r) return d <= r ? 1 : 0
  if (vx < x + r && vy > y + h - r) return d <= r ? 1 : 0
  if (vx > x + w - r && vy > y + h - r) return d <= r ? 1 : 0
  return 1
}

const bars = [
  { x: 9, y: 7, w: 5.4, h: 26, r: 2.7, op: 1.0 },
  { x: 18, y: 19, w: 5.4, h: 14, r: 2.7, op: 0.82 },
  { x: 27, y: 13, w: 5.4, h: 20, r: 2.7, op: 0.62 },
]

function sampleColor(fx, fy) {
  // координаты в viewBox
  const vx = fx / SCALE
  const vy = fy / SCALE
  // фон — тёмный скруглённый квадрат
  let r = 0, g = 0, b = 0, a = 0
  if (roundRectCover(vx, vy, 0, 0, 40, 40, 10)) {
    r = 0x07; g = 0x10; b = 0x0c; a = 1
  } else {
    return [0, 0, 0, 0]
  }
  // столбики (учёт skewX(-9): обратное преобразование)
  const bx = vx + TAN9 * vy
  for (const bar of bars) {
    if (roundRectCover(bx, vy, bar.x, bar.y, bar.w, bar.h, bar.r)) {
      const t = Math.max(0, Math.min(1, ((bx - bar.x) / bar.w + (vy - bar.y) / bar.h) / 2))
      const c = mix(t)
      const oa = bar.op
      r = c[0] * oa + r * (1 - oa)
      g = c[1] * oa + g * (1 - oa)
      b = c[2] * oa + b * (1 - oa)
    }
  }
  return [r, g, b, a * 255]
}

// растеризация с суперсэмплингом 3×3
function render() {
  const SS = 3
  const raw = Buffer.alloc(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = sampleColor(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
          r += px[0]; g += px[1]; b += px[2]; a += px[3]
        }
      }
      const n = SS * SS
      const o = (y * S + x) * 4
      raw[o] = Math.round(r / n)
      raw[o + 1] = Math.round(g / n)
      raw[o + 2] = Math.round(b / n)
      raw[o + 3] = Math.round(a / n)
    }
  }
  return raw
}

// --- PNG-энкодер ---
const POLY = 0xedb88320
let crcTable = null
function getCrc() {
  if (crcTable) return crcTable
  crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? POLY ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }
  return crcTable
}
function crc32(buf) {
  const t = getCrc()
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ t[(crc ^ buf[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  t.copy(out, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length)
  return out
}
function encodePng(raw) {
  // добавляем фильтр-байт (0) в начало каждой строки
  const rows = Buffer.alloc(S * (S * 4 + 1))
  for (let y = 0; y < S; y++) {
    rows[y * (S * 4 + 1)] = 0
    raw.copy(rows, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
  }
  const idat = zlib.deflateSync(rows, { level: 9 })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ICO с одной 256×256 PNG-записью (Windows Vista+)
function encodeIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(1, 4) // count
  const entry = Buffer.alloc(16)
  entry[0] = 0 // width 256
  entry[1] = 0 // height 256
  entry[2] = 0; entry[3] = 0
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(6 + 16, 12) // offset
  return Buffer.concat([header, entry, png])
}

const raw = render()
const png = encodePng(raw)
const ico = encodeIco(png)
const dir = path.join(__dirname, '..', 'assets')
fs.writeFileSync(path.join(dir, 'icon.png'), png)
fs.writeFileSync(path.join(dir, 'icon.ico'), ico)
console.log('icon.png', png.length, 'bytes; icon.ico', ico.length, 'bytes')
