const Jimp = require('jimp')
const path = require('path')

const INPUT = path.join(__dirname, 'public/bosses/Protector bosses.png')
const OUT   = (name) => path.join(__dirname, `public/bosses/${name}`)

function colorDist(c1, c2) {
  const a = Jimp.intToRGBA(c1), b = Jimp.intToRGBA(c2)
  return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2)
}

function hasTransparentNeighbour(transparent, x, y, W, H) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x+dx, ny = y+dy
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && transparent[ny*W+nx]) return true
    }
  return false
}

async function removeBg(img, tolerance) {
  const W = img.getWidth(), H = img.getHeight()
  const samples = [
    img.getPixelColor(0, 0),            img.getPixelColor(W-1, 0),
    img.getPixelColor(0, H-1),          img.getPixelColor(W-1, H-1),
    img.getPixelColor(Math.floor(W/2), 0),
    img.getPixelColor(Math.floor(W/2), H-1),
  ]

  // ── Step 1: flood-fill from border ────────────────────────────────────────
  const transparent = new Uint8Array(W * H)
  const queue = []

  function enqueue(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return
    const idx = y * W + x
    if (transparent[idx]) return
    if (samples.some(s => colorDist(img.getPixelColor(x, y), s) < tolerance)) {
      transparent[idx] = 1
      queue.push(x, y)
    }
  }

  for (let x = 0; x < W; x++) { enqueue(x, 0); enqueue(x, H-1) }
  for (let y = 0; y < H; y++) { enqueue(0, y); enqueue(W-1, y) }

  let qi = 0
  while (qi < queue.length) {
    const x = queue[qi++], y = queue[qi++]
    enqueue(x+1, y); enqueue(x-1, y)
    enqueue(x, y+1); enqueue(x, y-1)
  }

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!transparent[y*W+x]) continue
      const bidx = (y*W+x)*4
      img.bitmap.data[bidx] = img.bitmap.data[bidx+1] = img.bitmap.data[bidx+2] = img.bitmap.data[bidx+3] = 0
    }

  // ── Step 1.5: enclosed dark pocket removal ────────────────────────────────
  // Gaps between arm and body can trap small pockets of black background that
  // the border flood-fill can't reach. Find connected near-black clusters that
  // don't touch the image border and remove them.
  {
    const visited = new Uint8Array(W * H)
    let pocketsRemoved = 0
    for (let sy = 0; sy < H; sy++) {
      for (let sx = 0; sx < W; sx++) {
        const sp = sy*W+sx
        if (transparent[sp] || visited[sp]) continue
        const sb = sp*4
        const sr = img.bitmap.data[sb], sg = img.bitmap.data[sb+1], sbl = img.bitmap.data[sb+2]
        const sBright = (sr+sg+sbl)/3
        const sMax = Math.max(sr,sg,sbl), sMin = Math.min(sr,sg,sbl)
        const sSat = sMax > 0 ? (sMax-sMin)/sMax : 0
        // Near-black: dark AND low-saturation
        if (sBright > 40 || sSat > 0.15) continue

        const region = [sp]
        const qx = [sx], qy = [sy]
        visited[sp] = 1
        let qi2 = 0
        let touchesBorder = (sx === 0 || sx === W-1 || sy === 0 || sy === H-1)

        while (qi2 < qx.length) {
          const cx = qx[qi2], cy = qy[qi2]; qi2++
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx+dx, ny = cy+dy
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
            const np = ny*W+nx
            if (visited[np] || transparent[np]) continue
            const nb = np*4
            const nr = img.bitmap.data[nb], ng2 = img.bitmap.data[nb+1], nbl = img.bitmap.data[nb+2]
            const nBright = (nr+ng2+nbl)/3
            const nMax = Math.max(nr,ng2,nbl), nMin = Math.min(nr,ng2,nbl)
            const nSat = nMax > 0 ? (nMax-nMin)/nMax : 0
            if (nBright > 40 || nSat > 0.15) continue
            visited[np] = 1
            region.push(np)
            qx.push(nx); qy.push(ny)
            if (nx === 0 || nx === W-1 || ny === 0 || ny === H-1) touchesBorder = true
          }
        }

        if (!touchesBorder && region.length < 300) {
          for (const rp of region) {
            transparent[rp] = 1
            const rb = rp*4
            img.bitmap.data[rb] = img.bitmap.data[rb+1] = img.bitmap.data[rb+2] = img.bitmap.data[rb+3] = 0
          }
          pocketsRemoved += region.length
        }
      }
    }
    console.log(`  enclosed pockets: ${pocketsRemoved} pixels removed`)
  }

  return img
}

async function main() {
  const base = await Jimp.read(INPUT)
  const W = base.getWidth(), H = base.getHeight()
  console.log('Image size:', W, 'x', H)

  // Erase the decorative diamond watermark in the bottom-right corner
  // by painting it black so the border flood-fill picks it up as background.
  const dmx = Math.floor(W * 0.91), dmy = Math.floor(H * 0.84)
  for (let y = dmy; y < H; y++)
    for (let x = dmx; x < W; x++) {
      const b = (y*W+x)*4
      base.bitmap.data[b] = base.bitmap.data[b+1] = base.bitmap.data[b+2] = 0
    }

  // Full group cutout
  const full = await removeBg(base.clone(), 35)
  full.autocrop({ tolerance: 0.002 })
  await full.writeAsync(OUT('fallen-protectors-cutout.png'))
  console.log('Saved full group cutout')

  // Crop boundaries — will be tuned after first run prints dimensions
  const third = Math.floor(W / 3)
  console.log(`Using third=${third} as initial crop guide`)

  const crops = [
    { x0: 0,           w: Math.floor(W * 0.34), name: 'rook-stonetoe-cutout.png'   },
    { x0: Math.floor(W * 0.37), w: Math.floor(W * 0.29), name: 'he-softfoot-cutout.png'     },
    { x0: Math.floor(W * 0.66), w: W - Math.floor(W * 0.66), name: 'sun-tenderheart-cutout.png' },
  ]

  for (const { x0, w, name } of crops) {
    console.log(`Processing ${name} (x=${x0}, w=${w})…`)
    const crop = base.clone().crop(x0, 0, w, H)
    await removeBg(crop, 35)
    crop.autocrop({ tolerance: 0.002 })
    await crop.writeAsync(OUT(name))
    console.log('Saved', name)
  }
}

main().catch(console.error)
