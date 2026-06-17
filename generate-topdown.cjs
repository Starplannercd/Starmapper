const Jimp = require('jimp')
const path = require('path')

const W = 820, H = 580
const cx = W / 2, cy = H / 2
// Stretch x so room fills the wide canvas
const STRETCH = 1.15

function lerp(a, b, t) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)))
}

// Organic radius using layered sine waves
function organicR(angle, base, layers) {
  let r = base
  for (const [amp, freq, phase] of layers) r += amp * Math.sin(angle * freq + phase)
  return r
}

// Cheap pixel texture (0–1)
function tex(x, y) {
  return 0.5 + 0.4 * Math.sin(x * 0.17 + y * 0.09 + 1.1) * Math.cos(x * 0.08 - y * 0.14 + 0.6)
}

async function main() {
  const img = new Jimp(W, H)

  // ── Base terrain ──────────────────────────────────────────────────────────
  img.scan(0, 0, W, H, (x, y, idx) => {
    const dx   = (x - cx) / STRETCH
    const dy   = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const ang  = Math.atan2(dy, dx)

    // Pit ~260 radius (fills most of canvas vertically)
    const pitR  = organicR(ang, 260, [[22, 3, 0.7], [14, 7, 1.3], [9, 11, 2.1], [5, 17, 0.9], [3, 23, 1.6]])
    // Snow ring to ~295 (extends past canvas top/bottom — fills corners with snow)
    const snowR = organicR(ang, 298, [[16, 4, 1.1], [10, 8, 2.0], [7, 13, 0.5], [4, 19, 1.7]])
    // Wall to ~335 (fills canvas edge-to-edge horizontally, corners get wall)
    const wallR = organicR(ang, 338, [[11, 5, 0.3], [7,  9, 1.8], [4, 15, 2.5]])

    const t = tex(x, y)
    let r, g, b

    if (dist < pitR) {
      // Corruption pit — near-black with subtle blue-black veining
      const vein = 0.5 + 0.5 * Math.sin(x * 0.055 + y * 0.038 + 0.5)
                             * Math.sin(x * 0.038 - y * 0.065 + 1.2)
      r = lerp(4, 16, t * vein)
      g = lerp(4, 13, t * vein)
      b = lerp(7, 24, t * vein)
    } else if (dist < pitR + 12) {
      // Jagged pit edge → snow
      const f = (dist - pitR) / 12
      r = lerp(10, 215, f)
      g = lerp(10, 210, f)
      b = lerp(14, 198, f)
    } else if (dist < snowR) {
      // Snow / gravel ring — bright
      const s = 0.88 + 0.12 * t
      r = Math.round(lerp(208, 240, t) * s)
      g = Math.round(lerp(205, 235, t) * s)
      b = Math.round(lerp(192, 224, t) * s)
    } else if (dist < snowR + 8) {
      // Snow → wall transition
      const f = (dist - snowR) / 8
      r = lerp(222, 85, f)
      g = lerp(217, 80, f)
      b = lerp(206, 70, f)
    } else if (dist < wallR) {
      // Stone wall — mid-grey
      const s = 0.83 + 0.17 * t
      r = Math.round(lerp(72, 104, t) * s)
      g = Math.round(lerp(68, 98,  t) * s)
      b = Math.round(lerp(60, 86,  t) * s)
    } else {
      // Outer corners — very dark
      const s = 0.82 + 0.18 * t
      r = Math.round(lerp(18, 30, t) * s)
      g = Math.round(lerp(16, 28, t) * s)
      b = Math.round(lerp(14, 24, t) * s)
    }

    img.bitmap.data[idx]     = r
    img.bitmap.data[idx + 1] = g
    img.bitmap.data[idx + 2] = b
    img.bitmap.data[idx + 3] = 255
  })

  // ── Rock painter ──────────────────────────────────────────────────────────
  function paintRock(rx, ry, radiusX, radiusY, rot = 0, lightness = 1) {
    const cos = Math.cos(rot), sin = Math.sin(rot)
    const bx  = Math.max(0, Math.floor(rx - radiusX - 3))
    const ex  = Math.min(W - 1, Math.ceil(rx + radiusX + 3))
    const by  = Math.max(0, Math.floor(ry - radiusY - 3))
    const ey  = Math.min(H - 1, Math.ceil(ry + radiusY + 3))

    for (let px = bx; px <= ex; px++) {
      for (let py = by; py <= ey; py++) {
        const lx = cos * (px - rx) + sin * (py - ry)
        const ly = -sin * (px - rx) + cos * (py - ry)
        const d  = Math.sqrt((lx / radiusX) ** 2 + (ly / radiusY) ** 2)
        if (d >= 1) continue

        const idx  = (py * W + px) * 4
        const edge = 1 - d
        const t    = tex(px, py)
        // Subtle top-left highlight to fake 3D depth
        const hiX  = -radiusX * 0.35, hiY = -radiusY * 0.30
        const hi   = Math.max(0, 1 - Math.sqrt(((lx - hiX) / radiusX) ** 2 + ((ly - hiY) / radiusY) ** 2))
        const base = (50 + 28 * edge) * lightness
        const v    = base + 20 * hi * hi + 9 * t

        img.bitmap.data[idx]     = Math.min(255, Math.round(v))
        img.bitmap.data[idx + 1] = Math.min(255, Math.round(v - 2))
        img.bitmap.data[idx + 2] = Math.min(255, Math.round(v - 7))
        img.bitmap.data[idx + 3] = 255
      }
    }
  }

  // Rocks in pit (spread across enlarged pit radius ~260)
  const pitRocks = [
    // large boulders
    [cx - 185, cy +  20,  34, 21, 0.40],
    [cx + 120, cy -  32,  31, 19, -0.30],
    [cx -  24, cy + 148,  29, 18,  0.60],
    [cx + 215, cy +  80,  28, 17, -0.50],
    [cx - 105, cy - 132,  27, 16,  0.20],
    // medium
    [cx +  68, cy +  98,  20, 13,  0.70],
    [cx - 128, cy + 114,  19, 12, -0.40],
    [cx + 148, cy - 128,  20, 13,  0.10],
    [cx -  14, cy - 120,  18, 11,  0.50],
    [cx + 185, cy -  70,  17, 11, -0.60],
    [cx -  76, cy +  62,  18, 12,  0.30],
    [cx - 170, cy -  64,  16, 10,  0.80],
    [cx +  38, cy - 190,  15, 10,  0.45],
    // small
    [cx +  36, cy - 158,  13,  8,  0.20],
    [cx + 128, cy +  50,  12,  7, -0.30],
    [cx -  70, cy - 182,  13,  8,  0.60],
    [cx +  90, cy + 168,  12,  8,  0.40],
    [cx - 128, cy - 182,  11,  7,  0.10],
    [cx + 222, cy -  14,  12,  7, -0.70],
    [cx - 210, cy -  82,  11,  6,  0.50],
    [cx -  38, cy +  44,  10,  6,  0.30],
    [cx + 158, cy + 130,  11,  7,  0.55],
    [cx - 225, cy +  55,  10,  6, -0.20],
  ]

  // Rocks on snow ring edge
  const edgeRocks = [
    [cx - 292, cy -  38,  26, 16,  0.30],
    [cx + 302, cy +  25,  24, 15, -0.40],
    [cx -  38, cy - 280,  22, 14,  0.50],
    [cx +  62, cy + 285,  23, 14,  0.20],
    [cx + 256, cy - 165,  20, 12, -0.50],
    [cx - 256, cy + 140,  19, 11,  0.60],
    [cx - 165, cy + 268,  18, 11,  0.10],
    [cx + 178, cy - 260,  17, 10, -0.30],
  ]

  for (const [x, y, rx, ry, rot] of pitRocks) paintRock(x, y, rx, ry, rot, 0.90)
  for (const [x, y, rx, ry, rot] of edgeRocks) paintRock(x, y, rx, ry, rot, 1.08)

  // ── Corruption shimmer (faint concentric rings in the pit) ────────────────
  img.scan(0, 0, W, H, (x, y, idx) => {
    const dx   = (x - cx) / STRETCH
    const dy   = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const ang  = Math.atan2(dy, dx)
    const pitR = organicR(ang, 260, [[22, 3, 0.7], [14, 7, 1.3], [9, 11, 2.1], [5, 17, 0.9], [3, 23, 1.6]])

    if (dist >= pitR) return

    const ring = (Math.sin(dist * 0.16 + 0.4) + 1) * 0.5
    const fade = Math.pow(1 - dist / pitR, 0.5)
    const add  = Math.round(ring * fade * 6)

    img.bitmap.data[idx + 2] = Math.min(255, img.bitmap.data[idx + 2] + add)
  })

  const OUT = path.join(__dirname, 'public/bosses/fallen-protectors-topdown.png')
  await img.writeAsync(OUT)
  console.log('Saved:', OUT)
}

main().catch(console.error)
