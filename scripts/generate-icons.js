import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = path.join(__dirname, 'assets/icon-source.png')

function readSource() {
  return new Promise((resolve, reject) => {
    fs.createReadStream(SOURCE)
      .pipe(new PNG())
      .on('parsed', function () {
        resolve(this)
      })
      .on('error', reject)
  })
}

// box-filter downsize: averages every source pixel that falls into each
// destination cell, which avoids the aliasing a nearest-neighbor resize
// would produce when shrinking a 1254px source down to 192/512px icons.
function resize(src, size) {
  const out = new PNG({ width: size, height: size })
  const { width: sw, height: sh, data: sdata } = src

  for (let oy = 0; oy < size; oy++) {
    const sy0 = Math.floor((oy / size) * sh)
    const sy1 = Math.max(sy0 + 1, Math.floor(((oy + 1) / size) * sh))
    for (let ox = 0; ox < size; ox++) {
      const sx0 = Math.floor((ox / size) * sw)
      const sx1 = Math.max(sx0 + 1, Math.floor(((ox + 1) / size) * sw))

      let r = 0, g = 0, b = 0, a = 0, count = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const si = (sw * sy + sx) << 2
          r += sdata[si]
          g += sdata[si + 1]
          b += sdata[si + 2]
          a += sdata[si + 3]
          count++
        }
      }

      const oi = (size * oy + ox) << 2
      out.data[oi] = Math.round(r / count)
      out.data[oi + 1] = Math.round(g / count)
      out.data[oi + 2] = Math.round(b / count)
      out.data[oi + 3] = Math.round(a / count)
    }
  }

  return out
}

function writePng(png, filePath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath)
    png.pack().pipe(out)
    out.on('finish', resolve)
    out.on('error', reject)
  })
}

// the source art is the mark drawn on a rounded-square card with a soft
// shadow. To get round icons we keep only the mark (as an alpha mask taken
// from how dark each pixel is) and redraw it on our own background.
const MARK_BOX = { x0: 350, x1: 900, y0: 335, y1: 880 } // mark bounds + margin, in source px
const MARK_SCALE = 1.15 // the card padding is gone, so the mark can be a bit bigger

function markAlpha(src) {
  const { width, data } = src
  const alpha = new Float32Array(width * src.height)
  for (let y = MARK_BOX.y0; y < MARK_BOX.y1; y++) {
    for (let x = MARK_BOX.x0; x < MARK_BOX.x1; x++) {
      const i = (width * y + x) << 2
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      alpha[width * y + x] = Math.min(1, Math.max(0, (250 - lum) / 230))
    }
  }
  return alpha
}

function sampleBilinear(alpha, w, h, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) return 0
  const fx = x - x0, fy = y - y0
  const a = alpha[w * y0 + x0], b = alpha[w * y0 + x0 + 1]
  const c = alpha[w * (y0 + 1) + x0], d = alpha[w * (y0 + 1) + x0 + 1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

// draws the icon at the source resolution; `round` gives a white circle on
// a transparent background (with a faint ring so it shows on white), and
// otherwise a full white square, which is what maskable icons need — the
// launcher cuts it into its own shape (a circle on most Android phones).
function compose(src, alpha, round) {
  const S = src.width
  const out = new PNG({ width: S, height: S })
  const cx = (MARK_BOX.x0 + MARK_BOX.x1) / 2
  const cy = (MARK_BOX.y0 + MARK_BOX.y1) / 2
  const R = S / 2
  const RING = S * 0.012

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dist = Math.hypot(x + 0.5 - R, y + 0.5 - R)
      let bg = 255, bgAlpha = 255
      if (round) {
        bgAlpha = Math.round(255 * Math.min(1, Math.max(0, R - dist)))
        if (dist > R - RING) bg = 226
      }
      const m = sampleBilinear(alpha, S, src.height, cx + (x - R) / MARK_SCALE, cy + (y - R) / MARK_SCALE)
      const v = Math.round(bg * (1 - m) + 17 * m)
      const i = (S * y + x) << 2
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v
      out.data[i + 3] = bgAlpha
    }
  }
  return out
}

;(async function main() {
  try {
    const outDir = './public/icons'
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

    const src = await readSource()
    const alpha = markAlpha(src)
    const round = compose(src, alpha, true)
    const full = compose(src, alpha, false)

    await writePng(resize(round, 192), outDir + '/icon-192.png')
    await writePng(resize(round, 512), outDir + '/icon-512.png')
    await writePng(resize(full, 192), outDir + '/icon-192-maskable.png')
    await writePng(resize(full, 512), outDir + '/icon-512-maskable.png')
    // iOS ignores transparency and always rounds the corners itself, so it
    // gets the full square version
    await writePng(resize(full, 180), outDir + '/apple-touch-icon.png')

    console.log('Icons generated: icon-192.png, icon-512.png, icon-192-maskable.png, icon-512-maskable.png, apple-touch-icon.png')
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
})()
