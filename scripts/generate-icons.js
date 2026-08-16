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

;(async function main() {
  try {
    const outDir = './public/icons'
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

    const src = await readSource()

    // the source art already has generous padding around the mark, so the
    // same resize works for both the plain icons and the maskable variants
    // (maskable just needs the important content inside the ~80% safe zone).
    await writePng(resize(src, 192), outDir + '/icon-192.png')
    await writePng(resize(src, 512), outDir + '/icon-512.png')
    await writePng(resize(src, 192), outDir + '/icon-192-maskable.png')
    await writePng(resize(src, 512), outDir + '/icon-512-maskable.png')

    console.log('Icons generated: icon-192.png, icon-512.png, icon-192-maskable.png, icon-512-maskable.png')
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
})()
