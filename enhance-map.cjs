const Jimp = require('jimp')
const path = require('path')

const INPUT  = path.join(__dirname, 'public/bosses/Protectors boss room.jpg')
const OUTPUT = path.join(__dirname, 'public/bosses/protectors-room-clean.jpg')

const CANVAS_W = 820
const CANVAS_H = 580

async function main() {
  const img = await Jimp.read(INPUT)
  const W = img.getWidth(), H = img.getHeight()
  console.log('Input:', W, 'x', H)

  // ── 1. Resize so the full image fits within the canvas height ────────────
  // The image is square; scaling to fit the 580px height keeps everything
  // visible and avoids an aggressive crop.
  img.resize(Jimp.AUTO, CANVAS_H, Jimp.RESIZE_BICUBIC)
  const scaledW = img.getWidth()  // ~580
  console.log('Scaled to:', scaledW, 'x', img.getHeight())

  // ── 2. Place centred on a dark canvas (fills the extra width with near-black)
  const canvas = new Jimp(CANVAS_W, CANVAS_H, 0x111111ff)
  const xOff   = Math.floor((CANVAS_W - scaledW) / 2)
  canvas.composite(img, xOff, 0)
  img.bitmap = canvas.bitmap

  // ── 3. Very light contrast boost — just enough to counter JPEG flatness ──
  img.contrast(0.07)

  // ── 4. Tiny brightness lift ───────────────────────────────────────────────
  img.brightness(0.04)

  // ── 5. Mild unsharp mask (reduce noise, then add back crispness) ─────────
  const blurred  = img.clone().blur(1)
  const strength = 0.75
  img.scan(0, 0, CANVAS_W, CANVAS_H, (x, y, idx) => {
    for (let c = 0; c < 3; c++) {
      const orig  = img.bitmap.data[idx + c]
      const blur  = blurred.bitmap.data[idx + c]
      img.bitmap.data[idx + c] = Math.min(255, Math.max(0, Math.round(orig + (orig - blur) * strength)))
    }
  })

  // ── 7. Save ────────────────────────────────────────────────────────────────
  await img.quality(92).writeAsync(OUTPUT)
  console.log('Saved:', OUTPUT)
}

main().catch(console.error)
