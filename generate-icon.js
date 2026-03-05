#!/usr/bin/env node
/**
 * Generates assets/icon.png and assets/icon.ico for Flow-Docs
 * Run once: node generate-icon.js
 */

const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// ── PNG encoder (zero deps) ───────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  return t
})()

function crc32 (buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk (type, data) {
  const typeB = Buffer.from(type, 'ascii')
  const lenB  = Buffer.alloc(4); lenB.writeUInt32BE(data.length, 0)
  const crcB  = Buffer.alloc(4); crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0)
  return Buffer.concat([lenB, typeB, data, crcB])
}

function makePNG (w, h, rgbBuf) {
  const rows = []
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3) // filter byte (0=None) + RGB row
    rgbBuf.copy(row, 1, y * w * 3, (y + 1) * w * 3)
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2 // bit-depth=8, color-type=RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// Vista+ ICO: wraps a PNG directly (no re-encoding needed)
function pngToIco (pngBuf) {
  const icondir  = Buffer.from([0,0, 1,0, 1,0]) // reserved | type=1 | count=1
  const direntry = Buffer.alloc(16)
  // width=0, height=0 → both mean 256 in the ICO spec
  direntry.writeUInt16LE(1,  4)                   // planes
  direntry.writeUInt16LE(32, 6)                   // bit count
  direntry.writeUInt32LE(pngBuf.length, 8)        // size of image data
  direntry.writeUInt32LE(icondir.length + 16, 12) // offset to PNG data
  return Buffer.concat([icondir, direntry, pngBuf])
}

// ── Canvas ────────────────────────────────────────────────────────────────────

const W = 256, H = 256
const canvas = Buffer.alloc(W * H * 3, 0) // all black

function rect (x, y, w, h) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx, py = y + dy
      if (px >= 0 && px < W && py >= 0 && py < H) {
        const i = (py * W + px) * 3
        canvas[i] = canvas[i + 1] = canvas[i + 2] = 255 // white
      }
    }
}

// ── FD pixel-art definition ───────────────────────────────────────────────────
//
//  Each cell = S×S pixels.  1 = white, 0 = black (transparent background).
//
//  Layout:   [F: 6 cols] [gap: 2 cols] [D: 7 cols]  =  15 cols total
//            8 rows tall
//
//  At S=16:  15×16 = 240 px wide,  8×16 = 128 px tall  →  fits 256×256 nicely

const S = 16

const F = [
  [1,1,1,1,1,1], // ████████  top bar (full)
  [1,1,0,0,0,0], // ██
  [1,1,0,0,0,0], // ██
  [1,1,1,1,1,0], // ████████  mid bar
  [1,1,1,1,1,0], // ████████  (double for weight)
  [1,1,0,0,0,0], // ██
  [1,1,0,0,0,0], // ██
  [1,1,0,0,0,0], // ██
]

const D = [
  [1,1,1,1,1,0,0], // ██████
  [1,1,0,0,1,1,0], // ██  ████
  [1,1,0,0,0,1,1], // ██    ████
  [1,1,0,0,0,1,1], // ██    ████
  [1,1,0,0,0,1,1], // ██    ████
  [1,1,0,0,0,1,1], // ██    ████
  [1,1,0,0,1,1,0], // ██  ████
  [1,1,1,1,1,0,0], // ██████
]

const ROWS  = F.length        // 8
const FCOLS = F[0].length     // 6
const DCOLS = D[0].length     // 7
const GAP   = 2               // blank cols between F and D

const totalW = (FCOLS + GAP + DCOLS) * S  // 15 * 16 = 240
const totalH = ROWS * S                   //  8 * 16 = 128

const ox = Math.round((W - totalW) / 2)   // 8  px from left
const oy = Math.round((H - totalH) / 2)   // 64 px from top

// Draw F
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < FCOLS; c++)
    if (F[r][c]) rect(ox + c * S, oy + r * S, S, S)

// Draw D  (offset by F width + gap)
const dox = ox + (FCOLS + GAP) * S
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < DCOLS; c++)
    if (D[r][c]) rect(dox + c * S, oy + r * S, S, S)

// ── Write files ───────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, 'assets')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)

const png = makePNG(W, H, canvas)
fs.writeFileSync(path.join(outDir, 'icon.png'), png)
fs.writeFileSync(path.join(outDir, 'icon.ico'), pngToIco(png))

console.log('✓ assets/icon.png  (256×256 RGB)')
console.log('✓ assets/icon.ico  (256×256 Vista+ PNG-ICO)')
