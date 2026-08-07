import fs from 'fs'
import { PNG } from 'pngjs'

function createPng(path, size, color) {
  const png = new PNG({ width: size, height: size })
  const [r, g, b] = color
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }
  const out = fs.createWriteStream(path)
  png.pack().pipe(out)
}

(async function main() {
  try {
    const outDir = './public/icons'
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    // brand color #0F5257 -> rgb(15,82,87)
    createPng(outDir + '/icon-192.png', 192, [15, 82, 87])
    createPng(outDir + '/icon-512.png', 512, [15, 82, 87])
    // maskable variants (same artwork; kept separate file so manifest can reference purpose=maskable)
    createPng(outDir + '/icon-192-maskable.png', 192, [15, 82, 87])
    createPng(outDir + '/icon-512-maskable.png', 512, [15, 82, 87])
    console.log('Icons generated: icon-192.png, icon-512.png')
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
})()
