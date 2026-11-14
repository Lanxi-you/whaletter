// 生成 PWA 图标（192 / 512），纯 node zlib 手搓 PNG，不装任何依赖。
// 画面：深海蓝圆角方块 + 浅一点的圆 + 白色对话气泡（气泡里一道浪）。
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function png(size, pixel) {
  // RGBA，每行前面加一个 filter 字节 0
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size)
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
      raw[o++] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// 圆角方块内 = 1，外 = 0（抗锯齿用距离过渡）
function roundRectAlpha(x, y, s, radius, inset) {
  const h = s / 2
  const px = Math.abs(x - h)
  const py = Math.abs(y - h)
  const max = h - inset
  const dx = Math.max(px - (max - radius), 0)
  const dy = Math.max(py - (max - radius), 0)
  const d = Math.hypot(dx, dy)
  if (px > max || py > max) return 0
  if (dx === 0 || dy === 0) return 1
  return Math.max(0, Math.min(1, radius - d + 0.5))
}

function make(size) {
  return png(size, (x, y, s) => {
    const u = x / s
    const v = y / s
    // 背景：深海蓝渐变
    const t = (u + v) / 2
    let r = Math.round(14 + 22 * t)
    let g = Math.round(38 + 52 * t)
    let b = Math.round(58 + 62 * t)
    let a = 255

    // 外圈圆角（图标本身要在 launcher 里是圆角方块；maskable 也能吃）
    const outer = roundRectAlpha(x, y, s, s * 0.22, 0)
    if (outer <= 0) return [0, 0, 0, 0]
    a = Math.round(255 * outer)

    // 中间浅色圆
    const d = Math.hypot(u - 0.5, v - 0.5)
    if (d < 0.36) {
      const k = Math.max(0, Math.min(1, (0.36 - d) / 0.02))
      r = Math.round(r * (1 - k) + 122 * k)
      g = Math.round(g * (1 - k) + 196 * k)
      b = Math.round(b * (1 - k) + 222 * k)
    }

    // 白色对话气泡：圆角矩形 (0.26..0.74, 0.28..0.63) + 左下小尾巴
    const bx0 = 0.26, bx1 = 0.74, by0 = 0.28, by1 = 0.62
    const inX = u > bx0 && u < bx1
    const inY = v > by0 && v < by1
    const rr = 0.075
    let inBubble = false
    if (inX && inY) {
      const cx = Math.min(u - bx0, bx1 - u)
      const cy = Math.min(v - by0, by1 - v)
      inBubble = cx > rr || cy > rr || Math.hypot(rr - cx, rr - cy) < rr
    }
    const tail = u > 0.34 && u < 0.46 && v >= by1 - 0.005 && v < 0.72 && u - 0.34 < (0.72 - v) * 1.1
    if (inBubble || tail) {
      r = 246; g = 251; b = 255
      // 气泡里一道浪（三颗深色点 + 弧）
      const wave = Math.abs(v - (0.47 + 0.03 * Math.sin((u - 0.3) * 18)))
      if (u > 0.32 && u < 0.68 && wave < 0.018) {
        r = 32; g = 84; b = 116
      }
    }
    return [r, g, b, a]
  })
}

mkdirSync(OUT, { recursive: true })
for (const size of [192, 512]) {
  const buf = make(size)
  writeFileSync(join(OUT, `icon-${size}.png`), buf)
  console.log('wrote', join(OUT, `icon-${size}.png`), buf.length, 'bytes')
}
// 白底 iOS 主屏图标（iOS 不吃透明）
writeFileSync(join(OUT, 'apple-touch-icon.png'), make(180))
console.log('done')
