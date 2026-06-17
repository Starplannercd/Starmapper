const Jimp = require('jimp')
const path = require('path')

const INPUT  = path.join(__dirname, 'public/bosses/Fallen protectors room.jpg')
const OUTPUT = path.join(__dirname, 'public/bosses/fallen-protectors-room-clean.jpg')

// Always reads from srcImg (pristine original), writes to dstImg.
// This prevents patches from contaminating each other's source pixels.
function clonePatch(srcImg, dstImg, srcX, srcY, dstX, dstY, w, h, feather = 14) {
  const W = dstImg.getWidth(), H = dstImg.getHeight()
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const sx = Math.min(W-1, Math.max(0, srcX + dx))
      const sy = Math.min(H-1, Math.max(0, srcY + dy))
      const px = dstX + dx, py = dstY + dy
      if (px < 0 || px >= W || py < 0 || py >= H) continue

      let a = 1.0
      if (feather > 0) {
        const t = Math.min(1, Math.min(
          Math.min(dx, w-1-dx),
          Math.min(dy, h-1-dy)
        ) / feather)
        a = t * t * (3 - 2*t)
      }

      const s = Jimp.intToRGBA(srcImg.getPixelColor(sx, sy))
      const d = Jimp.intToRGBA(dstImg.getPixelColor(px, py))
      dstImg.setPixelColor(Jimp.rgbaToInt(
        Math.round(s.r*a + d.r*(1-a)),
        Math.round(s.g*a + d.g*(1-a)),
        Math.round(s.b*a + d.b*(1-a)),
        255
      ), px, py)
    }
  }
}

async function main() {
  const srcImg = await Jimp.read(INPUT)   // never modified — source of truth
  const dstImg = srcImg.clone()           // all patches written here
  console.log('Input:', srcImg.getWidth(), 'x', srcImg.getHeight())

  // ── Coordinate note ───────────────────────────────────────────────────────
  // Output (1024×720) pixel (ox,oy)  →  original = (ox*1.5 + 192,  oy*1.5)
  // All coordinates below are in original 1920×1080 space.

  // ── [A] Bat / bird upper-left stone wall ──────────────────────────────────
  // Measured in original: ~x:310-520, y:8-100
  // Strategy: vertical clone — copy stone-wall texture from directly below the
  // bat (y=200-292, same x), which is the same continuous stone-wall surface.
  // dst covers x:295-525, y:0-102  (src offset: same x, +200 in y)
  clonePatch(srcImg, dstImg,  295, 200,   295,   0,   235, 104,  14)

  // ── [B] Left golem upper pit ──────────────────────────────────────────────
  // Measured in original: ~x:730-810, y:140-228
  // Strategy: vertical clone — copy snow-ring from below the golem (same x, +145y).
  // At y=285+ the snow ring is clean bright white with no creatures.
  // dst covers x:715-815, y:122-235  (src offset: same x, +163 in y)
  clonePatch(srcImg, dstImg,  715, 285,   715, 122,   105, 118,  14)

  // ── [C] Right golem upper pit ─────────────────────────────────────────────
  // Measured in original: ~x:885-1015, y:140-228
  // Same vertical-clone strategy as [B].
  // dst covers x:868-1022, y:122-235  (src offset: same x, +163 in y)
  clonePatch(srcImg, dstImg,  868, 285,   868, 122,   160, 118,  14)

  // ── [D] 3 boss models + name plates ──────────────────────────────────────
  // Measured in original: ~x:362-622, y:230-400
  // Strategy: horizontal clone from clean right-side pit floor.
  // Start dst 30px ABOVE first name plate (y=200) so feather zone is clear.
  // feather=14 → at dy=30, t=30/14>1 → alpha=1 over the entire boss region ✓
  // src=(1065,290) covers x:1065-1379, y:290-519  — empty right pit floor
  clonePatch(srcImg, dstImg, 1065, 290,   345, 200,   315, 220,  14)

  // Second reinforcing pass (slightly inset source to vary texture)
  clonePatch(srcImg, dstImg, 1095, 320,   360, 218,   280, 190,  10)

  // ── [E] Tiny object bottom-right ─────────────────────────────────────────
  // Measured in original: ~x:1278-1350, y:940-988
  // Clone from clean ground 140px to the left at same y.
  clonePatch(srcImg, dstImg, 1120, 940,  1270, 940,    95,  60,  12)

  // ── Crop to 1536×1080 (correct 1024:720 aspect ratio), centred ───────────
  dstImg.crop(192, 0, 1536, 1080)

  // ── Resize to target 1024×720 ─────────────────────────────────────────────
  dstImg.resize(1024, 720, Jimp.RESIZE_BICUBIC)

  // ── Mild sharpening to recover resize softness ────────────────────────────
  const blurred = dstImg.clone().blur(1)
  dstImg.scan(0, 0, 1024, 720, (x, y, idx) => {
    for (let c = 0; c < 3; c++) {
      const o = dstImg.bitmap.data[idx + c]
      const b = blurred.bitmap.data[idx + c]
      dstImg.bitmap.data[idx + c] = Math.min(255, Math.max(0, Math.round(o + (o - b) * 0.5)))
    }
  })

  await dstImg.quality(93).writeAsync(OUTPUT)
  console.log('Saved:', OUTPUT)
}

main().catch(console.error)
