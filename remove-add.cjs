const Jimp = require('jimp')
const path  = require('path')

const INPUT  = path.join(__dirname, 'public/bosses/48740-converted.png')
const OUTPUT = path.join(__dirname, 'public/bosses/default-add-cutout.png')

function colorDist(c1, c2) {
  const a = Jimp.intToRGBA(c1), b = Jimp.intToRGBA(c2)
  return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2)
}

async function main() {
  const img = await Jimp.read(INPUT)
  const W = img.getWidth(), H = img.getHeight()
  console.log('Image size:', W, 'x', H)

  const samples = [
    img.getPixelColor(0, 0),         img.getPixelColor(W-1, 0),
    img.getPixelColor(0, H-1),       img.getPixelColor(W-1, H-1),
    img.getPixelColor(Math.floor(W/2), 0),
    img.getPixelColor(Math.floor(W/2), H-1),
  ]

  // ── Step 1: flood-fill white background from border ────────────────────────
  const transparent = new Uint8Array(W * H)
  const queue = []

  function enqueue(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return
    const idx = y * W + x
    if (transparent[idx]) return
    if (samples.some(s => colorDist(img.getPixelColor(x, y), s) < 30)) {
      transparent[idx] = 1
      queue.push(x, y)
    }
  }

  for (let x = 0; x < W; x++) { enqueue(x, 0); enqueue(x, H-1) }
  for (let y = 0; y < H; y++) { enqueue(0, y); enqueue(W-1, y) }
  let qi = 0
  while (qi < queue.length) {
    const x = queue[qi++], y = queue[qi++]
    enqueue(x+1, y); enqueue(x-1, y); enqueue(x, y+1); enqueue(x, y-1)
  }

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!transparent[y*W+x]) continue
      const b = (y*W+x)*4
      img.bitmap.data[b] = img.bitmap.data[b+1] = img.bitmap.data[b+2] = img.bitmap.data[b+3] = 0
    }

  // ── Step 2: enclosed white pocket removal ──────────────────────────────────
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
      if (sBright < 210 || sSat > 0.05) continue

      const region = [sp], qx = [sx], qy = [sy]
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
          const nr = img.bitmap.data[nb], ng = img.bitmap.data[nb+1], nbl = img.bitmap.data[nb+2]
          const nBright = (nr+ng+nbl)/3
          const nMax = Math.max(nr,ng,nbl), nMin = Math.min(nr,ng,nbl)
          const nSat = nMax > 0 ? (nMax-nMin)/nMax : 0
          if (nBright < 210 || nSat > 0.05) continue
          visited[np] = 1; region.push(np); qx.push(nx); qy.push(ny)
          if (nx === 0 || nx === W-1 || ny === 0 || ny === H-1) touchesBorder = true
        }
      }

      if (!touchesBorder && region.length < 50) {
        for (const rp of region) {
          transparent[rp] = 1
          const rb = rp*4
          img.bitmap.data[rb] = img.bitmap.data[rb+1] = img.bitmap.data[rb+2] = img.bitmap.data[rb+3] = 0
        }
        pocketsRemoved += region.length
      }
    }
  }
  console.log(`Enclosed pockets: ${pocketsRemoved} pixels removed`)

  // ── Step 3: color-to-alpha defringe (white background) ────────────────────
  // Removes white contamination baked into edge pixels so they don't show as
  // a bright halo on dark backgrounds.
  for (let pass = 0; pass < 6; pass++) {
    let changed = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pidx = y*W+x
        if (transparent[pidx]) continue
        let adj = false
        for (let dy = -1; dy <= 1 && !adj; dy++)
          for (let dx = -1; dx <= 1 && !adj; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x+dx, ny = y+dy
            if (nx >= 0 && nx < W && ny >= 0 && ny < H && transparent[ny*W+nx]) adj = true
          }
        if (!adj) continue

        const bidx = pidx*4
        const r = img.bitmap.data[bidx]/255
        const g = img.bitmap.data[bidx+1]/255
        const b = img.bitmap.data[bidx+2]/255
        const whiteFloor = Math.min(r, g, b)
        if (whiteFloor < 0.12) continue

        const newAlpha = 1 - whiteFloor
        if (newAlpha < 0.2) {
          img.bitmap.data[bidx] = img.bitmap.data[bidx+1] = img.bitmap.data[bidx+2] = img.bitmap.data[bidx+3] = 0
          transparent[pidx] = 1
        } else {
          const inv = 1 / newAlpha
          img.bitmap.data[bidx]   = Math.min(255, Math.round((r - whiteFloor) * inv * 255))
          img.bitmap.data[bidx+1] = Math.min(255, Math.round((g - whiteFloor) * inv * 255))
          img.bitmap.data[bidx+2] = Math.min(255, Math.round((b - whiteFloor) * inv * 255))
          img.bitmap.data[bidx+3] = Math.round(newAlpha * 255)
          if (newAlpha < 0.6) transparent[pidx] = 1
        }
        changed++
      }
    }
    console.log(`Defringe pass ${pass+1}: ${changed} pixels`)
    if (changed === 0) break
  }

  img.autocrop({ tolerance: 0.002 })
  await img.writeAsync(OUTPUT)
  console.log('Saved', OUTPUT)
}

main().catch(console.error)
