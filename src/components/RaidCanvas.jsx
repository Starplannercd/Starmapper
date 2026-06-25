import { useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import { Stage, Layer, Image, Circle, Ellipse, Text, Arrow, Group, Wedge, Line, Rect } from 'react-konva'
import { WOW_CLASSES, ROLE_ICONS, ENEMY_TYPES } from '../data/classes'
import { WORLD_MARKERS } from '../data/markers'
import { BOSS_IMAGES } from '../data/bosses'
import { BOSS_CONFIGS } from '../data/bossConfigs'
import { EFFECTS, EFFECT_GROUPS } from '../data/effects'
import { TEXT_HIGHLIGHTS, HIGHLIGHT_COLORS } from '../data/textEffects'
import TextToolbar from './TextToolbar'

const _imgCache = new Map()

// ── Role tag images (sidebar icons, pre-loaded once) ─────────────────────
const ROLE_TAG_IMAGES = {}
;['tank','healer','melee','ranged'].forEach(key => {
  const found = ROLE_ICONS.find(r => r.key === key)
  if (!found) return
  const img = new window.Image()
  img.src = found.icon
  ROLE_TAG_IMAGES[key] = img
})
function useImage(src) {
  const [img, setImg] = useState(() => _imgCache.get(src) ?? null)
  useEffect(() => {
    if (!src) { setImg(null); return }
    if (_imgCache.has(src)) { setImg(_imgCache.get(src)); return }
    let cancelled = false
    const el = new window.Image()
    el.crossOrigin = 'anonymous'
    el.onload  = () => { if (!cancelled) { _imgCache.set(src, el); setImg(el) } }
    el.onerror = () => { if (!cancelled) setImg(null) }
    el.src = src
    return () => { cancelled = true }
  }, [src])
  return img
}

function useRedTintCanvas(iconImg, width, height) {
  const h = height ?? width
  return useMemo(() => {
    if (!iconImg) return null
    const c = document.createElement('canvas')
    c.width  = width
    c.height = h
    const ctx = c.getContext('2d')
    ctx.drawImage(iconImg, 0, 0, width, h)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = 'rgb(220,0,0)'
    ctx.fillRect(0, 0, width, h)
    return c
  }, [iconImg, width, h])
}

// ─── Effect helpers ───────────────────────────────────────────────────────────

function getEffectOffset(effect, t) {
  if (effect === 'bounce') return { x: 0, y: -Math.abs(Math.sin(t * 4.5)) * 8 }
  if (effect === 'shake')  return { x: Math.sin(t * 24) * 4, y: Math.cos(t * 23) * 2 }
  return { x: 0, y: 0 }
}

function EffectBehind({ effect, color, colorOverride, t }) {
  const ov = colorOverride
    ? colorOverride.replace('#', '').match(/.{2}/g).map(h => parseInt(h, 16))
    : null
  const clr = (r, g, b) => ov ? `${ov[0]},${ov[1]},${ov[2]}` : `${r},${g},${b}`

  switch (effect) {
    case 'pulse': {
      const pct = t % 1
      return <Circle radius={22 + pct * 48} fill="transparent"
        stroke={`rgba(${clr(255,140,0)},${1 - pct})`} strokeWidth={2.5} listening={false} />
    }
    case 'glow': {
      const a = 0.18 + 0.14 * Math.sin(t * 2.5)
      return <Circle radius={30} fill={colorOverride ?? color} opacity={a} listening={false} />
    }
    case 'warning': {
      const a = 0.5 + 0.5 * Math.sin(t * 8)
      return <>
        <Circle radius={25} fill={`rgba(${clr(255,30,30)},${a * 0.12})`} listening={false} />
        <Circle radius={25} fill="transparent" stroke={`rgba(${clr(255,30,30)},${a})`} strokeWidth={3} listening={false} />
      </>
    }
    case 'ripple': {
      return [0, 0.33, 0.66].map((off, i) => {
        const pct = (t * 0.75 + off) % 1
        return <Circle key={i} radius={22 + pct * 58} fill="transparent"
          stroke={`rgba(${clr(80,180,255)},${(1 - pct) * 0.7})`} strokeWidth={1.5} listening={false} />
      })
    }
    case 'orbit':
      return <Circle radius={27} fill="transparent"
        stroke={`rgba(${clr(170,136,255)},0.9)`} strokeWidth={2}
        dash={[6, 4]} dashOffset={-t * 30} listening={false} />
    case 'danger': {
      const r = 66 + 5 * Math.sin(t * 2)
      const a = 0.5 + 0.15 * Math.sin(t * 2)
      return <>
        <Circle radius={r} fill={`rgba(${clr(255,20,20)},0.10)`}
          stroke={`rgba(${clr(255,50,50)},${a})`} strokeWidth={2} listening={false} />
        <Circle radius={r - 10} fill="transparent"
          stroke={`rgba(${clr(255,100,100)},${a * 0.5})`} strokeWidth={1}
          dash={[5, 5]} dashOffset={-t * 20} listening={false} />
      </>
    }
    case 'holy': {
      const len = 26 + 8 * Math.sin(t * 3)
      const a = 0.5 + 0.35 * Math.sin(t * 3)
      const startR = 23
      return Array.from({ length: 8 }, (_, i) => {
        const rad = i * 45 * (Math.PI / 180)
        const cx = Math.cos(rad), cy = Math.sin(rad)
        return <Line key={i}
          points={[cx * startR, cy * startR, cx * (startR + len), cy * (startR + len)]}
          stroke={`rgba(${clr(255,220,50)},${a})`} strokeWidth={2.5} lineCap="round" listening={false} />
      })
    }
    case 'freeze':
      return <>
        <Circle radius={27} fill={`rgba(${clr(100,200,255)},0.12)`}
          stroke={`rgba(${clr(160,230,255)},0.85)`} strokeWidth={2.5}
          dash={[5, 4]} dashOffset={-t * 22} listening={false} />
        <Circle radius={20} fill={`rgba(${clr(180,230,255)},0.06)`}
          stroke={`rgba(${clr(200,240,255)},0.40)`} strokeWidth={1} listening={false} />
      </>
    case 'flame': {
      const r1 = 25 + 4 * Math.sin(t * 5.2)
      const r2 = 37 + 6 * Math.sin(t * 4.1 + 1)
      const a1 = 0.55 + 0.3 * Math.sin(t * 5.2)
      const a2 = 0.30 + 0.2 * Math.sin(t * 4.1 + 1)
      return <>
        <Circle radius={r1} fill={`rgba(${clr(255,70,0)},${a1 * 0.25})`}
          stroke={`rgba(${clr(255,110,0)},${a1})`} strokeWidth={2} listening={false} />
        <Circle radius={r2} fill={`rgba(${clr(255,30,0)},${a2 * 0.15})`}
          stroke={`rgba(${clr(255,60,0)},${a2})`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'target': {
      const tsc = 0.88 + 0.12 * Math.sin(t * 4)
      const r  = 22 * tsc
      const gap = r + 5
      const ll  = 11
      const a   = 0.7 + 0.3 * Math.sin(t * 4)
      const col = `rgba(${clr(255,50,50)},${a})`
      return <>
        <Circle radius={r} fill="transparent" stroke={col} strokeWidth={1.5} listening={false} />
        <Line points={[0, -gap, 0, -gap - ll]} stroke={col} strokeWidth={1.5} listening={false} />
        <Line points={[0,  gap, 0,  gap + ll]} stroke={col} strokeWidth={1.5} listening={false} />
        <Line points={[-gap, 0, -gap - ll, 0]} stroke={col} strokeWidth={1.5} listening={false} />
        <Line points={[ gap, 0,  gap + ll, 0]} stroke={col} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'stack': {
      const pull = 8 + 3 * Math.abs(Math.sin(t * 3))
      const dist = 44
      const a    = 0.7 + 0.3 * Math.sin(t * 3)
      const col  = `rgba(${clr(0,220,100)},${a})`
      return [[0,-dist,0,-pull],[0,dist,0,pull],[-dist,0,-pull,0],[dist,0,pull,0]].map(
        ([x1,y1,x2,y2], i) => <Arrow key={i} points={[x1,y1,x2,y2]}
          stroke={col} fill={col} strokeWidth={2} pointerLength={8} pointerWidth={7} listening={false} />
      )
    }
    case 'shock': {
      const a = 0.65 + 0.35 * Math.sin(t * 15)
      const phase = Math.floor(t * 10)
      return Array.from({ length: 6 }, (_, i) => {
        const baseAngle = (i * 60 + phase * 43) * Math.PI / 180
        const zz = (phase % 2 === 0 ? 0.32 : -0.32) * (i % 2 === 0 ? 1 : -1)
        const endR = 34 + (i % 3) * 4
        return <Line key={i}
          points={[
            Math.cos(baseAngle) * 20, Math.sin(baseAngle) * 20,
            Math.cos(baseAngle + zz) * 27, Math.sin(baseAngle + zz) * 27,
            Math.cos(baseAngle) * endR, Math.sin(baseAngle) * endR,
          ]}
          stroke={`rgba(${clr(255,255,80)},${a})`} strokeWidth={1.5} lineCap="round" lineJoin="round" listening={false} />
      })
    }
    case 'void': {
      const r1 = 24 + 5 * Math.sin(t * 1.5)
      const r2 = 40 + 8 * Math.sin(t * 1.2 + 1)
      const a = 0.6 + 0.3 * Math.sin(t * 1.5)
      return <>
        <Circle radius={r1} fill={`rgba(${clr(70,0,110)},0.30)`}
          stroke={`rgba(${clr(140,0,200)},${a})`} strokeWidth={2.5} listening={false} />
        <Circle radius={r2} fill={`rgba(${clr(25,0,55)},0.10)`}
          stroke={`rgba(${clr(85,0,145)},${a * 0.55})`} strokeWidth={1.5}
          dash={[8, 5]} dashOffset={-t * 12} listening={false} />
      </>
    }
    case 'shield': {
      const a = 0.55 + 0.25 * Math.sin(t * 2.2)
      const rx = 28, ry = 11, h = 26, rgb = clr(255,205,35)
      const rr = Math.sqrt(1 - 0.55 * 0.55)
      return <>
        <Ellipse radiusX={rx} radiusY={ry} fill={`rgba(${rgb},0.12)`} listening={false} />
        <Line points={[-rx,0, -rx*0.5,-h*0.85, 0,-h, rx*0.5,-h*0.85, rx,0]}
          tension={0.4} stroke={`rgba(${rgb},${a})`} strokeWidth={2.5}
          fill="transparent" closed={false} listening={false} />
        <Ellipse radiusX={rx} radiusY={ry} fill="transparent"
          stroke={`rgba(${rgb},${a})`} strokeWidth={3} listening={false} />
        <Ellipse radiusX={rx*rr} radiusY={ry*rr*0.45} y={-h*0.55}
          fill="transparent" stroke={`rgba(${rgb},${a*0.3})`} strokeWidth={1} listening={false} />
        <Circle radius={2} y={-h+1} fill={`rgba(${rgb},${a*0.9})`} listening={false} />
      </>
    }
    case 'bubble': {
      const a = 0.55 + 0.22 * Math.sin(t * 1.8)
      const rx = 30, ry = 12, h = 28, rgb = '255,230,120'
      return <>
        <Ellipse radiusX={rx} radiusY={ry} fill="rgba(255,245,200,0.08)" listening={false} />
        <Line points={[-rx,0, -rx*0.5,-h*0.85, 0,-h, rx*0.5,-h*0.85, rx,0]}
          tension={0.4} stroke={`rgba(${rgb},${a})`} strokeWidth={2}
          fill="transparent" closed={false} listening={false} />
        <Ellipse radiusX={rx} radiusY={ry} fill="transparent"
          stroke={`rgba(${rgb},${a})`} strokeWidth={2} listening={false} />
        {[0.38, 0.68].map((f, i) => {
          const rr = Math.sqrt(1 - f * f)
          return <Ellipse key={i} radiusX={rx*rr} radiusY={ry*rr*0.45} y={-h*f}
            fill="transparent" stroke={`rgba(${rgb},${a*(0.32 - i*0.1)})`}
            strokeWidth={0.9} listening={false} />
        })}
        <Circle radius={2} y={-h+1} fill={`rgba(255,255,200,${a*0.9})`} listening={false} />
      </>
    }
    case 'absorb': {
      const r = 29 + 2 * Math.sin(t * 2.5)
      return <Circle radius={r} fill="rgba(80,160,255,0.07)"
        stroke="rgba(100,190,255,0.85)" strokeWidth={2.5}
        dash={[8, 4]} dashOffset={-t * 22} listening={false} />
    }
    case 'curse': {
      const p1 = t % 1, p2 = (t + 0.5) % 1
      return <>
        <Circle radius={22 + p1 * 42} fill="transparent"
          stroke={`rgba(160,0,220,${(1 - p1) * 0.85})`} strokeWidth={2} listening={false} />
        <Circle radius={22 + p2 * 42} fill="transparent"
          stroke={`rgba(200,0,180,${(1 - p2) * 0.55})`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'root': {
      const r = 30 + 3 * Math.sin(t * 1.2)
      const a = 0.7 + 0.2 * Math.sin(t * 1.2)
      return <>
        <Ellipse radiusX={r} radiusY={r * 0.32} fill="rgba(60,30,0,0.18)"
          stroke={`rgba(90,160,40,${a})`} strokeWidth={2.5} listening={false} />
        <Ellipse radiusX={r * 0.55} radiusY={r * 0.18} fill="transparent"
          stroke={`rgba(60,120,20,${a * 0.5})`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'chain': {
      const a = 0.75 + 0.2 * Math.sin(t * 2)
      return <Circle radius={27} fill="transparent"
        stroke={`rgba(200,170,80,${a})`} strokeWidth={3}
        dash={[5, 3]} dashOffset={t * 18} listening={false} />
    }
    case 'bomb': {
      const p = (t * 2) % 1
      return <Circle radius={20 + p * 38} fill="transparent"
        stroke={`rgba(255,60,60,${(1 - p) * 0.75})`} strokeWidth={2.5} listening={false} />
    }
    case 'poison': {
      const r = 27 + 3 * Math.sin(t * 2.5)
      const a = 0.5 + 0.25 * Math.sin(t * 2.5)
      return <>
        <Circle radius={r} fill={`rgba(${clr(15,110,0)},${a * 0.20})`}
          stroke={`rgba(${clr(55,195,0)},${a})`} strokeWidth={2.5}
          dash={[4, 3]} dashOffset={-t * 18} listening={false} />
        <Circle radius={r + 11} fill={`rgba(${clr(0,70,0)},0.05)`}
          stroke={`rgba(${clr(35,160,0)},${a * 0.30})`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'fixate': {
      const a = 0.75 + 0.25 * Math.sin(t * 4)
      const r = 22, gap = r + 6, ll = 10
      const col = `rgba(${clr(255,140,0)},${a})`
      const spin = t * 90
      return <>
        <Circle radius={r} fill="transparent" stroke={col} strokeWidth={2} listening={false} />
        {[0, 90, 180, 270].map((deg, i) => {
          const angle = (deg + spin) * Math.PI / 180
          return <Line key={i}
            points={[Math.cos(angle)*gap, Math.sin(angle)*gap, Math.cos(angle)*(gap+ll), Math.sin(angle)*(gap+ll)]}
            stroke={col} strokeWidth={2.5} lineCap="round" listening={false} />
        })}
      </>
    }
    case 'taunt': {
      const a = 0.75 + 0.25 * Math.abs(Math.sin(t * 3))
      const col = `rgba(${clr(255,60,0)},${a})`
      const dist = 46, pull = 10 + 4 * Math.abs(Math.sin(t * 3))
      return [[0,-dist,0,-pull],[0,dist,0,pull],[-dist,0,-pull,0],[dist,0,pull,0]].map(
        ([x1,y1,x2,y2], i) => <Arrow key={i} points={[x1,y1,x2,y2]}
          stroke={col} fill={col} strokeWidth={2} pointerLength={8} pointerWidth={7} listening={false} />
      )
    }
    case 'soak': {
      const a = 0.7 + 0.3 * Math.sin(t * 2.5)
      const col = `rgba(${clr(0,200,100)},${a})`
      const dist = 44, tip = 8 + 3 * Math.abs(Math.sin(t * 2.5))
      const r = 28 + 4 * Math.sin(t * 2.5)
      return <>
        <Circle radius={r} fill={`rgba(${clr(0,200,100)},0.08)`} stroke={col} strokeWidth={1.5} listening={false} />
        {[0, 90, 180, 270].map((deg, i) => {
          const ang = deg * Math.PI / 180
          return <Arrow key={i} points={[Math.cos(ang)*dist, Math.sin(ang)*dist, Math.cos(ang)*tip, Math.sin(ang)*tip]}
            stroke={col} fill={col} strokeWidth={2} pointerLength={7} pointerWidth={6} listening={false} />
        })}
      </>
    }
    case 'spread': {
      const a = 0.7 + 0.3 * Math.sin(t * 2)
      const col = `rgba(${clr(255,220,50)},${a})`
      const s = 20, e = 42
      return [[0,-s,0,-e],[0,s,0,e],[-s,0,-e,0],[s,0,e,0]].map(
        ([x1,y1,x2,y2], i) => <Arrow key={i} points={[x1,y1,x2,y2]}
          stroke={col} fill={col} strokeWidth={2} pointerLength={7} pointerWidth={6} listening={false} />
      )
    }
    case 'iceblock': {
      // Crystalline polygon — scaled down, no outer glow circle
      const a = 0.72 + 0.18 * Math.sin(t * 1.2)
      const shimmer = 0.55 + 0.30 * Math.sin(t * 2.6)
      const glint = 0.60 + 0.40 * Math.sin(t * 3.8)
      const s = 0.62
      const pts = (arr) => arr.map(v => v * s)
      return <>
        {/* Secondary facet */}
        <Line closed
          points={pts([-6,-46, 20,-32, 22,-6, 12,12, -2,10, -16,-6, -12,-28])}
          fill={`rgba(80,185,255,${a * 0.40})`}
          stroke={`rgba(190,240,255,${a * 0.65})`} strokeWidth={1.5} listening={false} />
        {/* Main crystal body */}
        <Line closed
          points={pts([-20,-46, 2,-52, 22,-40, 26,-18, 20,10, 6,14, -8,14, -22,10, -26,-18, -22,-40])}
          fill={`rgba(95,195,255,${a * 0.62})`}
          stroke={`rgba(215,250,255,${a})`} strokeWidth={2.5} listening={false} />
        {/* Crystal plane lines */}
        <Line points={pts([2,-52, -4,-10])} stroke={`rgba(230,252,255,${shimmer * 0.45})`} strokeWidth={1.4} listening={false} />
        <Line points={pts([22,-40, 6,10])} stroke={`rgba(200,245,255,${shimmer * 0.38})`} strokeWidth={1.2} listening={false} />
        <Line points={pts([-22,-40, -4,10])} stroke={`rgba(200,245,255,${shimmer * 0.32})`} strokeWidth={1} listening={false} />
        <Line points={pts([-20,-18, 20,-18])} stroke={`rgba(220,250,255,${shimmer * 0.30})`} strokeWidth={1} listening={false} />
        {/* Glint highlights */}
        <Circle x={6*s} y={-42*s} radius={2.2} fill={`rgba(255,255,255,${glint * 0.85})`} listening={false} />
        <Circle x={19*s} y={-28*s} radius={1.6} fill={`rgba(255,255,255,${glint * 0.65})`} listening={false} />
        <Circle x={-10*s} y={-22*s} radius={1.4} fill={`rgba(220,248,255,${glint * 0.55})`} listening={false} />
      </>
    }
    case 'divine': {
      // Golden oval shield encasing the character, glowing border + sparkles
      const pulse = Math.sin(t * 1.8)
      const a = 0.78 + 0.17 * pulse
      const rx = 30 + 1.5 * pulse   // width — matches icon width
      const ry = 38 + 2 * pulse     // height — taller to wrap the full character
      return <>
        {/* Outer golden haze */}
        <Ellipse radiusX={rx + 10} radiusY={ry + 10}
          fill={`rgba(255,200,20,${a * 0.07})`} listening={false} />
        {/* Soft secondary glow ring */}
        <Ellipse radiusX={rx + 5} radiusY={ry + 5}
          fill="transparent" stroke={`rgba(255,210,40,${a * 0.35})`} strokeWidth={2} listening={false} />
        {/* Shield fill */}
        <Ellipse radiusX={rx} radiusY={ry}
          fill={`rgba(255,215,40,0.13)`} listening={false} />
        {/* Main glowing border */}
        <Ellipse radiusX={rx} radiusY={ry}
          fill="transparent" stroke={`rgba(255,225,55,${a})`} strokeWidth={3.5} listening={false} />
        {/* Inner sheen ring */}
        <Ellipse radiusX={rx * 0.68} radiusY={ry * 0.68}
          fill="transparent" stroke={`rgba(255,252,160,${a * 0.22})`} strokeWidth={1.2} listening={false} />
        {/* 8 sparkles orbiting the oval edge */}
        {Array.from({ length: 8 }, (_, i) => {
          const angle = (i / 8) * Math.PI * 2 + t * 0.80
          const blink = 0.55 + 0.45 * Math.sin(t * 3.5 + i * 1.3)
          const sz    = 1.8 + (i % 3) * 0.9
          return <Circle key={`o${i}`}
            x={Math.cos(angle) * (rx + 7)} y={Math.sin(angle) * (ry + 7)}
            radius={sz} fill={`rgba(255,255,185,${a * blink})`} listening={false} />
        })}
        {/* 5 floating sparkles drifting at varied distances */}
        {Array.from({ length: 5 }, (_, i) => {
          const angle  = (i / 5) * Math.PI * 2 + t * 0.45 + 0.4
          const spread = 1.0 + 0.22 * (i % 3 - 1)
          const blink  = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.8 + i * 0.9))
          const sz     = 1.2 + (i % 2) * 0.8
          return <Circle key={`f${i}`}
            x={Math.cos(angle) * (rx + 13) * spread} y={Math.sin(angle) * (ry + 13) * spread}
            radius={sz} fill={`rgba(255,240,140,${blink * 0.80})`} listening={false} />
        })}
      </>
    }
    case 'ams': {
      const a = 0.65 + 0.28 * Math.sin(t * 2.5)
      const rx = 31, ry = 12, h = 28, rgb = clr(0,220,120)
      return <>
        <Ellipse radiusX={rx} radiusY={ry} fill={`rgba(${rgb},0.10)`} listening={false} />
        <Line points={[-rx,0, -rx*0.5,-h*0.85, 0,-h, rx*0.5,-h*0.85, rx,0]}
          tension={0.4} stroke={`rgba(${rgb},${a})`} strokeWidth={2.5}
          fill="transparent" closed={false} listening={false} />
        <Ellipse radiusX={rx} radiusY={ry} fill="transparent"
          stroke={`rgba(${rgb},${a})`} strokeWidth={2.5}
          dash={[3,2]} dashOffset={-t*45} listening={false} />
        {[0.42, 0.72].map((f, i) => {
          const rr = Math.sqrt(1 - f * f)
          return <Ellipse key={i} radiusX={rx*rr} radiusY={ry*rr*0.45} y={-h*f}
            fill="transparent" stroke={`rgba(${rgb},${a*0.28})`}
            strokeWidth={0.9} listening={false} />
        })}
        <Circle radius={2.5} y={-h+1} fill={`rgba(${rgb},${a*0.8})`} listening={false} />
      </>
    }
    case 'barrier': {
      const pulse = Math.sin(t * 1.4)
      const a = 0.55 + 0.20 * pulse
      const rx = 82, ry = 33, h = 68, rgb = clr(80,190,255)
      const pct = (t * 0.5) % 1
      return <>
        {/* Interior fill */}
        <Ellipse radiusX={rx} radiusY={ry} fill={`rgba(${rgb},0.06)`} listening={false} />
        {/* Dome arch */}
        <Line points={[-rx,0, -rx*0.5,-h*0.85, 0,-h, rx*0.5,-h*0.85, rx,0]}
          tension={0.4} stroke={`rgba(${rgb},${a*0.9})`} strokeWidth={2.5}
          fill="transparent" closed={false} listening={false} />
        {/* Base ellipse */}
        <Ellipse radiusX={rx} radiusY={ry} fill="transparent"
          stroke={`rgba(${rgb},${a})`} strokeWidth={2.5} listening={false} />
        {/* Inner rotating dashed ring */}
        <Ellipse radiusX={rx-6} radiusY={ry-2} fill="transparent"
          stroke={`rgba(${rgb},${a*0.25})`} strokeWidth={1}
          dash={[6,5]} dashOffset={-t*20} listening={false} />
        {/* Latitude rings */}
        {[0.22, 0.44, 0.65, 0.83].map((f, i) => {
          const rr = Math.sqrt(1 - f * f)
          return <Ellipse key={i} radiusX={rx*rr} radiusY={ry*rr*0.45} y={-h*f}
            fill="transparent"
            stroke={`rgba(${rgb},${a*(0.48 - i*0.09)})`}
            strokeWidth={1 - i*0.05} listening={false} />
        })}
        {/* Apex glow */}
        <Circle radius={3.5 + 1.5 * Math.abs(pulse)} y={-h+2}
          fill={`rgba(${rgb},${a*0.8})`} listening={false} />
        <Circle radius={2} y={-h+2}
          fill={`rgba(255,255,255,${a*0.95})`} listening={false} />
        {/* Energy shimmer — now also ellipse */}
        <Ellipse radiusX={(0.12 + pct*0.88)*rx} radiusY={(0.12 + pct*0.88)*ry}
          fill="transparent"
          stroke={`rgba(${rgb},${(1-pct)*0.30})`}
          strokeWidth={1.5} listening={false} />
      </>
    }
    case 'turtle': {
      const a = 0.65 + 0.20 * Math.sin(t * 1.1)
      const rx = 30, ry = 12, h = 25, rgb = clr(110,180,40)
      return <>
        <Ellipse radiusX={rx} radiusY={ry} fill={`rgba(${rgb},0.15)`} listening={false} />
        <Line points={[-rx,0, -rx*0.5,-h*0.82, 0,-h, rx*0.5,-h*0.82, rx,0]}
          tension={0.4} stroke={`rgba(${rgb},${a})`} strokeWidth={2.5}
          fill="transparent" closed={false} listening={false} />
        <Ellipse radiusX={rx} radiusY={ry} fill="transparent"
          stroke={`rgba(${rgb},${a})`} strokeWidth={2.5} listening={false} />
        {[0.40, 0.72].map((f, i) => {
          const rr = Math.sqrt(1 - f * f)
          return <Ellipse key={i} radiusX={rx*rr} radiusY={ry*rr*0.45} y={-h*f}
            fill="transparent" stroke={`rgba(${rgb},${a*0.35})`}
            strokeWidth={1} listening={false} />
        })}
        <Circle radius={2} y={-h+1} fill={`rgba(${rgb},${a*0.8})`} listening={false} />
      </>
    }
    case 'cloak': {
      // Deep darkness — character appears hidden in shadow
      const a = 0.80 + 0.15 * Math.sin(t * 1.4)
      return <>
        {/* Outer shadow haze */}
        <Circle radius={28} fill={`rgba(3,0,10,${a * 0.42})`} listening={false} />
        <Circle radius={28} fill="transparent" stroke={`rgba(65,0,105,${a * 0.42})`} strokeWidth={1.5} listening={false} />
        {/* Core darkness fill */}
        <Circle radius={21} fill={`rgba(6,0,14,${a * 0.90})`} listening={false} />
        <Circle radius={21} fill="transparent" stroke={`rgba(32,0,55,${a * 0.95})`} strokeWidth={3} listening={false} />
        {/* Slowly expanding shadow wisps */}
        {[0, 0.34, 0.67].map((off, i) => {
          const pct = (t * 0.55 + off) % 1
          return <Circle key={i} radius={21 + pct * 12} fill="transparent"
            stroke={`rgba(22,0,40,${(1 - pct) * 0.52})`} strokeWidth={2.5} listening={false} />
        })}
        {/* Subtle ground shadow at feet */}
        <Ellipse radiusX={16} radiusY={4} y={20}
          fill={`rgba(15,25,140,${a * 0.36})`} listening={false} />
      </>
    }
    case 'fade': {
      const pct = (t * 0.55) % 1
      const a = 0.55 + 0.25 * Math.sin(t * 2)
      return <>
        <Circle radius={22 + pct * 40} fill="transparent"
          stroke={`rgba(${clr(210,215,255)},${(1 - pct) * 0.75})`} strokeWidth={1.5} listening={false} />
        <Circle radius={21} fill={`rgba(${clr(190,195,255)},${a * 0.10})`}
          stroke={`rgba(${clr(170,175,255)},${a * 0.45})`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'redflash':
      return null
    case 'enrage': {
      const a1 = 0.65 + 0.35 * Math.sin(t * 9)
      const a2 = 0.50 + 0.35 * Math.sin(t * 8 + 1.2)
      const r1 = 22 + 3 * Math.sin(t * 7)
      const r2 = 34 + 5 * Math.sin(t * 6.5 + 0.8)
      return <>
        <Circle radius={r1} fill={`rgba(255,80,0,${a1 * 0.22})`}
          stroke={`rgba(255,100,0,${a1})`} strokeWidth={2.5}
          dash={[5, 3]} dashOffset={-t * 60} listening={false} />
        <Circle radius={r2} fill={`rgba(255,30,0,${a2 * 0.10})`}
          stroke={`rgba(255,60,0,${a2})`} strokeWidth={1.5}
          dash={[4, 3]} dashOffset={t * 45} listening={false} />
      </>
    }
    case 'cast': {
      const wave = Math.sin(t * 2.5)
      const r1 = 26 + 5 * wave
      const a1 = 0.55 + 0.30 * wave
      const a2 = 0.35 + 0.20 * Math.sin(t * 2.5 + 0.8)
      return <>
        <Circle radius={r1} fill={`rgba(255,200,0,${a1 * 0.15})`}
          stroke={`rgba(255,210,30,${a1})`} strokeWidth={2.5} listening={false} />
        <Circle radius={r1 + 12} fill="rgba(255,180,0,0.03)"
          stroke={`rgba(255,180,0,${a2 * 0.45})`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'interrupt': {
      const a = 0.7 + 0.3 * Math.sin(t * 3)
      const r = 20
      return <>
        <Circle radius={r} fill="rgba(200,0,0,0.10)"
          stroke={`rgba(255,40,40,${a})`} strokeWidth={3} listening={false} />
        <Line points={[-r * 0.7, r * 0.7, r * 0.7, -r * 0.7]}
          stroke={`rgba(255,40,40,${a})`} strokeWidth={3} lineCap="round" listening={false} />
      </>
    }
    case 'pool': {
      return <>
        <Circle radius={68} fill={`rgba(${clr(30,130,255)},0.72)`} listening={false} />
        <Circle radius={68} fill="transparent"
          stroke={`rgba(${clr(80,190,255)},0.90)`} strokeWidth={2.5} listening={false} />
        {[0, 0.42, 0.78].map((off, i) => {
          const pct = (t * 0.35 + off) % 1
          return <Circle key={i} radius={12 + pct * 52} fill="transparent"
            stroke={`rgba(${clr(160,220,255)},${(1 - pct) * 0.90})`} strokeWidth={1.5} listening={false} />
        })}
      </>
    }
    case 'dome': {
      const pulse = Math.sin(t * 1.2)
      const a = 0.52 + 0.18 * pulse
      const rx = 80, ry = 32, h = 66
      const rgb = clr(255, 210, 40)
      const pct = (t * 0.45) % 1
      return <>
        <Ellipse radiusX={rx} radiusY={ry} fill={`rgba(${rgb},0.07)`} listening={false} />
        <Line points={[-rx,0, -rx*0.5,-h*0.85, 0,-h, rx*0.5,-h*0.85, rx,0]}
          tension={0.4} stroke={`rgba(${rgb},${a*0.9})`} strokeWidth={2.5}
          fill="transparent" closed={false} listening={false} />
        <Ellipse radiusX={rx} radiusY={ry} fill="transparent"
          stroke={`rgba(${rgb},${a})`} strokeWidth={2.5} listening={false} />
        {[0.24, 0.48, 0.70, 0.87].map((f, i) => {
          const rr = Math.sqrt(1 - f * f)
          return <Ellipse key={i} radiusX={rx*rr} radiusY={ry*rr*0.45} y={-h*f}
            fill="transparent"
            stroke={`rgba(${rgb},${a*(0.45 - i*0.08)})`}
            strokeWidth={1 - i*0.05} listening={false} />
        })}
        <Circle radius={3 + 1.5*Math.abs(pulse)} y={-h+2}
          fill={`rgba(${rgb},${a*0.8})`} listening={false} />
        <Circle radius={1.8} y={-h+2}
          fill={`rgba(255,255,255,${a*0.9})`} listening={false} />
        <Ellipse radiusX={(0.1+pct*0.9)*rx} radiusY={(0.1+pct*0.9)*ry}
          fill="transparent" stroke={`rgba(${rgb},${(1-pct)*0.28})`}
          strokeWidth={1.5} listening={false} />
      </>
    }
    case 'arcane': {
      const a1 = 0.65 + 0.30 * Math.sin(t * 2.2)
      const a2 = 0.45 + 0.25 * Math.sin(t * 1.6 + 1)
      return <>
        <Circle radius={13 + 2 * Math.sin(t * 3)} fill={`rgba(${clr(90,40,200)},${a1 * 0.25})`}
          stroke={`rgba(${clr(160,100,255)},${a1 * 0.7})`} strokeWidth={1.5} listening={false} />
        <Circle radius={22} fill="transparent"
          stroke={`rgba(${clr(120,60,255)},${a1})`} strokeWidth={2}
          dash={[5, 3]} dashOffset={-t * 38} listening={false} />
        <Circle radius={33} fill={`rgba(${clr(70,30,180)},0.06)`}
          stroke={`rgba(${clr(150,90,255)},${a2})`} strokeWidth={1.5}
          dash={[4, 5]} dashOffset={t * 26} listening={false} />
        {Array.from({ length: 7 }, (_, i) => {
          const angle = (i / 7 * Math.PI * 2) + t * 1.9
          const dist  = 27 + 5 * Math.sin(t * 2.2 + i * 0.9)
          const blink = 0.5 + 0.5 * Math.sin(t * 3.2 + i * 1.1)
          return <Circle key={i} x={Math.cos(angle)*dist} y={Math.sin(angle)*dist}
            radius={2} fill={`rgba(${clr(200,160,255)},${blink * 0.9})`}
            shadowColor={`rgba(${clr(180,100,255)},0.9)`} shadowBlur={5} listening={false} />
        })}
      </>
    }
    case 'nature': {
      const a = 0.65 + 0.25 * Math.sin(t * 1.6)
      const r = 27 + 3 * Math.sin(t * 1.6)
      return <>
        <Ellipse radiusX={r} radiusY={r * 0.34} fill={`rgba(${clr(30,90,10)},0.20)`}
          stroke={`rgba(${clr(80,170,40)},${a * 0.75})`} strokeWidth={2} listening={false} />
        <Circle radius={r} fill={`rgba(${clr(35,110,10)},0.08)`}
          stroke={`rgba(${clr(100,200,50)},${a})`} strokeWidth={2}
          dash={[5, 3]} dashOffset={-t * 14} listening={false} />
        <Circle radius={r + 14} fill="transparent"
          stroke={`rgba(${clr(60,155,20)},${a * 0.32})`} strokeWidth={1.5} listening={false} />
        {Array.from({ length: 5 }, (_, i) => {
          const angle = (i / 5 * Math.PI * 2) + t * 0.65
          const dist  = 21 + 5 * Math.sin(t + i)
          const a2    = 0.5 + 0.4 * Math.sin(t * 1.5 + i * 0.8)
          return <Ellipse key={i}
            x={Math.cos(angle)*dist} y={Math.sin(angle)*dist}
            radiusX={4} radiusY={8}
            fill={`rgba(${clr(80,200,40)},${a2 * 0.7})`}
            rotation={angle * 180 / Math.PI + 90}
            listening={false} />
        })}
      </>
    }
    case 'necrotic': {
      const a = 0.70 + 0.25 * Math.sin(t * 1.9)
      return <>
        <Circle radius={21} fill={`rgba(${clr(15,35,8)},${a * 0.55})`}
          stroke={`rgba(${clr(55,115,25)},${a})`} strokeWidth={2}
          dash={[4, 3]} dashOffset={-t * 18} listening={false} />
        <Circle radius={34} fill="transparent"
          stroke={`rgba(${clr(35,75,15)},${a * 0.52})`} strokeWidth={1.5}
          dash={[3, 4]} dashOffset={t * 13} listening={false} />
        {[0, 0.34, 0.67].map((off, i) => {
          const pct   = (t * 0.45 + off) % 1
          const angle = (i / 3 * Math.PI * 2) + t * 0.55
          const dist  = 14 + pct * 23
          return <Circle key={i}
            x={Math.cos(angle)*dist} y={Math.sin(angle)*dist}
            radius={2.5 - pct * 1.2}
            fill={`rgba(${clr(80,155,30)},${(1-pct) * 0.85})`} listening={false} />
        })}
      </>
    }
    case 'combustion': {
      const r1 = 21 + 5 * Math.sin(t * 6.2)
      const r2 = 32 + 7 * Math.sin(t * 5.1 + 1.1)
      const r3 = 44 + 6 * Math.sin(t * 4.3 + 2.2)
      const a1 = 0.80 + 0.20 * Math.sin(t * 6.2)
      const a2 = 0.55 + 0.32 * Math.sin(t * 5.1)
      const a3 = 0.35 + 0.25 * Math.sin(t * 4.3)
      return <>
        <Circle radius={r1} fill={`rgba(${clr(255,230,0)},${a1 * 0.32})`}
          stroke={`rgba(${clr(255,245,0)},${a1})`} strokeWidth={3} listening={false} />
        <Circle radius={r2} fill={`rgba(${clr(255,100,0)},${a2 * 0.18})`}
          stroke={`rgba(${clr(255,135,0)},${a2})`} strokeWidth={2} listening={false} />
        <Circle radius={r3} fill={`rgba(${clr(255,35,0)},${a3 * 0.10})`}
          stroke={`rgba(${clr(255,55,0)},${a3})`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'cyclone': {
      const a = 0.60 + 0.30 * Math.sin(t * 2.2)
      return <>
        <Ellipse radiusX={29} radiusY={12} fill={`rgba(${clr(90,160,215)},0.14)`}
          stroke={`rgba(${clr(140,200,255)},${a * 0.55})`} strokeWidth={1.5} listening={false} />
        {Array.from({ length: 6 }, (_, i) => {
          const angle = (i / 6 * Math.PI * 2) + t * 4.8
          const r1 = 11, r2 = 32 + (i % 3) * 4
          const a2  = 0.35 + 0.45 * Math.sin(t * 4.5 + i * 0.9)
          return <Line key={i}
            points={[Math.cos(angle)*r1, Math.sin(angle)*r1*0.5,
                     Math.cos(angle)*r2, Math.sin(angle)*r2*0.38]}
            stroke={`rgba(${clr(170,225,255)},${a2})`} strokeWidth={2} lineCap="round" listening={false} />
        })}
        <Circle radius={35} fill="transparent"
          stroke={`rgba(${clr(130,195,255)},${a * 0.45})`} strokeWidth={1.5}
          dash={[7, 4]} dashOffset={-t * 65} listening={false} />
      </>
    }
    case 'banish': {
      const pulse = Math.sin(t * 2)
      const a     = 0.75 + 0.20 * pulse
      return <>
        <Circle radius={17 + 2 * pulse} fill={`rgba(${clr(55,0,95)},${a * 0.48})`}
          stroke={`rgba(${clr(140,0,210)},${a})`} strokeWidth={2.5} listening={false} />
        <Circle radius={31 + 3 * pulse} fill={`rgba(${clr(25,0,45)},0.10)`}
          stroke={`rgba(${clr(95,0,155)},${a * 0.60})`} strokeWidth={1.5}
          dash={[8, 5]} dashOffset={-t * 22} listening={false} />
        {Array.from({ length: 8 }, (_, i) => {
          const angle  = (i / 8 * Math.PI * 2) + t * 0.35
          const inner  = 12, outer = 25 + (i % 3) * 2
          const a2     = 0.35 + 0.55 * Math.sin(t * 2.8 + i)
          return <Line key={i}
            points={[Math.cos(angle)*inner, Math.sin(angle)*inner,
                     Math.cos(angle)*outer, Math.sin(angle)*outer]}
            stroke={`rgba(${clr(155,0,235)},${a2 * 0.72})`} strokeWidth={1.5} lineCap="round" listening={false} />
        })}
      </>
    }
    case 'disease': {
      const r = 25 + 3 * Math.sin(t * 1.9)
      const a = 0.55 + 0.30 * Math.sin(t * 1.9)
      return <>
        <Circle radius={r} fill={`rgba(${clr(95,125,0)},${a * 0.22})`}
          stroke={`rgba(${clr(135,175,0)},${a})`} strokeWidth={2.5}
          dash={[4, 3]} dashOffset={-t * 14} listening={false} />
        <Circle radius={r + 15} fill="transparent"
          stroke={`rgba(${clr(75,105,0)},${a * 0.30})`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'wound': {
      const a  = 0.78 + 0.20 * Math.sin(t * 3.2)
      const r1 = 21 + 3 * Math.sin(t * 3.2)
      return <>
        <Circle radius={r1} fill={`rgba(${clr(115,0,0)},${a * 0.28})`}
          stroke={`rgba(${clr(200,0,20)},${a})`} strokeWidth={3} listening={false} />
        <Circle radius={r1 + 13} fill="transparent"
          stroke={`rgba(${clr(155,0,10)},${a * 0.42})`} strokeWidth={1.5}
          dash={[4, 4]} dashOffset={-t * 32} listening={false} />
      </>
    }
    case 'burn': {
      const r1 = 19 + 3.5 * Math.sin(t * 5.5)
      const r2 = 30 + 5.5 * Math.sin(t * 4.4 + 1)
      const a1 = 0.65 + 0.30 * Math.sin(t * 5.5)
      const a2 = 0.38 + 0.25 * Math.sin(t * 4.4)
      return <>
        <Circle radius={r1} fill={`rgba(${clr(255,80,0)},${a1 * 0.28})`}
          stroke={`rgba(${clr(255,125,0)},${a1})`} strokeWidth={2.5} listening={false} />
        <Circle radius={r2} fill={`rgba(${clr(255,40,0)},${a2 * 0.12})`}
          stroke={`rgba(${clr(255,65,0)},${a2})`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'evasion': {
      const sp = t * 4.5
      return <>
        {[0, 0.22, 0.44, 0.66].map((off, i) => {
          const pct = (sp * 0.5 + off) % 1
          return <Circle key={i} radius={17 + pct * 22} fill="transparent"
            stroke={`rgba(${clr(195,208,218)},${(1 - pct) * 0.62})`}
            strokeWidth={1.5 - pct * 0.5} listening={false} />
        })}
        <Circle radius={19} fill={`rgba(${clr(175,188,198)},0.07)`}
          stroke={`rgba(${clr(218,228,238)},0.52)`} strokeWidth={2}
          dash={[8, 4]} dashOffset={-t * 85} listening={false} />
      </>
    }
    case 'metamorphosis': {
      const a     = 0.70 + 0.25 * Math.sin(t * 2.1)
      const pulse = Math.sin(t * 2.1)
      return <>
        <Circle radius={27 + 3 * pulse} fill={`rgba(${clr(0,195,75)},${a * 0.15})`}
          stroke={`rgba(${clr(0,220,95)},${a})`} strokeWidth={2.5} listening={false} />
        {[-1, 1].map((side, si) => {
          const a2 = 0.48 + 0.42 * Math.sin(t * 2.1 + si)
          return <Line key={si}
            points={[0, -6, side*18, -24, side*46, -18, side*52, -3]}
            tension={0.5} stroke={`rgba(${clr(0,232,80)},${a2})`} strokeWidth={3} lineCap="round"
            fill="transparent" listening={false} />
        })}
        <Circle radius={44 + 4 * pulse} fill="transparent"
          stroke={`rgba(${clr(0,175,55)},${a * 0.32})`} strokeWidth={1.5}
          dash={[6, 5]} dashOffset={-t * 22} listening={false} />
      </>
    }
    case 'levitate': {
      const a = 0.45 + 0.25 * Math.sin(t * 1.3)
      const r = 25 + 4 * Math.sin(t * 1.3)
      return <>
        <Circle radius={r} fill={`rgba(${clr(215,225,255)},${a * 0.15})`}
          stroke={`rgba(${clr(198,208,255)},${a})`} strokeWidth={1.5} listening={false} />
        {[0, 0.5].map((off, i) => {
          const pct = (t * 0.5 + off) % 1
          return <Circle key={i} radius={16 + pct * 22} fill="transparent"
            stroke={`rgba(${clr(218,225,255)},${(1-pct) * 0.52})`}
            strokeWidth={1} listening={false} />
        })}
      </>
    }
    case 'spiritshift': {
      const drift = t * 0.7
      const a     = 0.38 + 0.30 * Math.sin(t * 1.4)
      return <>
        {[0, 0.45].map((off, i) => {
          const pct = (drift + off) % 1
          const yOff = -pct * 28
          return <Circle key={i} radius={14 - pct * 4} fill="transparent"
            stroke={`rgba(${clr(190,210,255)},${(1 - pct) * 0.55})`}
            strokeWidth={1.5} y={yOff} listening={false} />
        })}
        <Circle radius={20} fill={`rgba(${clr(160,185,255)},${a * 0.10})`}
          stroke={`rgba(${clr(175,200,255)},${a * 0.6})`} strokeWidth={1.5}
          dash={[5, 4]} dashOffset={-t * 18} listening={false} />
      </>
    }
    case 'kill': {
      const a  = 0.72 + 0.25 * Math.sin(t * 3.5)
      const r1 = 24 + 4 * Math.sin(t * 3.5)
      return <>
        <Circle radius={r1} fill={`rgba(${clr(180,0,0)},${a * 0.18})`}
          stroke={`rgba(${clr(230,0,0)},${a})`} strokeWidth={3} listening={false} />
        <Circle radius={r1 + 11} fill="transparent"
          stroke={`rgba(${clr(160,0,0)},${a * 0.45})`} strokeWidth={1.5}
          dash={[5, 4]} dashOffset={-t * 28} listening={false} />
      </>
    }
    case 'move': {
      const a   = 0.72 + 0.28 * Math.abs(Math.sin(t * 4))
      const col = `rgba(${clr(255,210,0)},${a})`
      const near = 24 + 6 * Math.abs(Math.sin(t * 4))
      const far  = 44 + 6 * Math.abs(Math.sin(t * 4))
      return [0, 90, 180, 270].map((deg, i) => {
        const ang = (deg + t * 18) * Math.PI / 180
        return <Arrow key={i}
          points={[Math.cos(ang)*near, Math.sin(ang)*near,
                   Math.cos(ang)*far,  Math.sin(ang)*far]}
          stroke={col} fill={col} strokeWidth={2.5}
          pointerLength={9} pointerWidth={8} listening={false} />
      })
    }
    case 'immunetarget': {
      const a  = 0.65 + 0.30 * Math.sin(t * 2.5)
      const r  = 24 + 2 * Math.sin(t * 2.5)
      const col = `rgba(${clr(220,40,40)},${a})`
      return <>
        <Circle radius={r} fill={`rgba(${clr(180,0,0)},0.10)`}
          stroke={col} strokeWidth={2.5} listening={false} />
        <Line points={[-r*0.65, -r*0.65, r*0.65,  r*0.65]}
          stroke={col} strokeWidth={3} lineCap="round" listening={false} />
        <Line points={[ r*0.65, -r*0.65, -r*0.65, r*0.65]}
          stroke={col} strokeWidth={3} lineCap="round" listening={false} />
      </>
    }
    case 'phase': {
      const a = 0.85 + 0.15 * Math.sin(t * 2.2)
      return <>
        {[0, 0.30, 0.60].map((off, i) => {
          const pct = (t * 0.45 + off) % 1
          const r   = 28 + pct * 115
          return <Circle key={i} radius={r} fill="transparent"
            stroke={`rgba(${clr(255,238,155)},${(1 - pct) * 0.88})`}
            strokeWidth={2.5 - pct * 1.5} listening={false} />
        })}
        <Circle radius={30 + 5 * Math.sin(t * 3.2)} fill={`rgba(${clr(255,228,100)},${a * 0.14})`}
          stroke={`rgba(${clr(255,240,130)},${a})`} strokeWidth={3} listening={false} />
        {Array.from({ length: 8 }, (_, i) => {
          const angle = (i / 8 * Math.PI * 2) + t * 1.2
          const blink = 0.5 + 0.5 * Math.sin(t * 4 + i)
          return <Circle key={i}
            x={Math.cos(angle)*38} y={Math.sin(angle)*38}
            radius={2.2} fill={`rgba(${clr(255,250,180)},${blink * a})`}
            shadowColor={`rgba(${clr(255,240,100)},0.9)`} shadowBlur={5} listening={false} />
        })}
      </>
    }
    case 'shield_boss': {
      const pulse = Math.sin(t * 1.8)
      const a     = 0.55 + 0.22 * pulse
      const rx = 36, ry = 14, h = 32
      const rgb = clr(80, 190, 255)
      return <>
        <Ellipse radiusX={rx} radiusY={ry} fill={`rgba(${rgb},0.08)`} listening={false} />
        <Line points={[-rx,0, -rx*0.5,-h*0.85, 0,-h, rx*0.5,-h*0.85, rx,0]}
          tension={0.4} stroke={`rgba(${rgb},${a})`} strokeWidth={2.5}
          fill="transparent" closed={false} listening={false} />
        <Ellipse radiusX={rx} radiusY={ry} fill="transparent"
          stroke={`rgba(${rgb},${a})`} strokeWidth={2.5} listening={false} />
        {[0.33, 0.66].map((f, i) => {
          const rr = Math.sqrt(1 - f * f)
          return <Ellipse key={i} radiusX={rx*rr} radiusY={ry*rr*0.45} y={-h*f}
            fill="transparent" stroke={`rgba(${rgb},${a*0.30})`}
            strokeWidth={0.9} listening={false} />
        })}
        <Circle radius={2.5 + 1*Math.abs(pulse)} y={-h+1}
          fill={`rgba(${rgb},${a*0.8})`} listening={false} />
        <Circle radius={1.4} y={-h+1}
          fill={`rgba(255,255,255,${a*0.9})`} listening={false} />
      </>
    }
    case 'berserk': {
      const r1 = 24 + 6 * Math.sin(t * 9.5)
      const r2 = 38 + 8 * Math.sin(t * 8.2 + 1.3)
      const r3 = 54 + 6 * Math.sin(t * 7.1 + 2.5)
      const a1 = 0.85 + 0.15 * Math.sin(t * 9.5)
      const a2 = 0.65 + 0.30 * Math.sin(t * 8.2)
      const a3 = 0.42 + 0.28 * Math.sin(t * 7.1)
      return <>
        <Circle radius={r1} fill={`rgba(${clr(255,0,0)},${a1 * 0.28})`}
          stroke={`rgba(${clr(255,30,0)},${a1})`} strokeWidth={3}
          dash={[5, 3]} dashOffset={-t * 80} listening={false} />
        <Circle radius={r2} fill={`rgba(${clr(255,0,0)},${a2 * 0.14})`}
          stroke={`rgba(${clr(255,60,0)},${a2})`} strokeWidth={2}
          dash={[4, 3]} dashOffset={t * 60} listening={false} />
        <Circle radius={r3} fill={`rgba(${clr(200,0,0)},${a3 * 0.07})`}
          stroke={`rgba(${clr(255,20,0)},${a3})`} strokeWidth={1.5}
          dash={[6, 4]} dashOffset={-t * 50} listening={false} />
      </>
    }
    case 'fire_ground': {
      const r  = 60 + 4 * Math.sin(t * 2.8)
      const a  = 0.72 + 0.22 * Math.sin(t * 2.8)
      return <>
        <Circle radius={r} fill={`rgba(${clr(255,55,0)},0.60)`} listening={false} />
        <Circle radius={r} fill="transparent"
          stroke={`rgba(${clr(255,130,0)},${a})`} strokeWidth={3} listening={false} />
        {[0, 0.36, 0.70].map((off, i) => {
          const pct = (t * 0.55 + off) % 1
          return <Circle key={i} radius={10 + pct * 48} fill="transparent"
            stroke={`rgba(${clr(255,185,0)},${(1-pct) * 0.75})`} strokeWidth={1.5} listening={false} />
        })}
      </>
    }
    case 'void_ground': {
      const r = 68 + 5 * Math.sin(t * 1.3)
      const a = 0.82 + 0.14 * Math.sin(t * 1.3)
      return <>
        <Circle radius={r} fill={`rgba(${clr(18,0,38)},0.80)`} listening={false} />
        <Circle radius={r} fill="transparent"
          stroke={`rgba(${clr(100,0,158)},${a})`} strokeWidth={2.5} listening={false} />
        {[0, 0.44, 0.78].map((off, i) => {
          const pct = (t * 0.42 + off) % 1
          return <Circle key={i} radius={14 + pct * 54} fill="transparent"
            stroke={`rgba(${clr(75,0,125)},${(1-pct) * 0.62})`} strokeWidth={1.5} listening={false} />
        })}
      </>
    }
    case 'earthquake': {
      const shake = Math.sin(t * 13) * 1.8
      return <>
        {[0, 0.32, 0.64].map((off, i) => {
          const pct = (t * 0.85 + off) % 1
          return <Ellipse key={i}
            x={shake * (i % 2 === 0 ? 1 : -1)}
            radiusX={18 + pct * 75} radiusY={(18 + pct * 75) * 0.32}
            fill="transparent"
            stroke={`rgba(${clr(185,145,80)},${(1-pct) * 0.82})`}
            strokeWidth={2} listening={false} />
        })}
        <Ellipse radiusX={26 + 3 * Math.sin(t * 9)} radiusY={9}
          fill={`rgba(${clr(115,85,38)},0.22)`}
          stroke={`rgba(${clr(200,160,80)},0.72)`}
          strokeWidth={2.5} listening={false} />
      </>
    }
    case 'frost_ground': {
      const r  = 64 + 4 * Math.sin(t * 1.1)
      const a  = 0.65 + 0.22 * Math.sin(t * 1.1)
      return <>
        <Circle radius={r} fill={`rgba(${clr(80,180,240)},0.38)`} listening={false} />
        <Circle radius={r} fill="transparent"
          stroke={`rgba(${clr(160,225,255)},${a})`} strokeWidth={2.5} listening={false} />
        {[0, 0.4, 0.75].map((off, i) => {
          const pct = (t * 0.38 + off) % 1
          return <Circle key={i} radius={12 + pct * 50} fill="transparent"
            stroke={`rgba(${clr(200,240,255)},${(1-pct) * 0.60})`} strokeWidth={1.5} listening={false} />
        })}
        <Circle radius={r * 0.45} fill="transparent"
          stroke={`rgba(${clr(220,248,255)},${a * 0.30})`} strokeWidth={1}
          dash={[6, 4]} dashOffset={-t * 14} listening={false} />
      </>
    }
    case 'poison_ground': {
      const r = 60 + 4 * Math.sin(t * 1.6)
      const a = 0.65 + 0.20 * Math.sin(t * 1.6)
      return <>
        <Circle radius={r} fill={`rgba(${clr(15,100,15)},0.58)`} listening={false} />
        <Circle radius={r} fill="transparent"
          stroke={`rgba(${clr(80,220,40)},${a})`} strokeWidth={2.5} listening={false} />
        {[0, 0.35, 0.65].map((off, i) => {
          const pct = (t * 0.55 + off) % 1
          const bx = (i - 1) * 20
          const by = 8 - pct * 38
          const br = 3.5 + i * 1.5
          return <Circle key={i} x={bx} y={by} radius={br * (1 - pct * 0.4)}
            fill="transparent"
            stroke={`rgba(${clr(120,255,60)},${(1 - pct) * 0.85})`}
            strokeWidth={1.5} listening={false} />
        })}
        {[0, 0.5].map((off, i) => {
          const pct = (t * 0.30 + off) % 1
          return <Circle key={i} radius={r * 0.4 + pct * r * 0.7} fill="transparent"
            stroke={`rgba(${clr(100,200,40)},${(1 - pct) * 0.40})`} strokeWidth={1} listening={false} />
        })}
      </>
    }
    case 'lava_crack': {
      const a  = 0.55 + 0.30 * Math.sin(t * 1.8)
      const glow = 0.28 + 0.22 * Math.sin(t * 2.2)
      return <>
        <Circle radius={62} fill={`rgba(${clr(28,10,4)},0.74)`} listening={false} />
        <Line points={[0, 0, -36, -26]} stroke={`rgba(${clr(255,100,10)},${a})`}       strokeWidth={2}   lineCap="round" listening={false} />
        <Line points={[0, 0, 30, -34]}  stroke={`rgba(${clr(255,75,0)},${a * 0.82})`}  strokeWidth={1.5} lineCap="round" listening={false} />
        <Line points={[0, 0, 40, 24]}   stroke={`rgba(${clr(255,120,20)},${a})`}        strokeWidth={2}   lineCap="round" listening={false} />
        <Line points={[0, 0, -22, 38]}  stroke={`rgba(${clr(200,55,0)},${a * 0.72})`}  strokeWidth={1.5} lineCap="round" listening={false} />
        <Line points={[0, 0, 12, -48]}  stroke={`rgba(${clr(255,60,0)},${a * 0.65})`}  strokeWidth={1.2} lineCap="round" listening={false} />
        <Circle radius={18} fill={`rgba(${clr(255,80,0)},${glow * 0.42})`} listening={false} />
        <Circle radius={62} fill="transparent"
          stroke={`rgba(${clr(180,50,0)},${glow * 0.58})`} strokeWidth={2} listening={false} />
      </>
    }
    case 'fel_ground': {
      const r = 65 + 5 * Math.sin(t * 1.5)
      const a = 0.68 + 0.22 * Math.sin(t * 1.5)
      return <>
        <Circle radius={r} fill={`rgba(${clr(10,50,10)},0.72)`} listening={false} />
        <Circle radius={r} fill="transparent"
          stroke={`rgba(${clr(50,255,50)},${a})`} strokeWidth={2.5} listening={false} />
        <Circle radius={r * 0.55} fill="transparent"
          stroke={`rgba(${clr(120,255,80)},${a * 0.50})`} strokeWidth={1.5}
          dash={[6, 4]} dashOffset={t * 25} listening={false} />
        <Circle radius={18 + 5 * Math.sin(t * 3)} fill={`rgba(${clr(60,255,60)},0.18)`} listening={false} />
        {[0, 0.45].map((off, i) => {
          const pct = (t * 0.45 + off) % 1
          return <Circle key={i} radius={14 + pct * 55} fill="transparent"
            stroke={`rgba(${clr(80,230,40)},${(1 - pct) * 0.55})`} strokeWidth={1.5} listening={false} />
        })}
      </>
    }
    case 'electric_ground': {
      const r = 62
      return <>
        <Circle radius={r} fill={`rgba(${clr(5,10,45)},0.58)`} listening={false} />
        {[0.30, 0.56, 0.80, 1.0].map((scale, i) => {
          const fa = (0.45 + 0.45 * Math.sin(t * (12 + i * 3) + i))
          return <Circle key={i} radius={r * scale} fill="transparent"
            stroke={`rgba(${clr(160,210,255)},${fa})`}
            strokeWidth={i === 3 ? 2 : 1}
            dash={i % 2 === 0 ? [4, 3] : undefined}
            dashOffset={i % 2 === 0 ? -t * (30 + i * 10) : 0}
            listening={false} />
        })}
        {[0, 60, 120, 180, 240, 300].map((deg, i) => {
          const a = (deg + t * 60) * Math.PI / 180
          const len = 18 + 22 * Math.abs(Math.sin(t * 8 + i * 1.1))
          const fa  = 0.55 + 0.45 * Math.sin(t * 15 + i)
          return <Line key={i}
            points={[0, 0, Math.cos(a) * len, Math.sin(a) * len]}
            stroke={`rgba(${clr(200,230,255)},${fa})`} strokeWidth={1.2}
            lineCap="round" listening={false} />
        })}
      </>
    }
    case 'blood_ground': {
      const r = 58 + 6 * Math.sin(t * 0.8)
      const a = 0.72 + 0.18 * Math.sin(t * 0.8)
      return <>
        <Circle radius={r} fill={`rgba(${clr(110,0,0)},0.74)`} listening={false} />
        <Circle radius={r} fill="transparent"
          stroke={`rgba(${clr(180,10,10)},${a})`} strokeWidth={2.5} listening={false} />
        {[0, 0.5].map((off, i) => {
          const pct = (t * 0.25 + off) % 1
          return <Circle key={i} radius={r * 0.28 + pct * r * 0.80} fill="transparent"
            stroke={`rgba(${clr(200,20,20)},${(1 - pct) * 0.45})`} strokeWidth={2} listening={false} />
        })}
        <Circle radius={r * 0.35} fill={`rgba(${clr(60,0,0)},0.52)`} listening={false} />
        <Circle radius={r * 0.35} fill="transparent"
          stroke={`rgba(${clr(150,0,0)},0.35)`} strokeWidth={1}
          dash={[5, 4]} dashOffset={-t * 8} listening={false} />
      </>
    }
    case 'sand_ground': {
      const spin = t * 40
      const r = 62
      return <>
        <Circle radius={r} fill={`rgba(${clr(160,120,55)},0.38)`} listening={false} />
        <Circle radius={r} fill="transparent"
          stroke={`rgba(${clr(200,165,90)},0.70)`} strokeWidth={2}
          dash={[8, 5]} dashOffset={-spin} listening={false} />
        <Circle radius={r * 0.62} fill="transparent"
          stroke={`rgba(${clr(220,185,110)},0.50)`} strokeWidth={1.5}
          dash={[5, 6]} dashOffset={spin * 1.4} listening={false} />
        <Circle radius={r * 0.30} fill={`rgba(${clr(180,140,70)},0.30)`} listening={false} />
        <Circle radius={r * 0.30} fill="transparent"
          stroke={`rgba(${clr(240,210,140)},0.60)`} strokeWidth={1.5}
          dash={[4, 4]} dashOffset={-spin * 2} listening={false} />
        {[0, 0.25, 0.50, 0.75].map((off, i) => {
          const pct   = (t * 0.5 + off) % 1
          const angle = pct * 2 * Math.PI + i * Math.PI / 2
          const rad   = r * (0.2 + pct * 0.7)
          return <Circle key={i}
            x={Math.cos(angle) * rad} y={Math.sin(angle) * rad}
            radius={3 - pct * 2}
            fill={`rgba(${clr(220,190,120)},${(1 - pct) * 0.80})`} listening={false} />
        })}
      </>
    }
    case 'orb_gold': {
      const R      = 35
      const spin   = t * 22
      const pulse  = 0.85 + 0.15 * Math.sin(t * 2.2)
      const hPulse = 0.50 + 0.35 * Math.sin(t * 1.8 + 1)
      return <>
        <Circle radius={R + 14} fill={`rgba(${clr(220,160,30)},${0.20 * pulse})`} listening={false} />
        <Circle radius={R}
          fillRadialGradientStartPoint={{ x: -R * 0.22, y: -R * 0.22 }}
          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndRadius={R}
          fillRadialGradientColorStops={[
            0, `rgba(${clr(255,238,130)},0.95)`,  0.38, `rgba(${clr(220,162,40)},0.90)`,
            0.72, `rgba(${clr(148,90,8)},0.85)`,  1, `rgba(${clr(65,38,0)},0.82)`
          ]}
          listening={false} />
        <Wedge radius={R * 0.78} angle={130} rotation={spin}
          fill={`rgba(${clr(255,242,140)},${0.18 * pulse})`} listening={false} />
        <Wedge radius={R * 0.58} angle={100} rotation={spin + 195}
          fill={`rgba(${clr(240,200,60)},${0.14 * pulse})`} listening={false} />
        <Circle radius={R * 0.28} x={-R * 0.28} y={-R * 0.28}
          fill={`rgba(255,252,215,${hPulse * 0.62})`} listening={false} />
        <Circle radius={R} fill="transparent"
          stroke={`rgba(${clr(48,26,0)},0.55)`} strokeWidth={5} listening={false} />
      </>
    }
    case 'orb_void': {
      const R     = 35
      const spin  = t * 28
      const pulse = 0.80 + 0.20 * Math.sin(t * 1.6)
      const inner = 0.60 + 0.35 * Math.sin(t * 2.4 + 0.8)
      return <>
        <Circle radius={R + 14} fill={`rgba(${clr(80,0,120)},${0.22 * pulse})`} listening={false} />
        <Circle radius={R}
          fillRadialGradientStartPoint={{ x: -R * 0.18, y: -R * 0.18 }}
          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndRadius={R}
          fillRadialGradientColorStops={[
            0, `rgba(${clr(160,60,220)},0.85)`,  0.35, `rgba(${clr(75,10,128)},0.90)`,
            0.70, `rgba(${clr(22,0,48)},0.92)`,  1, `rgba(${clr(4,0,14)},0.96)`
          ]}
          listening={false} />
        <Wedge radius={R * 0.72} angle={110} rotation={-spin}
          fill={`rgba(${clr(180,80,255)},${0.15 * pulse})`} listening={false} />
        <Wedge radius={R * 0.52} angle={80} rotation={-spin + 170}
          fill={`rgba(${clr(140,40,200)},${0.12 * pulse})`} listening={false} />
        <Circle radius={R * 0.30} x={-R * 0.20} y={-R * 0.20}
          fill={`rgba(${clr(200,120,255)},${inner * 0.44})`} listening={false} />
        <Circle radius={R} fill="transparent"
          stroke={`rgba(${clr(110,28,175)},0.62)`} strokeWidth={3} listening={false} />
        <Circle radius={R} fill="transparent"
          stroke={`rgba(${clr(200,100,255)},0.28)`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'orb_arcane': {
      const R     = 35
      const spin  = t * 35
      const pulse = 0.82 + 0.18 * Math.sin(t * 2.8)
      const core  = 0.65 + 0.30 * Math.sin(t * 3.2 + 0.5)
      return <>
        <Circle radius={R + 14} fill={`rgba(${clr(50,100,220)},${0.22 * pulse})`} listening={false} />
        <Circle radius={R}
          fillRadialGradientStartPoint={{ x: -R * 0.20, y: -R * 0.20 }}
          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndRadius={R}
          fillRadialGradientColorStops={[
            0, `rgba(${clr(205,222,255)},0.92)`,  0.30, `rgba(${clr(78,130,230)},0.90)`,
            0.65, `rgba(${clr(18,48,148)},0.88)`, 1, `rgba(${clr(4,8,58)},0.86)`
          ]}
          listening={false} />
        <Wedge radius={R * 0.75} angle={120} rotation={spin}
          fill={`rgba(${clr(180,212,255)},${0.18 * pulse})`} listening={false} />
        <Wedge radius={R * 0.55} angle={88} rotation={spin + 200}
          fill={`rgba(${clr(140,182,255)},${0.14 * pulse})`} listening={false} />
        <Circle radius={R * 0.26} x={-R * 0.22} y={-R * 0.22}
          fill={`rgba(228,242,255,${core * 0.68})`} listening={false} />
        <Circle radius={R} fill="transparent"
          stroke={`rgba(${clr(28,58,178)},0.55)`} strokeWidth={4} listening={false} />
        <Circle radius={R} fill="transparent"
          stroke={`rgba(${clr(140,182,255)},0.32)`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'beam_helix': {
      const L    = 700
      const amp  = 13
      const freq = 0.028
      const spin = t * 2.4
      const core = 0.55 + 0.15 * Math.sin(t * 1.8)
      const step = 6
      const s1 = [], s2 = []
      for (let x = 0; x <= L; x += step) {
        const ph = x * freq + spin
        s1.push(x,  amp * Math.sin(ph))
        s2.push(x, -amp * Math.sin(ph))
      }
      return <>
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(140,170,220)},0.30)`} strokeWidth={22} lineCap="butt" listening={false} />
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(200,220,255)},${core})`} strokeWidth={2.5} lineCap="butt" listening={false} />
        <Line points={s1} stroke={`rgba(${clr(255,40,40)},0.92)`} strokeWidth={2.2} tension={0.35} lineCap="round" listening={false} />
        <Line points={s2} stroke={`rgba(${clr(255,40,40)},0.92)`} strokeWidth={2.2} tension={0.35} lineCap="round" listening={false} />
        <Circle radius={7 + 2 * Math.sin(t * 3.5)} fill={`rgba(${clr(255,200,200)},0.9)`} listening={false} />
        <Circle radius={3} fill="rgba(255,255,255,0.95)" listening={false} />
      </>
    }
    case 'beam_line': {
      const pulse = 0.82 + 0.18 * Math.sin(t * 2.5)
      const L = 700
      return <>
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(60,120,255)},0.18)`} strokeWidth={30} lineCap="butt" listening={false} />
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(140,190,255)},0.50)`} strokeWidth={10} lineCap="butt" listening={false} />
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(220,235,255)},${pulse})`} strokeWidth={3} lineCap="butt" listening={false} />
        <Circle radius={7 + 2 * Math.sin(t * 3.5)} fill={`rgba(${clr(200,220,255)},0.85)`} listening={false} />
      </>
    }
    case 'beam_cross': {
      const pulse = 0.82 + 0.18 * Math.sin(t * 2.5)
      const L = 700
      return <>
        {[[-L, 0, L, 0], [0, -L, 0, L]].map((pts, i) => (
          <Line key={`o${i}`} points={pts} stroke={`rgba(${clr(60,120,255)},0.18)`} strokeWidth={30} lineCap="butt" listening={false} />
        ))}
        {[[-L, 0, L, 0], [0, -L, 0, L]].map((pts, i) => (
          <Line key={`m${i}`} points={pts} stroke={`rgba(${clr(140,190,255)},0.50)`} strokeWidth={10} lineCap="butt" listening={false} />
        ))}
        {[[-L, 0, L, 0], [0, -L, 0, L]].map((pts, i) => (
          <Line key={`c${i}`} points={pts} stroke={`rgba(${clr(220,235,255)},${pulse})`} strokeWidth={3} lineCap="butt" listening={false} />
        ))}
        <Circle radius={9 + 2 * Math.sin(t * 3)} fill={`rgba(${clr(200,220,255)},0.85)`} listening={false} />
      </>
    }
    case 'beam_cone': {
      const pulse = 0.72 + 0.28 * Math.sin(t * 2.8)
      const L = 600, halfAng = 25 * Math.PI / 180
      const x1 = Math.cos(halfAng) * L,  y1 = Math.sin(halfAng) * L
      const x2 = Math.cos(-halfAng) * L, y2 = Math.sin(-halfAng) * L
      return <>
        <Line points={[0, 0, x1, y1, x2, y2]} closed={true}
          fill={`rgba(${clr(255,140,30)},${pulse * 0.22})`}
          stroke={`rgba(${clr(255,180,60)},${pulse * 0.70})`} strokeWidth={1.5} listening={false} />
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(255,200,80)},0.35)`} strokeWidth={12} lineCap="round" listening={false} />
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(255,220,120)},${pulse})`} strokeWidth={3} lineCap="round" listening={false} />
        <Circle radius={6 + 2 * Math.sin(t * 4)} fill={`rgba(${clr(255,240,180)},0.9)`} listening={false} />
      </>
    }
    case 'beam_void': {
      const pulse = 0.80 + 0.20 * Math.sin(t * 1.8)
      const L = 700
      return <>
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(30,0,50)},0.88)`} strokeWidth={26} lineCap="butt" listening={false} />
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(110,20,170)},0.65)`} strokeWidth={8} lineCap="butt" listening={false} />
        <Line points={[0, 0, L, 0]} stroke={`rgba(${clr(200,100,255)},${pulse})`} strokeWidth={2} lineCap="butt" listening={false} />
        {Array.from({ length: 9 }, (_, i) => {
          const x    = 40 + i * 80
          const sway = 14 + 8 * Math.abs(Math.sin(t * (2.5 + i * 0.3) + i))
          const fa   = 0.45 + 0.45 * Math.sin(t * (3 + i * 0.4) + i * 1.2)
          return [
            <Line key={`u${i}`} points={[x, 0, x + 8 * Math.sin(t * 2 + i), -sway]} stroke={`rgba(${clr(160,50,220)},${fa * 0.7})`} strokeWidth={1.5} lineCap="round" listening={false} />,
            <Line key={`d${i}`} points={[x, 0, x - 8 * Math.sin(t * 2 + i),  sway]} stroke={`rgba(${clr(160,50,220)},${fa * 0.7})`} strokeWidth={1.5} lineCap="round" listening={false} />,
          ]
        })}
        <Circle radius={10 + 3 * Math.sin(t * 2.5)} fill={`rgba(${clr(60,0,100)},0.9)`} listening={false} />
        <Circle radius={5  +   Math.sin(t * 4)}     fill={`rgba(${clr(200,100,255)},${pulse})`} listening={false} />
      </>
    }
    case 'cone_aoe': {
      const glow    = 0.55 + 0.28 * Math.sin(t * 0.75)
      const shimmer = 0.45 + 0.40 * Math.sin(t * 1.15 + 0.8)
      const L = 210, halfAng = 45 * Math.PI / 180
      const ex = Math.cos(halfAng) * L, ey = Math.sin(halfAng) * L
      const rgb = clr(255, 120, 30)
      const makeArc = (r, step = 5) => {
        const pts = []
        for (let d = -45; d <= 45; d += step) {
          const rad = d * Math.PI / 180
          pts.push(Math.cos(rad) * r, Math.sin(rad) * r)
        }
        return pts
      }
      return <>
        {/* Layered fill — fade from bright near edges to transparent at center */}
        <Line points={[0, 0, ex, ey, ex, -ey]} closed={true}
          fill={`rgba(${rgb},${0.18 + 0.06 * glow})`} stroke="transparent" listening={false} />
        <Line points={[0, 0, Math.cos(halfAng * 0.6) * L * 0.55, Math.sin(halfAng * 0.6) * L * 0.55,
                            Math.cos(halfAng * 0.6) * L * 0.55, Math.sin(-halfAng * 0.6) * L * 0.55]}
          closed={true} fill={`rgba(${rgb},0.06)`} stroke="transparent" listening={false} />
        {/* Soft outer glow along each straight edge */}
        <Line points={[0, 0, ex,  ey]} stroke={`rgba(${rgb},${glow * 0.30})`}
          strokeWidth={10} lineCap="round" listening={false} />
        <Line points={[0, 0, ex, -ey]} stroke={`rgba(${rgb},${glow * 0.30})`}
          strokeWidth={10} lineCap="round" listening={false} />
        {/* Crisp bright straight edges */}
        <Line points={[0, 0, ex,  ey]} stroke={`rgba(${rgb},${0.60 + 0.32 * glow})`}
          strokeWidth={2.5} lineCap="round" listening={false} />
        <Line points={[0, 0, ex, -ey]} stroke={`rgba(${rgb},${0.60 + 0.32 * glow})`}
          strokeWidth={2.5} lineCap="round" listening={false} />
        {/* Far arc cap with outer glow */}
        <Line points={makeArc(L, 6)} stroke={`rgba(${rgb},${glow * 0.28})`}
          strokeWidth={10} tension={0} lineCap="round" listening={false} />
        <Line points={makeArc(L, 4)} stroke={`rgba(${rgb},${0.55 + 0.30 * glow})`}
          strokeWidth={2.5} tension={0} lineCap="round" listening={false} />
        {/* Concentric inner arcs — structural depth */}
        {[0.72, 0.46].map((frac, i) => (
          <Line key={i} points={makeArc(L * frac, 8)}
            stroke={`rgba(${rgb},${shimmer * (0.20 - i * 0.06)})`}
            strokeWidth={1} tension={0} listening={false} />
        ))}
        {/* Slow-moving wave arcs emanating from tip */}
        {[0, 0.38, 0.72].map((off, i) => {
          const pct = (t * 0.45 + off) % 1
          return <Line key={i} points={makeArc(pct * L, 7)}
            stroke={`rgba(${rgb},${(1 - pct) * 0.45})`}
            strokeWidth={1.5} tension={0} listening={false} />
        })}
        {/* Tip glow */}
        <Circle radius={6 + 2.5 * Math.abs(Math.sin(t * 0.75))}
          fill={`rgba(${rgb},${0.50 + 0.30 * glow})`} listening={false} />
        <Circle radius={2.5} fill={`rgba(255,225,170,0.92)`} listening={false} />
      </>
    }
    case 'frontal_shield': {
      const glow    = 0.55 + 0.30 * Math.sin(t * 0.80)
      const shimmer = 0.40 + 0.45 * Math.sin(t * 1.25 + 0.6)
      const R = 58
      const rgb = clr(80, 185, 255)
      const makeArc = (r, step = 5) => {
        const pts = []
        for (let d = -90; d <= 90; d += step) {
          const rad = d * Math.PI / 180
          pts.push(Math.cos(rad) * r, Math.sin(rad) * r)
        }
        return pts
      }
      return <>
        {/* Wide soft halo behind the edge */}
        <Line points={makeArc(R + 11, 8)} stroke={`rgba(${rgb},${glow * 0.16})`}
          strokeWidth={18} tension={0} lineCap="round" listening={false} />
        {/* Layered fill — simulates a radial gradient */}
        <Wedge radius={R}        angle={180} rotation={-90}
          fill={`rgba(${rgb},${0.14 + 0.05 * glow})`} stroke="transparent" listening={false} />
        <Wedge radius={R * 0.68} angle={180} rotation={-90}
          fill={`rgba(${rgb},${0.08 + 0.03 * glow})`} stroke="transparent" listening={false} />
        <Wedge radius={R * 0.36} angle={180} rotation={-90}
          fill={`rgba(${rgb},0.04)`} stroke="transparent" listening={false} />
        {/* Subtle radial cell dividers */}
        {[-60, -30, 0, 30, 60].map((d, i) => {
          const rad = d * Math.PI / 180
          return <Line key={i}
            points={[Math.cos(rad) * R * 0.10, Math.sin(rad) * R * 0.10,
                     Math.cos(rad) * R,         Math.sin(rad) * R]}
            stroke={`rgba(${rgb},0.07)`} strokeWidth={0.8} listening={false} />
        })}
        {/* Inner concentric arc panels */}
        <Line points={makeArc(R * 0.68, 8)} stroke={`rgba(${rgb},${shimmer * 0.22})`}
          strokeWidth={1} tension={0} lineCap="round" listening={false} />
        <Line points={makeArc(R * 0.38, 10)} stroke={`rgba(${rgb},0.09)`}
          strokeWidth={0.8} tension={0} lineCap="round" listening={false} />
        {/* Main bright outer arc edge */}
        <Line points={makeArc(R, 4)} stroke={`rgba(${rgb},${0.58 + 0.34 * glow})`}
          strokeWidth={3.5} tension={0} lineCap="round" listening={false} />
        {/* Thin inner highlight just inside the main edge */}
        <Line points={makeArc(R - 4, 6)} stroke={`rgba(215,240,255,${shimmer * 0.26})`}
          strokeWidth={1} tension={0} lineCap="round" listening={false} />
        {/* Flat back edge — slow-crawling dashes */}
        <Line points={[0, -(R + 7), 0, (R + 7)]}
          stroke={`rgba(${rgb},${0.22 + 0.10 * glow})`} strokeWidth={1.5}
          dash={[6, 5]} dashOffset={t * 6} listening={false} />
        {/* Slowly breathing energy dots on the arc */}
        {[-72, -48, -24, 0, 24, 48, 72].map((d, i) => {
          const rad   = d * Math.PI / 180
          const blink = 0.22 + 0.60 * Math.sin(t * 0.80 + i * 0.95)
          const rr    = R + 1.5 * Math.sin(t * 0.95 + i * 0.8)
          return <Circle key={i}
            x={Math.cos(rad) * rr} y={Math.sin(rad) * rr}
            radius={1.7 + 0.5 * Math.sin(t * 1.1 + i)}
            fill={`rgba(210,240,255,${blink})`} listening={false} />
        })}
      </>
    }
    case 'iron_star': {
      // Disc body radius (also the valley depth between spikes)
      const ROUT   = 34
      const RINNER = 24  // inner mechanical ring
      const RHUB   = 10  // hub center

      // Rolling rotation — wheel spinning as it travels
      const roll = (t * 130) % 360

      // Three independent fire-pulse animators for the vent segments
      const fp1 = 0.68 + 0.32 * Math.sin(t * 4.3)
      const fp2 = 0.68 + 0.32 * Math.sin(t * 3.9 + 1.4)
      const fp3 = 0.68 + 0.32 * Math.sin(t * 4.7 + 2.6)

      // ── Spike polygon (12 spikes, 4 pts each) ──
      // tip radius and angular offset (degrees) vary per spike for irregular look
      const SPIKE_DATA = [
        {r:52,ao:0},{r:48,ao:2},{r:57,ao:-2},{r:47,ao:1},
        {r:54,ao:-1},{r:50,ao:3},{r:46,ao:0},{r:56,ao:-2},
        {r:49,ao:2},{r:53,ao:-1},{r:47,ao:1},{r:51,ao:-3},
      ]
      const sStep = Math.PI * 2 / SPIKE_DATA.length
      const spikePts = []
      SPIKE_DATA.forEach(({r, ao}, i) => {
        const base = i * sStep - Math.PI / 2 + ao * (Math.PI / 180)
        // Valley (at disc body surface, before this spike)
        spikePts.push(
          ROUT * Math.cos(base - sStep * 0.48),
          ROUT * Math.sin(base - sStep * 0.48)
        )
        // Left shoulder (rising toward spike tip)
        spikePts.push(
          r * 0.76 * Math.cos(base - sStep * 0.22),
          r * 0.76 * Math.sin(base - sStep * 0.22)
        )
        // Spike tip
        spikePts.push(r * Math.cos(base), r * Math.sin(base))
        // Right shoulder (descending from spike tip)
        spikePts.push(
          r * 0.76 * Math.cos(base + sStep * 0.22),
          r * 0.76 * Math.sin(base + sStep * 0.22)
        )
      })

      // 7 rivets evenly spaced around the inner ring
      const rivetAngles = Array.from({length: 7}, (_, i) =>
        (i / 7) * Math.PI * 2 - Math.PI / 2)

      // Three fire vents at 120° apart
      const vents = [
        {rot: 0,   fp: fp1},
        {rot: 120, fp: fp2},
        {rot: 240, fp: fp3},
      ]

      return <>
        {/* ── Rolling wheel (everything inside rotates) ── */}
        <Group rotation={roll} listening={false}>

          {/* Spiky outer rim — dark iron with irregular protrusions */}
          <Line points={spikePts} closed={true}
            fill={`rgba(${clr(19,12,7)},0.97)`}
            stroke={`rgba(${clr(54,37,19)},0.84)`}
            strokeWidth={1.4} listening={false} />
          {/* Subtle highlight along spike faces */}
          <Line points={spikePts} closed={true}
            fill="transparent"
            stroke={`rgba(${clr(90,62,36)},0.26)`}
            strokeWidth={0.6} listening={false} />

          {/* Main disc body with slight gradient (catches forge-light) */}
          <Circle radius={ROUT}
            fillRadialGradientStartPoint={{x: -5, y: -6}}
            fillRadialGradientEndPoint={{x: 0, y: 0}}
            fillRadialGradientStartRadius={0}
            fillRadialGradientEndRadius={ROUT}
            fillRadialGradientColorStops={[
              0,   `rgba(${clr(52,36,20)},1)`,
              0.42,`rgba(${clr(30,20,11)},1)`,
              0.82,`rgba(${clr(18,12,6)},1)`,
              1,   `rgba(${clr(13,8,4)},1)`,
            ]}
            listening={false} />

          {/* Disc rim band */}
          <Circle radius={ROUT} fill="transparent"
            stroke={`rgba(${clr(46,31,15)},0.96)`} strokeWidth={4} listening={false} />
          <Circle radius={ROUT - 2} fill="transparent"
            stroke={`rgba(${clr(80,58,30)},0.36)`} strokeWidth={0.9} listening={false} />

          {/* ── Three fire vent wedges — orange-amber, pulsing independently ── */}
          {vents.map(({rot, fp}, i) => (
            <Wedge key={`v${i}`}
              radius={RINNER - 2}
              angle={84}
              rotation={rot + 6}
              fill={`rgba(${clr(255,106,12)},${0.92 * fp})`}
              listening={false} />
          ))}

          {/* Bright radiant core where all three vents converge */}
          <Circle radius={RINNER * 0.48}
            fill={`rgba(${clr(255,200,52)},${0.80 * fp1})`}
            listening={false} />

          {/* Dark iron separators between vent segments */}
          {[0, 120, 240].map((rot, i) => (
            <Wedge key={`sp${i}`}
              radius={RINNER - 2}
              angle={36}
              rotation={rot - 22}
              fill={`rgba(${clr(13,8,4)},0.97)`}
              listening={false} />
          ))}

          {/* ── Inner mechanical ring (three concentric bands) ── */}
          <Circle radius={RINNER} fill="transparent"
            stroke={`rgba(${clr(34,23,11)},1)`} strokeWidth={5.5} listening={false} />
          <Circle radius={RINNER + 0.6} fill="transparent"
            stroke={`rgba(${clr(66,46,22)},0.52)`} strokeWidth={1.2} listening={false} />
          <Circle radius={RINNER - 2.8} fill="transparent"
            stroke={`rgba(${clr(48,34,15)},0.36)`} strokeWidth={0.8} listening={false} />

          {/* Rivets — small iron bolts around the inner ring */}
          {rivetAngles.map((a, i) => (
            <Circle key={`r${i}`}
              x={RINNER * Math.cos(a)} y={RINNER * Math.sin(a)}
              radius={2.5}
              fill={`rgba(${clr(44,30,14)},1)`}
              stroke={`rgba(${clr(82,60,30)},0.90)`}
              strokeWidth={0.8} listening={false} />
          ))}

          {/* ── Hub center with fire gradient ── */}
          <Circle radius={RHUB}
            fillRadialGradientStartPoint={{x: -2, y: -2}}
            fillRadialGradientEndPoint={{x: 0, y: 0}}
            fillRadialGradientStartRadius={0}
            fillRadialGradientEndRadius={RHUB}
            fillRadialGradientColorStops={[
              0,    `rgba(${clr(255,220,80)},0.94)`,
              0.38, `rgba(${clr(255,140,20)},0.92)`,
              0.74, `rgba(${clr(208,68,8)},0.88)`,
              1,    `rgba(${clr(86,22,4)},0.82)`,
            ]}
            listening={false} />
          <Circle radius={RHUB} fill="transparent"
            stroke={`rgba(${clr(50,34,14)},0.92)`} strokeWidth={2.2} listening={false} />

        </Group>
      </>
    }
    case 'totem': {
      const pulse = 0.65 + 0.35 * Math.sin(t * 3.2)
      const waver = t * 2.6

      const PW = 7
      const PT = -22
      const PB =  34

      const lpts1 = [], lpts2 = []
      for (let y = PT + 2; y <= PB - 2; y += 2) {
        const x = Math.sin(y * 0.28 + waver) * 3.5
        lpts1.push(x - 1.5, y)
        lpts2.push(x + 1.5, y)
      }

      return <>
        {/* ── Wooden post ── */}
        <Rect x={-PW} y={PT} width={PW * 2} height={PB - PT}
          fillLinearGradientStartPoint={{x: -PW, y: 0}}
          fillLinearGradientEndPoint={{x: PW, y: 0}}
          fillLinearGradientColorStops={[
            0,   `rgba(${clr(120,90,42)},0.98)`,
            0.3, `rgba(${clr(192,152,80)},0.98)`,
            0.6, `rgba(${clr(175,138,68)},0.98)`,
            1,   `rgba(${clr(105,80,34)},0.98)`,
          ]}
          listening={false} />
        <Line points={[-PW + 2, PT + 4, -PW + 2, PB - 4]}
          stroke="rgba(0,0,0,0.11)" strokeWidth={1} listening={false} />
        <Line points={[PW - 2, PT + 4, PW - 2, PB - 4]}
          stroke="rgba(0,0,0,0.11)" strokeWidth={1} listening={false} />

        {/* ── Wavy energy lines ── */}
        <Line points={lpts1} stroke={`rgba(${clr(170,225,255)},${pulse * 0.70})`}
          strokeWidth={1.6} tension={0.4} lineCap="round" listening={false} />
        <Line points={lpts2} stroke={`rgba(${clr(200,240,255)},${pulse * 0.45})`}
          strokeWidth={1} tension={0.4} lineCap="round" listening={false} />

        {/* ── Blue glowing band ── */}
        <Rect x={-PW - 3} y={-5} width={(PW + 3) * 2} height={9}
          fill={`rgba(${clr(50,150,255)},${pulse * 0.88})`}
          stroke={`rgba(${clr(160,220,255)},${pulse})`} strokeWidth={1.2} listening={false} />
        <Rect x={-PW - 3} y={-5} width={(PW + 3) * 2} height={9}
          fill="transparent"
          stroke={`rgba(${clr(220,245,255)},${pulse * 0.5})`} strokeWidth={0.5} listening={false} />

        {/* ── Wing protrusions ── */}
        <Line closed points={[-PW, -12, -PW - 20, -10, -PW - 16, 4, -PW, 7]}
          fill={`rgba(${clr(148,112,52)},0.96)`}
          stroke={`rgba(${clr(85,62,24)},0.70)`} strokeWidth={1} listening={false} />
        <Line points={[-PW - 18, -8, -PW - 8, 2]}
          stroke="rgba(0,0,0,0.14)" strokeWidth={1.5} lineCap="round" listening={false} />
        <Line closed points={[PW, -12, PW + 20, -10, PW + 16, 4, PW, 7]}
          fill={`rgba(${clr(148,112,52)},0.96)`}
          stroke={`rgba(${clr(85,62,24)},0.70)`} strokeWidth={1} listening={false} />
        <Line points={[PW + 18, -8, PW + 8, 2]}
          stroke="rgba(0,0,0,0.14)" strokeWidth={1.5} lineCap="round" listening={false} />
      </>
    }
    case 'horde_banner': {
      // Wooden pole with a red Horde banner hanging from a crossbar
      const wv = Math.sin(t * 1.6) * 5     // right-edge horizontal wave
      const wv2 = Math.sin(t * 1.6 + 0.6) * 3.5

      const POLE_TOP = -72
      const CROSS_Y  = -56  // crossbar sits here
      const POLE_BOT =  32
      const BW = 40         // banner width
      const BH = 52         // banner height
      const BX = 2          // banner starts just right of pole

      // Banner polygon — right edge and bottom wave in the wind
      const bPts = [
        BX,        CROSS_Y,
        BX + BW + wv,   CROSS_Y + 2,
        BX + BW + wv2,  CROSS_Y + BH * 0.55,
        BX + BW + wv,   CROSS_Y + BH,
        BX,        CROSS_Y + BH,
      ]

      const cx = BX + BW * 0.52
      const cy = CROSS_Y + BH * 0.54
      const crSymX = cx + wv * 0.32   // symbol moves with banner wave

      // 28-point polygon tracing the exact Horde logo silhouette
      const hordePts = [
        crSymX+ 0, cy-18,  crSymX+ 2, cy-13,  crSymX+ 4, cy-10,  crSymX+ 6, cy-13,
        crSymX+10, cy-17,  crSymX+11, cy-14,  crSymX+ 8, cy- 7,  crSymX+12, cy-4.5,
        crSymX+10, cy- 1,  crSymX+ 9, cy+ 3,  crSymX+13, cy+ 6,  crSymX+10, cy+12,
        crSymX+ 8, cy+14,  crSymX+ 3, cy+9.5, crSymX+ 0, cy+11,  crSymX- 3, cy+9.5,
        crSymX- 8, cy+14,  crSymX-10, cy+12,  crSymX-13, cy+ 6,  crSymX- 9, cy+ 3,
        crSymX-10, cy- 1,  crSymX-12, cy-4.5, crSymX- 8, cy- 7,  crSymX-11, cy-14,
        crSymX-10, cy-17,  crSymX- 6, cy-13,  crSymX- 4, cy-10,  crSymX- 2, cy-13,
      ]

      return <>
        {/* ── Pole shadow ── */}
        <Line points={[3, POLE_TOP + 10, 4, POLE_BOT]}
          stroke="rgba(0,0,0,0.28)" strokeWidth={5} lineCap="round" listening={false} />

        {/* ── Main pole ── */}
        <Line points={[0, POLE_TOP + 10, 0, POLE_BOT]}
          stroke="rgba(80,50,20,0.98)" strokeWidth={6} lineCap="round" listening={false} />
        <Line points={[-1.5, POLE_TOP + 10, -1.5, POLE_BOT]}
          stroke="rgba(140,90,45,0.42)" strokeWidth={2} lineCap="round" listening={false} />

        {/* ── Spear tip ── */}
        <Line closed points={[0, POLE_TOP, -5, POLE_TOP + 13, 5, POLE_TOP + 13]}
          fill="rgba(155,138,118,0.97)"
          stroke="rgba(80,68,55,0.85)" strokeWidth={1} listening={false} />
        <Line points={[0, POLE_TOP, 0, POLE_TOP + 13]}
          stroke="rgba(200,185,160,0.35)" strokeWidth={1} lineCap="round" listening={false} />

        {/* ── Crossbar ── */}
        <Line points={[-1, CROSS_Y, BX + BW + 6, CROSS_Y]}
          stroke="rgba(70,44,16,0.98)" strokeWidth={5} lineCap="round" listening={false} />

        {/* ── Banner body ── */}
        <Line closed points={bPts}
          fill="rgba(175,14,14,0.96)"
          stroke="rgba(100,5,5,0.75)" strokeWidth={1} listening={false} />
        {/* Banner inner shadow along left edge */}
        <Line points={[BX + 5, CROSS_Y + 2, BX + 5, CROSS_Y + BH - 2]}
          stroke="rgba(0,0,0,0.20)" strokeWidth={4} lineCap="round" listening={false} />

        {/* ── Horde crest — exact logo silhouette polygon ── */}
        <Line closed points={hordePts}
          fill="rgba(16,3,3,0.94)" stroke="rgba(16,3,3,0.94)" strokeWidth={0.5} listening={false} />

        {/* ── Metal ring fittings on pole ── */}
        {[-42, -18, 8, POLE_BOT - 5].map((y, i) => (
          <Rect key={i} x={-4} y={y - 3} width={8} height={6} rx={1}
            fill="rgba(95,88,78,0.95)"
            stroke="rgba(155,142,125,0.55)" strokeWidth={0.8} listening={false} />
        ))}

        {/* ── Diagonal support strut ── */}
        <Line points={[1, CROSS_Y + 2, -BW * 0.18, CROSS_Y + BH * 0.55]}
          stroke="rgba(62,38,14,0.82)" strokeWidth={3} lineCap="round" listening={false} />
      </>
    }
    case 'warlock_gateway': {
      const pulseA = 0.72 + 0.28 * Math.sin(t * 2.1)
      const pulseB = 0.68 + 0.32 * Math.sin(t * 1.7 + 1.1)
      const swirl  = t * 0.9

      const ARCH_MID = 42
      const ARCH_THK = 14
      const ROUT = ARCH_MID + ARCH_THK / 2  // 49
      const RIN  = ARCH_MID - ARCH_THK / 2  // 35

      // Two counter-rotating spiral arms inside the portal
      const spiral1 = [], spiral2 = []
      for (let i = 0; i <= 100; i++) {
        const frac = i / 100
        const ang1 = swirl + frac * Math.PI * 3.5
        const ang2 = swirl + Math.PI + frac * Math.PI * 3.5
        const r = (1 - frac * 0.82) * RIN * 0.92
        spiral1.push(Math.cos(ang1) * r, Math.sin(ang1) * r)
        spiral2.push(Math.cos(ang2) * r, Math.sin(ang2) * r)
      }

      // 14 rune dots spaced around the arch ring
      const runeAngles = Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2 - Math.PI / 2)

      return <>
        {/* Portal interior radial gradient */}
        <Circle radius={RIN}
          fillRadialGradientStartPoint={{x:0,y:0}} fillRadialGradientEndPoint={{x:0,y:0}}
          fillRadialGradientStartRadius={0} fillRadialGradientEndRadius={RIN}
          fillRadialGradientColorStops={[
            0,   `rgba(${clr(105,10,185)},${pulseA})`,
            0.45,`rgba(${clr(58,0,118)},${pulseB})`,
            1,   `rgba(${clr(16,0,42)},0.98)`,
          ]}
          listening={false} />
        {/* Swirling spiral arms */}
        <Line points={spiral1} stroke={`rgba(${clr(185,65,255)},${pulseA * 0.75})`} strokeWidth={2.5} tension={0.35} lineCap="round" listening={false} />
        <Line points={spiral2} stroke={`rgba(${clr(140,20,220)},${pulseB * 0.55})`} strokeWidth={1.8} tension={0.35} lineCap="round" listening={false} />
        {/* Stone arch body — thick dark ring */}
        <Circle radius={ARCH_MID} fill="transparent"
          stroke={`rgba(${clr(22,15,32)},0.99)`} strokeWidth={ARCH_THK + 2} listening={false} />
        {/* Outer arch edge */}
        <Circle radius={ROUT} fill="transparent"
          stroke={`rgba(${clr(44,28,62)},0.75)`} strokeWidth={1.5} listening={false} />
        {/* Inner rim — purple portal glow */}
        <Circle radius={RIN} fill="transparent"
          stroke={`rgba(${clr(165,42,245)},${pulseA * 0.82})`} strokeWidth={2.5} listening={false} />
        <Circle radius={RIN + 4} fill="transparent"
          stroke={`rgba(${clr(95,12,175)},${pulseB * 0.38})`} strokeWidth={1.5} listening={false} />
        {/* Purple rune dots embedded in the arch */}
        {runeAngles.map((ang, i) => {
          const glow = 0.55 + 0.40 * Math.sin(t * 1.8 + i * 0.75)
          return <Circle key={i}
            x={Math.cos(ang) * ARCH_MID} y={Math.sin(ang) * ARCH_MID}
            radius={3.2 + 0.7 * Math.sin(t * 2.2 + i * 0.8)}
            fill={`rgba(${clr(140,28,222)},${glow * 0.85})`}
            stroke={`rgba(${clr(205,105,255)},${glow})`} strokeWidth={0.8}
            listening={false} />
        })}
        {/* ── Demon skull at top ── */}
        {/* Left horn */}
        <Line points={[-5, -ROUT - 1, -19, -ROUT - 24, -10, -ROUT - 12]}
          stroke={`rgba(${clr(30,18,44)},0.99)`} strokeWidth={9} lineCap="round" lineJoin="round" listening={false} />
        <Line points={[-5, -ROUT - 1, -19, -ROUT - 24]}
          stroke={`rgba(${clr(100,18,165)},${pulseA * 0.45})`} strokeWidth={2} lineCap="round" listening={false} />
        {/* Right horn */}
        <Line points={[5, -ROUT - 1, 19, -ROUT - 24, 10, -ROUT - 12]}
          stroke={`rgba(${clr(30,18,44)},0.99)`} strokeWidth={9} lineCap="round" lineJoin="round" listening={false} />
        <Line points={[5, -ROUT - 1, 19, -ROUT - 24]}
          stroke={`rgba(${clr(100,18,165)},${pulseA * 0.45})`} strokeWidth={2} lineCap="round" listening={false} />
        {/* Skull body */}
        <Ellipse x={0} y={-ROUT - 1} radiusX={12} radiusY={10}
          fill={`rgba(${clr(19,13,29)},0.99)`}
          stroke={`rgba(${clr(55,32,80)},0.85)`} strokeWidth={2} listening={false} />
        {/* Skull eye sockets */}
        <Circle x={-4} y={-ROUT - 2} radius={2.8}
          fill={`rgba(${clr(155,28,235)},${pulseA * 0.95})`} listening={false} />
        <Circle x={4}  y={-ROUT - 2} radius={2.8}
          fill={`rgba(${clr(155,28,235)},${pulseA * 0.95})`} listening={false} />
        {/* ── Stone base ── */}
        {/* Side pedestals */}
        <Rect x={-ROUT - 12} y={ROUT - 16} width={15} height={16}
          fill={`rgba(${clr(17,12,24)},0.97)`}
          stroke={`rgba(${clr(44,28,64)},0.65)`} strokeWidth={1} listening={false} />
        <Rect x={ROUT - 3} y={ROUT - 16} width={15} height={16}
          fill={`rgba(${clr(17,12,24)},0.97)`}
          stroke={`rgba(${clr(44,28,64)},0.65)`} strokeWidth={1} listening={false} />
        {/* Main base bar */}
        <Rect x={-ROUT - 12} y={ROUT} width={(ROUT + 12) * 2} height={9}
          fill={`rgba(${clr(14,10,20)},0.98)`}
          stroke={`rgba(${clr(48,30,70)},0.70)`} strokeWidth={1} listening={false} />
        {/* Lower step */}
        <Rect x={-ROUT - 6} y={ROUT + 9} width={(ROUT + 6) * 2} height={6}
          fill={`rgba(${clr(10,7,15)},0.98)`}
          stroke={`rgba(${clr(36,22,52)},0.60)`} strokeWidth={1} listening={false} />
      </>
    }
    case 'sha_rift': {
      // Sha of Pride ground rift — players soak it
      const flicker = 0.70 + 0.30 * Math.sin(t * 8.5)
      const glow    = 0.50 + 0.35 * Math.sin(t * 3.8)
      const crack   = [
        -30,-1, -22,-3, -14,2, -6,-2,  0,3,  6,-1, 14,3, 22,-2, 30,1,
         30, 1,  22, 2,  14,-2,  6,2,  0,-2, -6,1,-14,-2,-22, 3,-30,1,
      ]
      return <>
        <Ellipse radiusX={36} radiusY={12}
          fill={`rgba(${clr(40,100,220)},${glow * 0.18})`} listening={false} />
        <Ellipse radiusX={30} radiusY={9} fill="transparent"
          stroke={`rgba(${clr(80,160,255)},${glow * 0.55})`} strokeWidth={1.5} listening={false} />
        <Line closed points={crack}
          fill={`rgba(${clr(0,10,60)},0.95)`}
          stroke={`rgba(${clr(100,190,255)},${flicker})`} strokeWidth={1.2} listening={false} />
        <Line points={[-26,0, -16,-1, -6,1, 4,-1, 14,1, 26,0]}
          stroke={`rgba(${clr(200,230,255)},${flicker * 0.95})`} strokeWidth={2} lineCap="round" listening={false} />
        {[0,1,2,3].map(i => {
          const spark = (t * 3 + i * 0.25) % 1
          return <Circle key={i}
            x={-18 + i * 12} y={-3 - spark * 12}
            radius={1.5 - spark * 0.8}
            fill={`rgba(${clr(200,230,255)},${(1 - spark) * flicker})`} listening={false} />
        })}
      </>
    }
    case 'banish_wall': {
      // Sha of Pride banishment maze barrier — symmetric wall centered at origin
      const pulse = 0.75 + 0.25 * Math.sin(t * 1.6)
      const L = 350
      return <>
        <Rect x={-L} y={-16} width={L * 2} height={32}
          fill={`rgba(${clr(40,0,90)},${pulse * 0.28})`} listening={false} />
        <Rect x={-L} y={-9} width={L * 2} height={18}
          fill={`rgba(${clr(90,20,170)},${pulse * 0.50})`} listening={false} />
        <Rect x={-L} y={-4} width={L * 2} height={8}
          fill={`rgba(${clr(180,80,255)},${pulse * 0.80})`} listening={false} />
        <Line points={[-L,-9, L,-9]}
          stroke={`rgba(${clr(140,50,230)},${pulse * 0.65})`} strokeWidth={1.5} listening={false} />
        <Line points={[-L, 9, L, 9]}
          stroke={`rgba(${clr(140,50,230)},${pulse * 0.65})`} strokeWidth={1.5} listening={false} />
        <Line points={[-L, 0, L, 0]}
          stroke={`rgba(${clr(230,170,255)},${pulse})`} strokeWidth={2.5} listening={false} />
        {Array.from({length: 5}, (_, i) => {
          const x  = -L * 0.7 + i * L * 0.35
          const fa = 0.35 + 0.45 * Math.sin(t * 2.5 + i * 1.3)
          return <Circle key={i} x={x} y={0}
            radius={4 + 2 * Math.sin(t * 2 + i)}
            fill={`rgba(${clr(200,120,255)},${fa})`} listening={false} />
        })}
      </>
    }
    default:
      return null
  }
}

function EffectAbove({ effect, t }) {
  switch (effect) {
    case 'exclamation': {
      const yOff = -44 - Math.abs(Math.sin(t * 4)) * 7
      const a = 0.75 + 0.25 * Math.sin(t * 4)
      return <Text text="!" x={-7} y={yOff} fontSize={24} fontStyle="bold"
        fill={`rgba(255,225,0,${a})`} shadowColor="rgba(0,0,0,0.9)" shadowBlur={5} listening={false} />
    }
    case 'sleep': {
      return [0, 0.4, 0.72].map((off, i) => {
        const pct = (t * 0.5 + off) % 1
        const yOff = -34 - pct * 18
        const xOff = 12 + i * 7
        const sz = 8 + i * 3
        return <Text key={i} text="Z" x={xOff} y={yOff} fontSize={sz}
          fill={`rgba(100,160,255,${(1 - pct) * 0.95})`}
          fontStyle="bold" shadowColor="rgba(0,0,80,0.6)" shadowBlur={4} listening={false} />
      })
    }
    case 'stun': {
      return Array.from({ length: 5 }, (_, i) => {
        const angle = (i / 5 * 360 + t * 200) * Math.PI / 180
        return <Text key={i} text="★"
          x={Math.cos(angle) * 28 - 5} y={-32 + Math.sin(angle) * 9 - 5}
          fontSize={10} fill="rgba(255,220,0,0.95)"
          shadowColor="rgba(255,160,0,0.8)" shadowBlur={4} listening={false} />
      })
    }
    case 'bleed': {
      return [0, 0.35, 0.67].map((off, i) => {
        const pct = (t * 0.7 + off) % 1
        const x = (i - 1) * 10
        const y = 18 + pct * 28
        return <Circle key={i} x={x} y={y} radius={3.5 - pct * 1.5}
          fill={`rgba(200,0,0,${(1 - pct) * 0.95})`} listening={false} />
      })
    }
    case 'dispel': {
      return Array.from({ length: 6 }, (_, i) => {
        const angle = (i * 60 + t * 130) * Math.PI / 180
        const dist = 24 + 5 * Math.sin(t * 3 + i)
        const a = 0.7 + 0.3 * Math.sin(t * 3 + i * 1.2)
        return <Circle key={i}
          x={Math.cos(angle) * dist} y={Math.sin(angle) * dist}
          radius={3} fill={`rgba(180,240,255,${a})`}
          shadowColor="rgba(100,220,255,0.8)" shadowBlur={6} listening={false} />
      })
    }
    case 'enrage': {
      const yOff = -40 - Math.abs(Math.sin(t * 6)) * 4
      const a = 0.9 + 0.1 * Math.sin(t * 6)
      return <Text text="!!" x={-9} y={yOff} fontSize={16} fontStyle="bold"
        fill={`rgba(255,80,0,${a})`} shadowColor="rgba(200,30,0,0.9)" shadowBlur={6} listening={false} />
    }
    case 'sap': {
      return Array.from({ length: 5 }, (_, i) => {
        const angle = (i * 72 + t * 180) * Math.PI / 180
        const dist = 24 + 4 * Math.sin(t * 2 + i)
        const a = 0.75 + 0.25 * Math.sin(t * 2 + i * 1.2)
        return <Circle key={i}
          x={Math.cos(angle) * dist} y={Math.sin(angle) * dist - 5}
          radius={3} fill={`rgba(255,220,30,${a})`}
          shadowColor="rgba(255,200,0,0.8)" shadowBlur={5} listening={false} />
      })
    }
    case 'cast': {
      const pct = (t * 0.7) % 1
      const a = (1 - pct) * 0.85
      return <Circle x={0} y={-38 - pct * 10} radius={4 + pct * 3}
        fill={`rgba(255,200,0,${a})`}
        shadowColor="rgba(255,200,0,0.8)" shadowBlur={6} listening={false} />
    }
    case 'interrupt': {
      const yOff = -42 - Math.abs(Math.sin(t * 3)) * 4
      const a = 0.85 + 0.15 * Math.sin(t * 3)
      return <Text text="!" x={-5} y={yOff} fontSize={18} fontStyle="bold"
        fill={`rgba(255,50,50,${a})`} shadowColor="rgba(180,0,0,0.9)" shadowBlur={5} listening={false} />
    }
    case 'fixate': {
      const a = 0.80 + 0.20 * Math.sin(t * 4)
      return <Text text="👁" x={-10} y={-50} fontSize={18} opacity={a} listening={false} />
    }
    case 'taunt': {
      const yOff = -42 - Math.abs(Math.sin(t * 3)) * 4
      const a = 0.85 + 0.15 * Math.sin(t * 3)
      return <Text text="!" x={-5} y={yOff} fontSize={18} fontStyle="bold"
        fill={`rgba(255,80,0,${a})`} shadowColor="rgba(200,30,0,0.9)" shadowBlur={5} listening={false} />
    }
    case 'froststun':
      return <FrostStunEffect t={t} />
    case 'fear': {
      return Array.from({ length: 3 }, (_, i) => {
        const angle = (t * 1.8 + i * (Math.PI * 2 / 3))
        const rx = Math.cos(angle) * 18
        const ry = -38 + Math.sin(angle) * 7
        return <Text key={i} text="?" x={rx - 4} y={ry} fontSize={14} fontStyle="bold"
          fill={`rgba(200,140,255,${0.75 + 0.25 * Math.sin(t * 3 + i)})`}
          shadowColor="rgba(120,0,200,0.8)" shadowBlur={4} listening={false} />
      })
    }
    case 'silence': {
      const a = 0.75 + 0.25 * Math.sin(t * 4)
      return <Text text="🔇" x={-10} y={-52} fontSize={19} opacity={a} listening={false} />
    }
    case 'bomb': {
      const a = 0.7 + 0.3 * Math.abs(Math.sin(t * 5))
      return <Text text="💣" x={-11} y={-52} fontSize={20} opacity={a} listening={false} />
    }
    case 'kill': {
      const a = 0.82 + 0.18 * Math.sin(t * 4.2)
      return <Text text="💀" x={-11} y={-54 + Math.sin(t * 1.5) * 2} fontSize={22} opacity={a} listening={false} />
    }
    case 'berserk': {
      const a = 0.92 + 0.08 * Math.sin(t * 7)
      return <Text text="!!" x={-10} y={-44 - Math.abs(Math.sin(t * 7)) * 3} fontSize={17} fontStyle="bold"
        fill={`rgba(255,0,0,${a})`} shadowColor="rgba(180,0,0,0.9)" shadowBlur={8} listening={false} />
    }
    case 'polymorph': {
      const cols = ['255,75,75', '75,175,255', '75,255,130', '255,195,0', '200,75,255']
      return Array.from({ length: 9 }, (_, i) => {
        const angle = (i / 9 * Math.PI * 2) + t * 2.4
        const dist  = 22 + 5 * Math.sin(t * 3.2 + i)
        const a     = 0.65 + 0.35 * Math.sin(t * 3.2 + i * 0.85)
        return <Circle key={i}
          x={Math.cos(angle)*dist} y={-28 + Math.sin(angle)*8}
          radius={2.5}
          fill={`rgba(${cols[i % cols.length]},${a})`}
          shadowColor={`rgba(${cols[i % cols.length]},0.8)`} shadowBlur={4} listening={false} />
      })
    }
    case 'burn': {
      return [0, 0.26, 0.52, 0.78].map((off, i) => {
        const pct = (t * 1.3 + off) % 1
        const x   = (i - 1.5) * 8 + Math.sin(t * 3.2 + i) * 3.5
        const y   = 12 - pct * 38
        const sz  = 3.5 - pct * 2.2
        if (sz <= 0) return null
        return <Circle key={i} x={x} y={y} radius={sz}
          fill={`rgba(255,${130 + Math.floor(pct*90)},0,${(1-pct) * 0.92})`} listening={false} />
      })
    }
    case 'disease': {
      return [0, 0.38, 0.72].map((off, i) => {
        const pct = (t * 0.55 + off) % 1
        const x   = (i - 1) * 9 + Math.sin(t * 2.2 + i) * 3
        const y   = 14 - pct * 30
        return <Circle key={i} x={x} y={y} radius={3 - pct * 1.2}
          fill={`rgba(140,188,0,${(1-pct) * 0.88})`}
          stroke={`rgba(160,220,0,${(1-pct) * 0.5})`} strokeWidth={0.8} listening={false} />
      })
    }
    case 'wound': {
      return [0, 0.28, 0.60].map((off, i) => {
        const pct = (t * 0.85 + off) % 1
        const x   = (i - 1) * 11
        const y   = 18 + pct * 34
        return <Circle key={i} x={x} y={y} radius={4 - pct * 2.2}
          fill={`rgba(182,0,12,${(1-pct) * 0.95})`} listening={false} />
      })
    }
    case 'levitate': {
      return [0, 0.34, 0.68].map((off, i) => {
        const pct = (t * 0.48 + off) % 1
        const x   = (i - 1) * 12 + Math.sin(t * 1.5 + i) * 4
        const y   = -28 - pct * 26
        return <Circle key={i} x={x} y={y} radius={2.5 + (1-i) * 0.4}
          fill={`rgba(218,225,255,${(1-pct) * 0.80})`}
          shadowColor="rgba(180,190,255,0.6)" shadowBlur={5} listening={false} />
      })
    }
    case 'spiritshift': {
      const pct = (t * 0.5) % 1
      const a   = (1 - pct) * 0.6
      return <>
        <Circle x={8 * pct} y={-30 - pct * 22} radius={14 - pct * 4}
          fill="transparent" stroke={`rgba(175,195,255,${a})`} strokeWidth={1.5} listening={false} />
        <Circle x={8 * pct} y={-30 - pct * 22 - 12} radius={7 - pct * 2}
          fill="transparent" stroke={`rgba(175,195,255,${a * 0.7})`} strokeWidth={1} listening={false} />
      </>
    }
    case 'cyclone': {
      const a = 0.6 + 0.35 * Math.sin(t * 5)
      return Array.from({ length: 4 }, (_, i) => {
        const angle = (i / 4 * Math.PI * 2) + t * 5.5
        const dist  = 18 + 4 * Math.sin(t * 4 + i)
        return <Line key={i}
          points={[Math.cos(angle)*10, -32 + Math.sin(angle)*8,
                   Math.cos(angle)*dist, -32 + Math.sin(angle)*dist*0.4]}
          stroke={`rgba(140,210,255,${a * (0.5 + 0.5 * Math.sin(t * 4 + i))})`}
          strokeWidth={1.8} lineCap="round" listening={false} />
      })
    }
    case 'phase': {
      const a    = 0.85 + 0.15 * Math.sin(t * 3)
      const yOff = -52 + Math.sin(t * 1.8) * 3
      return <Text text="⚡" x={-9} y={yOff} fontSize={18} opacity={a} listening={false} />
    }
    default:
      return null
  }
}

function useDarkBgRemoved(iconImg, size, threshold = 35) {
  return useMemo(() => {
    if (!iconImg) return null
    const c = document.createElement('canvas')
    c.width = size; c.height = size
    const ctx = c.getContext('2d')
    ctx.drawImage(iconImg, 0, 0, size, size)
    const id = ctx.getImageData(0, 0, size, size)
    const d  = id.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < threshold && d[i+1] < threshold && d[i+2] < threshold) d[i+3] = 0
    }
    ctx.putImageData(id, 0, 0)
    return c
  }, [iconImg, size])
}

function FrostStunEffect({ t }) {
  const raw  = useImage('/icons/spell_frost_stun.jpg')
  const img  = useDarkBgRemoved(raw, 64)
  const SIZE = 28
  const yOff = -32 - Math.sin(t * 2.5) * 3
  const rot  = t * 110
  if (!img) return null
  return (
    <Image image={img} x={0} y={yOff} width={SIZE} height={SIZE}
      offsetX={SIZE / 2} offsetY={SIZE / 2} rotation={rot} opacity={0.95} listening={false} />
  )
}

// ─── Text highlight effects ───────────────────────────────────────────────────

const TEXT_HIGHLIGHT_KEYS = new Set(TEXT_HIGHLIGHTS.filter(h => h.key !== 'none').map(h => h.key))
const TEXT_HIGHLIGHT_GROUP = { label: 'Text Effects', effects: TEXT_HIGHLIGHTS.filter(h => h.key !== 'none') }
const DEFAULT_TEXT_DIMS = { w: 70, h: 22, padY: 6 }

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function TextHighlightEffect({ effect, dims, t, color }) {
  const { w, h, padY } = dims
  const top    = -padY
  const bottom = -padY + h
  const mid    = -padY + h / 2
  const rgb    = hexToRgb(color ?? '#ffd94d')

  switch (effect) {
    case 'pointer': {
      const bounce = 5 + Math.abs(Math.sin(t * 3)) * 7
      const a = 0.8 + 0.2 * Math.sin(t * 3)
      return (
        <Arrow
          points={[0, top - 22 - bounce, 0, top - 5]}
          stroke={`rgba(${rgb},${a})`} fill={`rgba(${rgb},${a})`}
          strokeWidth={2.5} pointerLength={9} pointerWidth={8} listening={false}
        />
      )
    }
    case 'triangle': {
      const bounce = 4 + Math.abs(Math.sin(t * 2.8)) * 9
      const a = 0.8 + 0.2 * Math.sin(t * 2.8)
      const s = 10
      return (
        <Line
          points={[-s, top - 12 - bounce, s, top - 12 - bounce, 0, top - 3 - bounce]}
          closed={true}
          fill={`rgba(${rgb},${a})`} stroke={`rgba(${rgb},${a})`}
          strokeWidth={1} listening={false}
        />
      )
    }
    case 'chevrons': {
      return [0, 1, 2].map(i => {
        const phase = ((t * 1.5 + i * 0.5) % 3)
        const a = phase < 1 ? phase * 0.7 : phase < 2 ? 0.7 : (3 - phase) * 0.7
        const y = top - 10 - i * 10
        return (
          <Line key={i}
            points={[-9, y + 8, 0, y, 9, y + 8]}
            stroke={`rgba(${rgb},${a})`}
            strokeWidth={2.2} lineCap="round" lineJoin="round" listening={false}
          />
        )
      })
    }
    case 'ring': {
      const pulse = Math.sin(t * 2)
      const a = 0.40 + 0.28 * pulse
      const exp = 2 + 2 * pulse
      return (
        <Rect
          x={-w / 2 - 6 - exp} y={top - 5 - exp}
          width={w + 12 + exp * 2} height={h + 10 + exp * 2}
          fill="transparent" stroke={`rgba(${rgb},${a})`}
          strokeWidth={2} cornerRadius={6} listening={false}
        />
      )
    }
    case 'spin-ring': {
      const a = 0.55 + 0.3 * Math.sin(t * 1.8)
      const rot = (t * 45) % 360
      return (
        <Ellipse
          x={0} y={mid}
          radiusX={w / 2 + 10} radiusY={h / 2 + 8}
          stroke={`rgba(${rgb},${a})`} strokeWidth={2}
          fill="transparent" dash={[8, 5]}
          rotation={rot} listening={false}
        />
      )
    }
    case 'ping': {
      const phase = (t * 0.7) % 1
      const outerR = 15 + 55 * phase
      const outerA = (1 - phase) * 0.6
      const pulseR = 8 + 3 * Math.sin(t * 4)
      return <>
        <Circle x={0} y={mid} radius={outerR}
          fill="transparent" stroke={`rgba(${rgb},${outerA})`} strokeWidth={2.5} listening={false} />
        <Circle x={0} y={mid} radius={pulseR}
          fill={`rgba(${rgb},0.3)`} stroke={`rgba(${rgb},0.6)`} strokeWidth={1.5} listening={false} />
      </>
    }
    case 'sparkle': {
      return Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6 * Math.PI * 2) + t * 1.2
        const rx = w / 2 + 18
        const ry = h / 2 + 14
        const a = 0.6 + 0.3 * Math.sin(t * 3 + i * 1.2)
        return (
          <Text key={i}
            text={i % 2 === 0 ? '✦' : '·'}
            x={Math.cos(angle) * rx - 5} y={mid + Math.sin(angle) * ry - 5}
            fontSize={i % 2 === 0 ? 9 : 6}
            fill={`rgba(${rgb},${a})`} listening={false}
          />
        )
      })
    }
    case 'bracket': {
      const shift = 3 + 2 * Math.abs(Math.sin(t * 1.8))
      const a = 0.65 + 0.30 * Math.sin(t * 1.8)
      const col = `rgba(${rgb},${a})`
      const bw = 7, y0 = top - 4, y1 = bottom + 4
      const lx = -w / 2 - 8 - shift, rx = w / 2 + 8 + shift
      return <>
        <Line points={[lx + bw, y0, lx, y0, lx, y1, lx + bw, y1]}
          stroke={col} strokeWidth={2.5} lineCap="round" lineJoin="round" listening={false} />
        <Line points={[rx - bw, y0, rx, y0, rx, y1, rx - bw, y1]}
          stroke={col} strokeWidth={2.5} lineCap="round" lineJoin="round" listening={false} />
      </>
    }
    case 'corner-ticks': {
      const a = 0.5 + 0.4 * Math.sin(t * 2)
      const col = `rgba(${rgb},${a})`
      const L = 7, x0 = -w / 2 - 5, x1 = w / 2 + 5, y0 = top - 4, y1 = bottom + 4
      return <>
        <Line points={[x0, y0 + L, x0, y0, x0 + L, y0]}
          stroke={col} strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
        <Line points={[x1 - L, y0, x1, y0, x1, y0 + L]}
          stroke={col} strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
        <Line points={[x0, y1 - L, x0, y1, x0 + L, y1]}
          stroke={col} strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
        <Line points={[x1 - L, y1, x1, y1, x1, y1 - L]}
          stroke={col} strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
      </>
    }
    case 'glow': {
      const pulse = Math.sin(t * 1.5)
      const a = 0.14 + 0.08 * pulse
      const exp = 7 + 4 * pulse
      const [rr, gg, bb] = (color ?? '#ffd94d').slice(1).match(/.{2}/g).map(x => parseInt(x, 16))
      return (
        <Rect
          x={-w / 2 - exp} y={top - exp}
          width={w + exp * 2} height={h + exp * 2}
          fill={`rgba(${rgb},${a})`} cornerRadius={9}
          shadowColor={`rgba(${rr},${gg},${bb},0.9)`} shadowBlur={20} shadowEnabled={true}
          listening={false}
        />
      )
    }
    case 'underline': {
      const a = 0.6 + 0.3 * Math.sin(t * 2)
      const scl = 0.7 + 0.3 * Math.abs(Math.sin(t * 1.5))
      return (
        <Rect
          x={-w * scl / 2} y={bottom + 5}
          width={w * scl} height={3}
          fill={`rgba(${rgb},${a})`} cornerRadius={1.5} listening={false}
        />
      )
    }
    case 'arrows-in': {
      const a = 0.7 + 0.3 * Math.sin(t * 2.5)
      const col = `rgba(${rgb},${a})`
      const tip = 8 + 3 * Math.abs(Math.sin(t * 2.5))
      const dx = w / 2 + 30, dy = h / 2 + 22
      return <>
        {[[0, top - dy, 0, top - tip], [0, bottom + dy, 0, bottom + tip],
          [-dx, mid, -tip, mid], [dx, mid, tip, mid]].map(([x1, y1, x2, y2], i) => (
          <Arrow key={i} points={[x1, y1, x2, y2]}
            stroke={col} fill={col} strokeWidth={1.8}
            pointerLength={7} pointerWidth={6} listening={false} />
        ))}
      </>
    }
    default:
      return null
  }
}

// ─── Player marker ────────────────────────────────────────────────────────────

function PlayerMarker({
  player, pos, classOverride, isSelected, isMultiSelected, isPlaying, tool, effectTime,
  onAction, onDragEnd, onDragEndMulti, groupRef, onDragStart, onDragMove, onShowContextMenu,
  onSnapDragMove, onSnapDragEnd, onHoverObject,
}) {
  const effectiveClassKey = classOverride?.classKey ?? player.classKey
  const effectiveSpecKey  = classOverride?.specKey  ?? player.specKey ?? null

  const cls  = WOW_CLASSES.find(c => c.key === effectiveClassKey)
            ?? ROLE_ICONS.find(r => r.key === effectiveClassKey)
            ?? ENEMY_TYPES.find(e => e.key === effectiveClassKey)
  const isEnemy  = cls?.isEnemy ?? false
  const isLocked = player.locked ?? false
  const spec = effectiveSpecKey ? cls?.specs?.find(s => s.key === effectiveSpecKey) : null
  const iconImg    = useImage(spec ? spec.icon : cls?.icon)
  const redTintImg = useRedTintCanvas(iconImg, 36, 36)
  const color      = cls?.color ?? '#888'
  const borderColor = (effectiveClassKey === 'melee' || effectiveClassKey === 'ranged') ? '#cc2222' : color
  const R_BASE = 18
  const scale  = player.scale ?? 1
  const R      = R_BASE * scale

  const t = (player.effectStopped) ? 0 : effectTime
  const { x: offX, y: offY } = getEffectOffset(player.effect, t)

  const handleClick = (e) => {
    e.cancelBubble = true
    if (e.evt.button !== 0) return
    if (isLocked) {
      if (tool === 'select') onAction(player.id, 'select')
      return
    }
    if (tool === 'delete') onAction(player.id, 'delete')
    else if (tool === 'select') onAction(player.id, 'select')
  }
  const handleMouseDown = (e) => {
    e.cancelBubble = true
    if (e.evt.button === 1) {
      e.evt.preventDefault()
      if (!isLocked) onAction(player.id, 'delete')
    }
  }
  const handleContextMenu = (e) => {
    e.evt.preventDefault()
    e.cancelBubble = true
    onShowContextMenu({ type: 'player', id: player.id, x: e.evt.clientX, y: e.evt.clientY,
      canvasX: pos.x, canvasY: pos.y,
      scale: player.scale ?? 1, rotation: player.rotation ?? 0, isEnemy,
      classKey: effectiveClassKey, specKey: effectiveSpecKey,
      classIcon: cls?.icon ?? null, specs: cls?.specs ?? [],
      hasClassOverride: !!classOverride,
      label: player.canvasLabel ?? '', name: player.name ?? '',
      labelStyle: player.labelStyle ?? 'plain',
      labelFont: player.labelFont ?? 'cinzel',
      labelColor: player.labelColor ?? null,
      effect: player.effect ?? null,
      effectStopped: player.effectStopped ?? false,
      locked: isLocked,
    })
  }

  const redFlashAlpha = player.effect === 'redflash'
    ? 0.08 + 0.52 * (0.5 + 0.5 * Math.sin(t * 2.5))
    : 0

  const iconOverlay =
    player.effect === 'cloak'    ? `rgba(5,0,12,${0.55 + 0.10 * Math.sin(t * 1.4)})`
    : player.effect === 'iceblock' ? `rgba(105,195,255,${0.38 + 0.12 * Math.sin(t * 1.2)})`
    : null

  return (
    <Group
      ref={groupRef}
      x={pos.x + offX} y={pos.y + offY}
      rotation={player.rotation ?? 0}
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onDragStart={e => {
        e.target.to({ scaleX: 1.08, scaleY: 1.08, shadowEnabled: true, shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.5)', shadowOffset: { x: 2, y: 5 }, shadowOpacity: 0.45, duration: 0.12 })
        if (isMultiSelected && onDragStart) onDragStart(player.id, e.target.x(), e.target.y())
      }}
      onDragMove={e => {
        if (isMultiSelected && onDragMove) onDragMove(e, player.id)
        else onSnapDragMove?.(e, 'player', player.id)
      }}
      onDragEnd={e => {
        e.target.to({ scaleX: 1, scaleY: 1, shadowEnabled: false, duration: 0.1 })
        onSnapDragEnd?.()
        if (isMultiSelected) {
          onDragEndMulti(player.id, e.target.x(), e.target.y())
        } else {
          onDragEnd(e)
        }
      }}
      onMouseEnter={() => onHoverObject?.({ type: 'player', id: player.id,
        classKey: effectiveClassKey, specKey: effectiveSpecKey,
        name: player.name, scale: player.scale ?? 1, rotation: player.rotation ?? 0,
        effect: player.effect ?? null, effectStopped: player.effectStopped ?? false,
        label: player.canvasLabel ?? '',
        labelStyle: player.labelStyle ?? 'plain', labelFont: player.labelFont ?? 'cinzel',
        labelColor: player.labelColor ?? null,
        canvasX: pos.x, canvasY: pos.y })}
      onMouseLeave={() => onHoverObject?.(null)}
    >
      {player.effect && <Group listening={false}><EffectBehind effect={player.effect} color={color} t={t} /></Group>}

      {(isSelected || isMultiSelected) && (isEnemy
        ? <Rect x={-(R+5)} y={-(R+5)} width={(R+5)*2} height={(R+5)*2}
            fill="transparent" stroke={isSelected ? '#c8a95f' : '#44aaff'} strokeWidth={2.5} dash={[5, 3]} listening={false} />
        : <Circle radius={R + 5} fill="transparent"
            stroke={isSelected ? '#c8a95f' : '#44aaff'} strokeWidth={2.5} dash={[5, 3]} listening={false} />
      )}

      <Group scaleX={scale} scaleY={scale} listening={false}>
        {isEnemy ? (
          <Group clipFunc={ctx => { ctx.rect(-R_BASE, -R_BASE, R_BASE * 2, R_BASE * 2) }}>
            {iconImg
              ? <Image image={iconImg} x={-R_BASE} y={-R_BASE} width={R_BASE * 2} height={R_BASE * 2} />
              : <Rect x={-R_BASE} y={-R_BASE} width={R_BASE * 2} height={R_BASE * 2} fill="rgba(0,0,0,0.01)" />}
            {redFlashAlpha > 0 && redTintImg && (
              <Image image={redTintImg} x={-R_BASE} y={-R_BASE} width={R_BASE*2} height={R_BASE*2}
                opacity={redFlashAlpha} listening={false} />
            )}
            {iconOverlay && (
              <Rect x={-R_BASE} y={-R_BASE} width={R_BASE*2} height={R_BASE*2}
                fill={iconOverlay} listening={false} />
            )}
          </Group>
        ) : (
          <>
            <Group clipFunc={ctx => { ctx.arc(0, 0, R_BASE, 0, Math.PI * 2) }}>
              {iconImg
                ? <Image image={iconImg} x={-R_BASE} y={-R_BASE} width={R_BASE * 2} height={R_BASE * 2} />
                : <Circle radius={R_BASE} fill={color} />}
              {redFlashAlpha > 0 && redTintImg && (
                <Image image={redTintImg} x={-R_BASE} y={-R_BASE} width={R_BASE*2} height={R_BASE*2}
                  opacity={redFlashAlpha} listening={false} />
              )}
              {iconOverlay && (
                <Rect x={-R_BASE} y={-R_BASE} width={R_BASE*2} height={R_BASE*2}
                  fill={iconOverlay} listening={false} />
              )}
            </Group>
            <Circle radius={R_BASE} fill="transparent" stroke={borderColor} strokeWidth={2.5} />
          </>
        )}
      </Group>

      {/* Hit area — always base icon size regardless of scale */}
      {isEnemy
        ? <Rect x={-R_BASE} y={-R_BASE} width={R_BASE*2} height={R_BASE*2} fill="rgba(0,0,0,0.01)" />
        : <Circle radius={R_BASE} fill="rgba(0,0,0,0.01)" />
      }

      <TokenLabel
        text={player.canvasLabel}
        lx={-R * 1.8} ly={R + 3} lw={R * 3.6} fontSize={9}
        color='#ffffff'
      />

      {/* Lock indicator */}
      {isLocked && (
        <Text text="🔒" x={R - 6} y={-R - 14} fontSize={10} listening={false} />
      )}

      {/* Frame-override indicator */}
      {classOverride && (
        <Circle x={R_BASE - 4} y={-(R_BASE - 4)} radius={4}
          fill="#b58900" stroke="#f7f3e6" strokeWidth={1} listening={false} />
      )}

      {player.effect && <Group listening={false}><EffectAbove effect={player.effect} t={t} /></Group>}
    </Group>
  )
}

// ─── Swirl ────────────────────────────────────────────────────────────────────

const SWIRL_LAYERS = [
  { back: 200, opacity: 0.015, r: 20,  g: 55,  b: 180 },
  { back: 150, opacity: 0.030, r: 25,  g: 70,  b: 200 },
  { back: 100, opacity: 0.055, r: 30,  g: 90,  b: 220 },
  { back: 70,  opacity: 0.090, r: 40,  g: 115, b: 240 },
  { back: 45,  opacity: 0.140, r: 55,  g: 140, b: 255 },
  { back: 28,  opacity: 0.220, r: 70,  g: 165, b: 255 },
  { back: 16,  opacity: 0.350, r: 90,  g: 190, b: 255 },
  { back: 8,   opacity: 0.550, r: 130, g: 215, b: 255 },
  { back: 4,   opacity: 0.750, r: 175, g: 235, b: 255 },
]

function SwirlOverlay({ swirl, swirlAngle, beamLen, isPlaying, tool, onMoveSwirl, onRemoveSwirl, onContextMenu }) {
  // When playing, the angle is driven by swirlAngle. When paused/stopped the swirl
  // freezes at a fixed angle so nothing animates while editing a paused frame.
  const angle = isPlaying ? swirlAngle : 0
  const baseAngle  = (swirl.clockwise ? angle : -angle) - 90
  const radLeading = baseAngle * (Math.PI / 180)
  const lineX = Math.cos(radLeading) * beamLen
  const lineY = Math.sin(radLeading) * beamLen

  return (
    <Group
      x={swirl.x} y={swirl.y}
      draggable={!isPlaying && tool === 'select'}
      onDragEnd={e => onMoveSwirl(swirl.id, e.target.x(), e.target.y())}
      onClick={e => { e.cancelBubble = true; if (e.evt.button !== 0) return; if (tool === 'delete') onRemoveSwirl(swirl.id) }}
      onMouseDown={e => {
        e.cancelBubble = true
        if (e.evt.button === 1) { e.evt.preventDefault(); onRemoveSwirl(swirl.id) }
      }}
      onContextMenu={e => { e.evt.preventDefault(); e.cancelBubble = true; onContextMenu?.(e, swirl.id) }}
    >
      {SWIRL_LAYERS.map((l, i) => (
        <Wedge key={i} radius={beamLen} angle={l.back} rotation={baseAngle - l.back}
          fill={`rgba(${l.r},${l.g},${l.b},${l.opacity})`} listening={false} />
      ))}
      <Wedge radius={beamLen} angle={3} rotation={baseAngle - 1.5}
        fill="rgba(210,245,255,0.88)" listening={false} />
      <Line points={[0, 0, lineX, lineY]}
        stroke="rgba(230,250,255,0.95)" strokeWidth={3}
        shadowColor="rgba(120,210,255,1)" shadowBlur={10} listening={false} />
      <Circle radius={10} fill="rgba(140,210,255,0.9)"
        shadowColor="rgba(80,180,255,1)" shadowBlur={18} />
      {!isPlaying && <Text text="Swirl" x={13} y={-8} fontSize={10} fill="rgba(120,200,255,0.85)" />}
    </Group>
  )
}

// ─── World marker ─────────────────────────────────────────────────────────────

function MarkerElement({ marker, isPlaying, tool, onMoveMarker, onRemoveMarker, onShowContextMenu, onObjectFocus, onHoverObject, onSnapDragMove, onSnapDragEnd, groupRef, isMultiSelected, onMultiDragStart, onMultiDragMove, onMultiDragEnd }) {
  const def      = WORLD_MARKERS.find(m => m.key === marker.type)
  const iconImg  = useImage(def?.icon ?? null)
  const isLocked = marker.locked ?? false
  const R        = 18 * (marker.scale ?? 1)

  const handleContextMenu = (e) => {
    e.evt.preventDefault()
    e.cancelBubble = true
    onShowContextMenu({ type: 'marker', id: marker.id, x: e.evt.clientX, y: e.evt.clientY,
      canvasX: marker.x, canvasY: marker.y,
      markerType: marker.type,
      scale: marker.scale ?? 1, label: marker.canvasLabel ?? '',
      locked: isLocked,
    })
  }

  return (
    <Group
      x={marker.x} y={marker.y}
      ref={groupRef}
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onDragStart={e => {
        e.target.to({ scaleX: 1.08, scaleY: 1.08, shadowEnabled: true, shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.5)', shadowOffset: { x: 2, y: 5 }, shadowOpacity: 0.45, duration: 0.12 })
        if (isMultiSelected) onMultiDragStart?.('marker', marker.id, marker.x, marker.y)
      }}
      onDragMove={e => {
        onSnapDragMove?.(e, 'marker', marker.id)
        if (isMultiSelected) onMultiDragMove?.(e, 'marker', marker.id)
      }}
      onDragEnd={e => {
        e.target.to({ scaleX: 1, scaleY: 1, shadowEnabled: false, duration: 0.1 })
        onSnapDragEnd?.()
        if (isMultiSelected) onMultiDragEnd?.('marker', marker.id, e.target.x(), e.target.y())
        else onMoveMarker(marker.id, e.target.x(), e.target.y())
      }}
      onClick={e => {
        e.cancelBubble = true
        if (e.evt.button !== 0) return
        if (!isLocked && tool === 'delete') onRemoveMarker(marker.id)
        else if (tool === 'select') onObjectFocus?.({ type: 'marker', id: marker.id,
          markerType: marker.type, scale: marker.scale ?? 1,
          label: marker.canvasLabel ?? '', locked: isLocked,
          canvasX: marker.x, canvasY: marker.y })
      }}
      onMouseDown={e => {
        e.cancelBubble = true
        if (e.evt.button === 1) { e.evt.preventDefault(); if (!isLocked) onRemoveMarker(marker.id) }
      }}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => onHoverObject?.({ type: 'marker', id: marker.id,
        markerType: marker.type, scale: marker.scale ?? 1,
        label: marker.canvasLabel ?? '', locked: isLocked,
        canvasX: marker.x, canvasY: marker.y })}
      onMouseLeave={() => onHoverObject?.(null)}
    >
      {isMultiSelected && (
        <Circle radius={R + 5} fill="transparent" stroke="#44aaff" strokeWidth={2} dash={[4, 3]} listening={false} />
      )}
      {iconImg
        ? <Image image={iconImg} x={-R} y={-R} width={R * 2} height={R * 2} />
        : <>
            <Circle radius={R} fill={def?.color ?? '#fff'} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
            <Text text={def?.symbol ?? '?'} fontSize={18} x={-9} y={-11}
              fill={def?.textColor ?? '#000'} listening={false} />
          </>
      }
      {marker.canvasLabel && (
        <Text text={marker.canvasLabel} x={-R * 1.8} y={R + 3} width={R * 3.6} align="center"
          fontSize={9} fill="#ddd" shadowColor="#000" shadowBlur={3} listening={false} />
      )}
      {isLocked && (
        <Text text="🔒" x={R - 6} y={-R - 14} fontSize={10} listening={false} />
      )}
    </Group>
  )
}

// ─── Boss element ─────────────────────────────────────────────────────────────

function BossElement({ boss, tool, isPlaying, effectTime, onMoveBoss, onRemoveBoss, onShowContextMenu, onObjectFocus, onHoverObject, onSnapDragMove, onSnapDragEnd, groupRef, isMultiSelected, onMultiDragStart, onMultiDragMove, onMultiDragEnd }) {
  const imgImmerseus  = useImage(BOSS_IMAGES['immerseus'])
  const imgRook       = useImage(BOSS_IMAGES['rook-stonetoe'])
  const imgHe         = useImage(BOSS_IMAGES['he-softfoot'])
  const imgSun        = useImage(BOSS_IMAGES['sun-tenderheart'])
  const imgDefaultAdd = useImage(BOSS_IMAGES['default-add'])
  const imgNorushen      = useImage(BOSS_IMAGES['norushen'])
  const imgShaOfPride    = useImage(BOSS_IMAGES['sha-of-pride'])
  const imgShaOfViolence = useImage(BOSS_IMAGES['sha-of-violence'])
  const imgFoulManif     = useImage(BOSS_IMAGES['foul-manifestation'])
  const imgDragonmaw     = useImage(BOSS_IMAGES['dragonmaw-guard'])
  const imgGalakras      = useImage(BOSS_IMAGES['galakras'])
  const imgDemolisher    = useImage(BOSS_IMAGES['beachhead-demolisher'])
  const imgSiegecrafter  = useImage(BOSS_IMAGES['siegecrafter-blackfuse'])
  const imgOrcImpaled    = useImage(BOSS_IMAGES['orc-impaled'])
  const imgIronJugg      = useImage(BOSS_IMAGES['iron-juggernaut'])
  const imgCrawlerMine   = useImage(BOSS_IMAGES['crawler-mine'])
  const imgIronHunter    = useImage(BOSS_IMAGES['iron-hunter'])
  const imgIronMage      = useImage(BOSS_IMAGES['iron-mage'])
  const imgIronPriest    = useImage(BOSS_IMAGES['iron-priest'])
  const imgGarrosh       = useImage(BOSS_IMAGES['garrosh-hellscream'])
  const imgNazgrim       = useImage(BOSS_IMAGES['general-nazgrim'])
  const imgNazMage       = useImage(BOSS_IMAGES['naz-mage'])
  const imgNazCommon     = useImage(BOSS_IMAGES['naz-common'])
  const imgNazRogue      = useImage(BOSS_IMAGES['naz-rogue'])
  const imgNazShaman     = useImage(BOSS_IMAGES['naz-shaman'])
  const imgNazSniper     = useImage(BOSS_IMAGES['naz-sniper'])
  const imgNazBanner     = useImage(BOSS_IMAGES['naz-banner'])
  const imgNazHTT        = useImage(BOSS_IMAGES['naz-htt'])
  const imgThok          = useImage(BOSS_IMAGES['thok'])
  const imgMap = {
    immerseus: imgImmerseus, 'rook-stonetoe': imgRook, 'he-softfoot': imgHe,
    'sun-tenderheart': imgSun, 'default-add': imgDefaultAdd, norushen: imgNorushen,
    'sha-of-pride': imgShaOfPride, 'sha-of-violence': imgShaOfViolence, 'foul-manifestation': imgFoulManif,
    'dragonmaw-guard': imgDragonmaw, galakras: imgGalakras, 'beachhead-demolisher': imgDemolisher,
    'siegecrafter-blackfuse': imgSiegecrafter, 'orc-impaled': imgOrcImpaled,
    'iron-juggernaut': imgIronJugg, 'crawler-mine': imgCrawlerMine,
    'crawler-mine-1': imgCrawlerMine, 'crawler-mine-2': imgCrawlerMine, 'crawler-mine-3': imgCrawlerMine,
    'iron-hunter': imgIronHunter, 'iron-mage': imgIronMage, 'iron-priest': imgIronPriest,
    'garrosh-hellscream': imgGarrosh,
    'general-nazgrim': imgNazgrim,
    'naz-mage': imgNazMage, 'naz-common': imgNazCommon, 'naz-rogue': imgNazRogue,
    'naz-shaman': imgNazShaman, 'naz-sniper': imgNazSniper, 'naz-banner': imgNazBanner,
    'naz-htt': imgNazHTT,
    thok: imgThok,
  }
  const img      = imgMap[boss.type] ?? null
  const mineNum  = boss.type?.startsWith('crawler-mine-') ? boss.type.slice(-1) : null
  const isLocked = boss.locked ?? false
  const sc       = boss.scale ?? 1
  const bossColor = BOSS_CONFIGS.flatMap(b => b.bossSidebarItems).find(s => s.bossType === boss.type)?.color ?? '#c8a227'
  const isCharacter = boss.type !== 'immerseus'
  const t = (boss.effectStopped) ? 0 : effectTime
  const bossRedflashA = boss.effect === 'redflash'
    ? 0.08 + 0.52 * (0.5 + 0.5 * Math.sin(t * 2.5))
    : 0
  const TYPE_CH = { 'rook-stonetoe': 145, 'sun-tenderheart': 130 }
  const CH = TYPE_CH[boss.type] ?? 120
  const CW = img && isCharacter && img.naturalHeight > 0
    ? Math.round((img.naturalWidth / img.naturalHeight) * CH)
    : 70
  const tintW = isCharacter ? CW : 160
  const tintH = isCharacter ? CH : 160
  const redTintImg = useRedTintCanvas(img, tintW, tintH)

  const handleContextMenu = (e) => {
    e.evt.preventDefault()
    e.cancelBubble = true
    onShowContextMenu({ type: 'boss', id: boss.id, x: e.evt.clientX, y: e.evt.clientY,
      canvasX: boss.x, canvasY: boss.y,
      bossType: boss.type,
      scale: sc, label: boss.canvasLabel ?? '',
      labelStyle: boss.labelStyle ?? 'plain',
      labelFont: boss.labelFont ?? 'cinzel',
      labelColor: boss.labelColor ?? null,
      locked: isLocked,
      effect: boss.effect ?? null,
      effectStopped: boss.effectStopped ?? false,
    })
  }

  return (
    <Group
      x={boss.x} y={boss.y}
      ref={groupRef}
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onDragStart={e => {
        e.target.to({ scaleX: 1.08, scaleY: 1.08, shadowEnabled: true, shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.5)', shadowOffset: { x: 2, y: 5 }, shadowOpacity: 0.45, duration: 0.12 })
        if (isMultiSelected) onMultiDragStart?.('boss', boss.id, boss.x, boss.y)
      }}
      onDragMove={e => {
        onSnapDragMove?.(e, 'boss', boss.id)
        if (isMultiSelected) onMultiDragMove?.(e, 'boss', boss.id)
      }}
      onDragEnd={e => {
        e.target.to({ scaleX: 1, scaleY: 1, shadowEnabled: false, duration: 0.1 })
        onSnapDragEnd?.()
        if (isMultiSelected) onMultiDragEnd?.('boss', boss.id, e.target.x(), e.target.y())
        else onMoveBoss(boss.id, e.target.x(), e.target.y())
      }}
      onClick={e => {
        e.cancelBubble = true
        if (e.evt.button !== 0) return
        if (!isLocked && tool === 'delete') onRemoveBoss(boss.id)
        else if (tool === 'select') onObjectFocus?.({ type: 'boss', id: boss.id, bossType: boss.type,
          scale: sc, label: boss.canvasLabel ?? '', labelStyle: boss.labelStyle ?? 'plain',
          labelFont: boss.labelFont ?? 'cinzel', labelColor: boss.labelColor ?? null,
          locked: isLocked, effect: boss.effect ?? null, effectStopped: boss.effectStopped ?? false,
          canvasX: boss.x, canvasY: boss.y })
      }}
      onMouseDown={e => {
        e.cancelBubble = true
        if (e.evt.button === 1) { e.evt.preventDefault(); if (!isLocked) onRemoveBoss(boss.id) }
      }}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => onHoverObject?.({ type: 'boss', id: boss.id, bossType: boss.type,
        scale: sc, label: boss.canvasLabel ?? '', labelStyle: boss.labelStyle ?? 'plain',
        labelFont: boss.labelFont ?? 'cinzel', labelColor: boss.labelColor ?? null,
        locked: isLocked, effect: boss.effect ?? null, effectStopped: boss.effectStopped ?? false,
        canvasX: boss.x, canvasY: boss.y })}
      onMouseLeave={() => onHoverObject?.(null)}
    >
      {boss.effect && boss.effect !== 'redflash' && <Group listening={false}><EffectBehind effect={boss.effect} color="#cc3333" t={t} /></Group>}
      {isMultiSelected && (
        <Rect
          x={-(CW / 2 + 5) * sc} y={(-CH - 5) * sc}
          width={(CW + 10) * sc} height={(CH + 10) * sc}
          fill="transparent" stroke="#44aaff" strokeWidth={2} dash={[4, 3]} listening={false}
        />
      )}
      <Group scaleX={sc} scaleY={sc}>
        {isCharacter ? (
          <>
            <Rect x={-CW / 2} y={-CH} width={CW} height={CH} fill="rgba(0,0,0,0.01)" />
            {img && <Image image={img} x={-CW / 2} y={-CH} width={CW} height={CH} listening={false} />}
            {bossRedflashA > 0 && redTintImg && (
              <Image image={redTintImg} x={-CW / 2} y={-CH} width={CW} height={CH}
                opacity={bossRedflashA} listening={false} />
            )}
          </>
        ) : (
          <>
            <Circle radius={80} fill="rgba(0,0,0,0.01)" />
            {img && (
              <Group clipFunc={ctx => {
                ctx.beginPath()
                ctx.moveTo(-80, -80)
                ctx.lineTo(80, -80)
                ctx.lineTo(80, 30)
                ctx.quadraticCurveTo(76, 52, 2, 56)
                ctx.lineTo(-2, 56)
                ctx.quadraticCurveTo(-76, 52, -80, 30)
                ctx.closePath()
              }} listening={false}>
                <Image image={img} x={-80} y={-80} width={160} height={160} listening={false} />
                {bossRedflashA > 0 && redTintImg && (
                  <Image image={redTintImg} x={-80} y={-80} width={160} height={160}
                    opacity={bossRedflashA} listening={false} />
                )}
              </Group>
            )}
          </>
        )}
      </Group>
      {mineNum && (
        // All-blue numbered assignment badge above the mine's head (no black parts).
        // Flat square, sharp corners, to match the reference screenshot.
        <Group scaleX={sc} scaleY={sc} listening={false}>
          {/* dark-blue frame */}
          <Rect x={-23} y={-CH - 54} width={46} height={46} fill="#0e3a86" />
          {/* blue beveled face */}
          <Rect x={-20} y={-CH - 51} width={40} height={40}
            fillLinearGradientStartPoint={{ x: 0, y: -CH - 51 }}
            fillLinearGradientEndPoint={{ x: 0, y: -CH - 11 }}
            fillLinearGradientColorStops={[0, '#54a6f5', 1, '#1f6fd0']} />
          {/* top highlight for the bevel */}
          <Rect x={-15} y={-CH - 47} width={30} height={8} fill="#9fd0ff" opacity={0.55} />
          <Text text={mineNum} x={-20} y={-CH - 51} width={40} height={40}
            align="center" verticalAlign="middle" fontSize={28} fontStyle="bold"
            fill="#ffffff" shadowColor="#0e3a86" shadowBlur={2} />
        </Group>
      )}
      <TokenLabel
        text={boss.canvasLabel}
        lx={isCharacter ? -(CW / 2) * sc : -70}
        ly={isCharacter ? 6 : 80 * sc + 6}
        lw={isCharacter ? CW * sc : 140}
        fontSize={12}
        color='#ffffff'
      />
      {isLocked && (
        <Text text="🔒"
          x={isCharacter ? (CW / 2) * sc - 6 : 70 * sc - 6}
          y={isCharacter ? -CH * sc - 4 : -80 * sc - 14}
          fontSize={10} listening={false}
        />
      )}
      {boss.effect && <Group listening={false}><EffectAbove effect={boss.effect} t={t} /></Group>}
    </Group>
  )
}

// ─── Text background ─────────────────────────────────────────────────────────

let _measureCtx = null
function measureTextWidth(text, fontSize, fontFamily, fontStyle = 'normal') {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d')
  _measureCtx.font = `${fontStyle} ${fontSize}px ${fontFamily}`
  return _measureCtx.measureText(text).width
}

// Render segments [{text, color}] as multiple positioned Text nodes across lines
function RichTextLines({ segments, defaultColor, fontSize, fontStyle, fontFamily, x, width, align }) {
  const lineHeight = fontSize * 1.2
  // Split segments into lines on \n
  const lines = []
  let cur = []
  for (const seg of segments) {
    const parts = seg.text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) cur.push({ text: parts[i], color: seg.color })
      if (i < parts.length - 1) { lines.push(cur); cur = [] }
    }
  }
  lines.push(cur)

  return lines.flatMap((line, li) => {
    const lineWidth = line.reduce((sum, s) => sum + measureTextWidth(s.text, fontSize, fontFamily, fontStyle), 0)
    let startX = x ?? 0
    if (align === 'center' && width) startX = (x ?? 0) + (width - lineWidth) / 2
    else if (align === 'right' && width) startX = (x ?? 0) + width - lineWidth
    let cx = startX
    return line.map((seg, si) => {
      const sw = measureTextWidth(seg.text, fontSize, fontFamily, fontStyle)
      const sx = cx; cx += sw
      return <Text key={`${li}-${si}`}
        x={sx} y={li * lineHeight}
        text={seg.text}
        fontSize={fontSize} fontStyle={fontStyle} fontFamily={fontFamily}
        fill={seg.color ?? defaultColor}
        shadowColor="rgba(0,0,0,0.8)" shadowBlur={4} shadowOffset={{ x: 1, y: 1 }}
        />
    })
  })
}

function computeBgDims(textEl) {
  const fs         = textEl.fontSize   ?? 16
  const fontFamily = textEl.fontFamily ?? 'sans-serif'
  const lines      = (textEl.text || ' ').split('\n')
  const isPill = textEl.bgStyle === 'pill' || textEl.bgStyle === 'pill-grey'
  const padX = isPill ? 18 : 10, padY = 7
  const maxW = Math.max(...lines.map(l => measureTextWidth(l || ' ', fs, fontFamily)), 1)
  const w = maxW + padX * 2
  const h = lines.length * fs * 1.2 + padY * 2
  return { w, h, padX, padY }
}

function TextBackground({ textEl }) {
  const style = textEl.bgStyle ?? 'none'
  if (style === 'none') return null

  const { w, h, padX, padY } = computeBgDims(textEl)
  const x = -w / 2, y = -padY

  switch (style) {
    // ── kept ──────────────────────────────────────────────────────────────
    case 'rounded':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(15,15,35,0.88)" stroke="rgba(180,180,220,0.55)" strokeWidth={1.5}
        cornerRadius={8} listening={false} />

    // ── solid dark fills ───────────────────────────────────────────────────
    case 'black':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(0,0,0,0.97)" stroke="rgba(80,80,80,0.5)" strokeWidth={1}
        cornerRadius={3} listening={false} />
    case 'charcoal':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(28,28,28,0.96)" stroke="rgba(100,100,100,0.45)" strokeWidth={1.5}
        cornerRadius={4} listening={false} />
    case 'dark-grey':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(48,48,48,0.94)" stroke="rgba(110,110,110,0.4)" strokeWidth={1}
        cornerRadius={3} listening={false} />
    case 'matte':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(12,12,12,0.95)" listening={false} />

    // ── semi-transparent darks ─────────────────────────────────────────────
    case 'smoke':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(30,30,30,0.75)" stroke="rgba(140,140,140,0.3)" strokeWidth={1}
        listening={false} />
    case 'glass':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(10,10,10,0.45)" stroke="rgba(180,180,180,0.35)" strokeWidth={1}
        cornerRadius={4} listening={false} />
    case 'ghost':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(0,0,0,0.20)" stroke="rgba(200,200,200,0.25)" strokeWidth={1}
        cornerRadius={3} listening={false} />
    case 'fog':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(80,80,80,0.55)" stroke="rgba(160,160,160,0.4)" strokeWidth={1}
        cornerRadius={3} listening={false} />

    // ── light / white ──────────────────────────────────────────────────────
    case 'white':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(255,255,255,0.95)" stroke="rgba(180,180,180,0.7)" strokeWidth={1}
        cornerRadius={3} listening={false} />
    case 'light-grey':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(200,200,200,0.92)" stroke="rgba(140,140,140,0.5)" strokeWidth={1}
        cornerRadius={3} listening={false} />
    case 'silver':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(180,180,190,0.90)" stroke="rgba(120,120,130,0.55)" strokeWidth={1.5}
        cornerRadius={4} listening={false} />
    case 'cream':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(240,235,220,0.93)" stroke="rgba(180,170,140,0.55)" strokeWidth={1}
        cornerRadius={3} listening={false} />

    // ── outlines only ──────────────────────────────────────────────────────
    case 'outline':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(0,0,0,0)" stroke="rgba(255,255,255,0.88)" strokeWidth={1.5}
        cornerRadius={4} listening={false} />
    case 'outline-grey':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(0,0,0,0)" stroke="rgba(160,160,160,0.85)" strokeWidth={1.5}
        cornerRadius={4} listening={false} />
    case 'outline-dark':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(0,0,0,0)" stroke="rgba(40,40,40,0.9)" strokeWidth={2}
        cornerRadius={4} listening={false} />

    // ── left bar accents ───────────────────────────────────────────────────
    case 'grey-bar':
      return <>
        <Rect x={x} y={y} width={w} height={h}
          fill="rgba(15,15,15,0.93)" stroke="rgba(60,60,60,0.4)" strokeWidth={1}
          listening={false} />
        <Rect x={x} y={y} width={5} height={h}
          fill="rgba(160,160,160,0.90)" listening={false} />
      </>
    case 'white-bar':
      return <>
        <Rect x={x} y={y} width={w} height={h}
          fill="rgba(15,15,15,0.93)" stroke="rgba(60,60,60,0.4)" strokeWidth={1}
          listening={false} />
        <Rect x={x} y={y} width={5} height={h}
          fill="rgba(240,240,240,0.95)" listening={false} />
      </>
    case 'silver-bar':
      return <>
        <Rect x={x} y={y} width={w} height={h}
          fill="rgba(20,20,20,0.93)" stroke="rgba(70,70,70,0.4)" strokeWidth={1}
          listening={false} />
        <Rect x={x} y={y} width={5} height={h}
          fill="rgba(192,192,192,0.92)" listening={false} />
      </>

    // ── top + bottom plates ────────────────────────────────────────────────
    case 'plate-grey':
      return <>
        <Rect x={x} y={y} width={w} height={h}
          fill="rgba(12,12,12,0.94)" stroke="rgba(50,50,50,0.5)" strokeWidth={1}
          listening={false} />
        <Rect x={x} y={y} width={w} height={3}
          fill="rgba(150,150,150,0.88)" listening={false} />
        <Rect x={x} y={y+h-3} width={w} height={3}
          fill="rgba(150,150,150,0.88)" listening={false} />
      </>
    case 'plate-white':
      return <>
        <Rect x={x} y={y} width={w} height={h}
          fill="rgba(10,10,10,0.94)" stroke="rgba(50,50,50,0.5)" strokeWidth={1}
          listening={false} />
        <Rect x={x} y={y} width={w} height={3}
          fill="rgba(235,235,235,0.92)" listening={false} />
        <Rect x={x} y={y+h-3} width={w} height={3}
          fill="rgba(235,235,235,0.92)" listening={false} />
      </>

    // ── double / inset border ──────────────────────────────────────────────
    case 'double':
      return <>
        <Rect x={x} y={y} width={w} height={h}
          fill="rgba(8,8,8,0.96)" stroke="rgba(220,220,220,0.85)" strokeWidth={1.5}
          cornerRadius={4} listening={false} />
        <Rect x={x+3} y={y+3} width={w-6} height={h-6}
          fill="transparent" stroke="rgba(120,120,120,0.4)" strokeWidth={1}
          cornerRadius={3} listening={false} />
      </>
    case 'inset':
      return <>
        <Rect x={x} y={y} width={w} height={h}
          fill="rgba(18,18,18,0.95)" stroke="rgba(80,80,80,0.5)" strokeWidth={1}
          cornerRadius={4} listening={false} />
        <Rect x={x+3} y={y+3} width={w-6} height={h-6}
          fill="transparent" stroke="rgba(160,160,160,0.35)" strokeWidth={1}
          cornerRadius={3} listening={false} />
      </>
    case 'deep':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(0,0,0,0.98)" stroke="rgba(255,255,255,0.80)" strokeWidth={2}
        cornerRadius={3} listening={false} />

    // ── pill ───────────────────────────────────────────────────────────────
    case 'pill':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(15,15,15,0.93)" stroke="rgba(120,120,120,0.55)" strokeWidth={1.5}
        cornerRadius={h / 2} listening={false} />
    case 'pill-grey':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(65,65,65,0.90)" stroke="rgba(160,160,160,0.5)" strokeWidth={1}
        cornerRadius={h / 2} listening={false} />

    // ── nameplate / caption ────────────────────────────────────────────────
    case 'nameplate':
      return <Rect x={x} y={y} width={w} height={h}
        fill="rgba(5,5,5,0.92)" stroke="rgba(130,130,130,0.70)" strokeWidth={2}
        listening={false} />
    case 'caption':
      return <>
        <Rect x={x} y={y} width={w} height={h}
          fill="rgba(0,0,0,0.65)" listening={false} />
        <Rect x={x} y={y+h-2} width={w} height={2}
          fill="rgba(200,200,200,0.70)" listening={false} />
      </>

    default:
      return null
  }
}

// ─── Text element ─────────────────────────────────────────────────────────────

// (text animations are one-shot — no period constant needed)

function applyTextAnim(anim, localT) {
  switch (anim) {
    case 'fadeIn':
      return { opacity: Math.min(1, localT / 0.55), scaleX: 1, scaleY: 1 }
    case 'popIn': {
      const p = Math.min(1.2, localT / 0.45)
      const scale = p <= 0 ? 0
        : p <= 0.7 ? (p / 0.7) * 1.18
        : p <= 1   ? 1.18 - ((p - 0.7) / 0.3) * 0.18
        : 1
      return { opacity: Math.min(1, p * 1.8), scaleX: Math.max(0, scale), scaleY: Math.max(0, scale) }
    }
    case 'slideDown': {
      const p = Math.min(1, localT / 0.42)
      return { opacity: Math.min(1, p * 2), scaleX: 1, scaleY: 1 }
    }
    case 'flash': {
      if (localT >= 0.48) return { opacity: 1, scaleX: 1, scaleY: 1 }
      const opacity = Math.floor(localT / 0.1) % 2 === 0 ? 1 : 0
      return { opacity, scaleX: 1, scaleY: 1 }
    }
    default:
      return { opacity: 1, scaleX: 1, scaleY: 1 }
  }
}

function RoleTagsDisplay({ textEl, dims }) {
  const tags = textEl.textRoleTags
  if (!tags || tags.length === 0) return null

  const fs       = textEl.fontSize ?? 16
  const iconSize = Math.max(16, Math.round(fs * 0.9))
  const gap      = 3
  const totalW   = tags.length * iconSize + (tags.length - 1) * gap
  const hasBg    = (textEl.bgStyle ?? 'none') !== 'none'
  const yAbove   = hasBg ? -(dims.padY + iconSize + 5) : -(iconSize + 5)

  return (
    <Group y={yAbove} listening={false}>
      {/* pill background behind icons */}
      <Rect
        x={-totalW / 2 - 4} y={-2}
        width={totalW + 8} height={iconSize + 4}
        fill="rgba(0,0,0,0.55)" cornerRadius={4}
      />
      {tags.map((role, i) => {
        const img = ROLE_TAG_IMAGES[role]
        if (!img) return null
        return (
          <Image
            key={role}
            x={-totalW / 2 + i * (iconSize + gap)}
            y={0}
            width={iconSize}
            height={iconSize}
            image={img}
          />
        )
      })}
    </Group>
  )
}

function TextElement({ textEl, isSelected, isPlaying, tool, effectTime, animTime, onAction, onDragEnd, onShowContextMenu, onHoverObject, onSnapDragMove, onSnapDragEnd, groupRef, isMultiSelected, onMultiDragStart, onMultiDragMove, onMultiDragEnd }) {
  const fs         = textEl.fontSize ?? 16
  const fontStyle  = textEl.bold ? 'bold' : 'normal'
  const fontFamily = textEl.fontFamily ?? 'sans-serif'
  const fill       = textEl.color ?? '#ffffff'
  const hasBg      = (textEl.bgStyle ?? 'none') !== 'none'
  const isLocked   = textEl.locked ?? false

  const anim    = textEl.textAnim ?? 'none'
  const localT  = animTime ?? effectTime ?? 0   // animTime resets per-frame; effectTime is the global clock
  const animProps = anim !== 'none' ? applyTextAnim(anim, localT) : null

  let displayText = textEl.text || ' '
  if (anim === 'typewriter') {
    const raw = textEl.text || ''
    const totalChars = raw.length
    const charsPerSec = Math.max(6, totalChars / 0.9)
    const visible = Math.min(totalChars, Math.floor(localT * charsPerSec))
    const done = visible >= totalChars
    displayText = raw.slice(0, visible) + (done ? '' : '▌')
    if (!displayText) displayText = '▌'
  }

  const handleClick = (e) => {
    e.cancelBubble = true
    if (e.evt.button !== 0) return
    if (tool === 'delete') { onAction(textEl.id, 'delete'); return }
    if (isLocked) {
      if (tool === 'select') onAction(textEl.id, 'select')
      return
    }
    onAction(textEl.id, 'select')
  }
  const handleMouseDown = (e) => {
    e.cancelBubble = true
    if (e.evt.button === 1) {
      e.evt.preventDefault()
      if (!isLocked) onAction(textEl.id, 'delete')
    }
  }
  const handleContextMenu = (e) => {
    e.evt.preventDefault()
    e.cancelBubble = true
    onShowContextMenu({ type: 'text', id: textEl.id, x: e.evt.clientX, y: e.evt.clientY, locked: isLocked, textEl })
  }

  const dims = computeBgDims(textEl)
  const { w: bgW, h: bgH, padY: bgPadY } = dims
  const textX     = hasBg ? -bgW / 2 : 0
  const textWidth = hasBg ? bgW      : undefined
  const textAlign = hasBg ? 'center' : undefined

  let selRect = null
  if (isSelected || isMultiSelected) {
    const strokeColor = isSelected ? '#c8a95f' : '#44aaff'
    if (hasBg) {
      selRect = <Rect x={-bgW/2 - 3} y={-bgPadY - 3} width={bgW + 6} height={bgH + 6}
        stroke={strokeColor} strokeWidth={1.5} dash={[4, 3]} fill="transparent" listening={false} />
    } else {
      const w = (textEl.text?.length ?? 1) * fs * 0.6 + 8
      const h = fs + 8
      selRect = <Rect x={-4} y={-4} width={w} height={h}
        stroke={strokeColor} strokeWidth={1.5} dash={[4, 3]} fill="transparent" listening={false} />
    }
  }

  return (
    <Group
      x={textEl.x} y={textEl.y}
      ref={groupRef}
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onDragStart={e => {
        e.target.to({ scaleX: 1.08, scaleY: 1.08, shadowEnabled: true, shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.5)', shadowOffset: { x: 2, y: 5 }, shadowOpacity: 0.45, duration: 0.12 })
        if (isMultiSelected) onMultiDragStart?.('text', textEl.id, textEl.x, textEl.y)
      }}
      onDragMove={e => {
        onSnapDragMove?.(e, 'text', textEl.id)
        if (isMultiSelected) onMultiDragMove?.(e, 'text', textEl.id)
      }}
      onDragEnd={e => {
        e.target.to({ scaleX: 1, scaleY: 1, shadowEnabled: false, duration: 0.1 })
        onSnapDragEnd?.()
        if (isMultiSelected) onMultiDragEnd?.('text', textEl.id, e.target.x(), e.target.y())
        else onDragEnd(e)
      }}
      onMouseEnter={() => onHoverObject?.({ type: 'text', textEl, canvasX: textEl.x, canvasY: textEl.y })}
      onMouseLeave={() => onHoverObject?.(null)}
    >
      {textEl.textHighlight && textEl.textHighlight !== 'none' && (
        <Group listening={false}>
          <TextHighlightEffect effect={textEl.textHighlight} dims={dims} t={effectTime ?? 0} color={textEl.textHighlightColor ?? '#ffd94d'} />
        </Group>
      )}
      <Group
        opacity={animProps?.opacity ?? 1}
        scaleX={animProps?.scaleX ?? 1}
        scaleY={animProps?.scaleY ?? 1}
      >
        <TextBackground textEl={textEl} />
        {textEl.segments?.length > 0 && anim !== 'typewriter'
          ? <RichTextLines
              segments={textEl.segments}
              defaultColor={fill}
              fontSize={fs} fontStyle={fontStyle} fontFamily={fontFamily}
              x={textX} width={textWidth} align={textAlign}
            />
          : <Text
              x={textX}
              text={displayText}
              fontSize={fs}
              fontStyle={fontStyle}
              fontFamily={fontFamily}
              fill={fill}
              width={textWidth}
              align={textAlign}
              lineHeight={1.2}
              shadowColor="rgba(0,0,0,0.8)"
              shadowBlur={4}
              shadowOffset={{ x: 1, y: 1 }}
            />
        }
      </Group>
      <RoleTagsDisplay textEl={textEl} dims={dims} />
      {selRect}
      {isLocked && (
        <Text text="🔒" x={hasBg ? bgW / 2 - 10 : 4} y={hasBg ? -bgPadY - 14 : -14}
          fontSize={9} listening={false} />
      )}
    </Group>
  )
}

// ─── Standalone field effect ──────────────────────────────────────────────────

function FieldEffectElement({ fe, tool, isPlaying, onMove, onRemove, onShowContextMenu, onObjectFocus, onHoverObject, effectTime, playElapsedTime, onSnapDragMove, onSnapDragEnd, groupRef, isMultiSelected, onMultiDragStart, onMultiDragMove, onMultiDragEnd }) {
  const isLocked = fe.locked ?? false
  const feScale  = fe.scale ?? 1
  return (
    <Group
      x={fe.x} y={fe.y}
      ref={groupRef}
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onDragStart={e => {
        e.target.to({ scaleX: 1.08, scaleY: 1.08, shadowEnabled: true, shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.5)', shadowOffset: { x: 2, y: 5 }, shadowOpacity: 0.45, duration: 0.12 })
        if (isMultiSelected) onMultiDragStart?.('field-effect', fe.id, fe.x, fe.y)
      }}
      onDragMove={e => {
        onSnapDragMove?.(e, 'field-effect', fe.id)
        if (isMultiSelected) onMultiDragMove?.(e, 'field-effect', fe.id)
      }}
      onDragEnd={e => {
        e.target.to({ scaleX: 1, scaleY: 1, shadowEnabled: false, duration: 0.1 })
        onSnapDragEnd?.()
        if (isMultiSelected) onMultiDragEnd?.('field-effect', fe.id, e.target.x(), e.target.y())
        else onMove(fe.id, e.target.x(), e.target.y())
      }}
      onMouseDown={e => {
        e.cancelBubble = true
        if (e.evt.button === 1) { e.evt.preventDefault(); if (!isLocked) onRemove(fe.id) }
      }}
      onContextMenu={e => {
        e.evt.preventDefault()
        e.cancelBubble = true
        onShowContextMenu({ type: 'field-effect', id: fe.id, x: e.evt.clientX, y: e.evt.clientY,
          canvasX: fe.x, canvasY: fe.y, effect: fe.effect,
          color: fe.color ?? null, scale: feScale, rotation: fe.rotation ?? 0,
          rotateSpeed: fe.rotateSpeed ?? 0, beamLength: fe.beamLength ?? 1,
          locked: isLocked, persistent: fe.persistent ?? false, stopped: fe.stopped ?? false })
      }}
      onMouseEnter={() => onHoverObject?.({ type: 'field-effect', id: fe.id, effect: fe.effect,
        color: fe.color ?? null, scale: feScale, rotation: fe.rotation ?? 0,
        rotateSpeed: fe.rotateSpeed ?? 0, beamLength: fe.beamLength ?? 1,
        locked: isLocked, persistent: fe.persistent ?? false, stopped: fe.stopped ?? false,
        canvasX: fe.x, canvasY: fe.y })}
      onMouseLeave={() => onHoverObject?.(null)}
    >
      {isMultiSelected && (
        <Circle radius={56 * feScale} fill="transparent" stroke="#44aaff" strokeWidth={2} dash={[4, 3]} listening={false} />
      )}
      <Circle radius={52 * feScale} fill="rgba(0,0,0,0.01)" />
      <Group scaleX={feScale * (fe.beamLength ?? 1)} scaleY={feScale}
        rotation={(fe.rotation ?? 0) + (fe.rotateSpeed ?? 0) * (playElapsedTime ?? 0)}
        listening={false}>
        {TEXT_HIGHLIGHT_KEYS.has(fe.effect)
          ? <TextHighlightEffect effect={fe.effect} dims={DEFAULT_TEXT_DIMS} t={fe.stopped ? 0 : effectTime} color={fe.color ?? '#ffd94d'} />
          : <>
              <EffectBehind effect={fe.effect} color="#c8a95f" colorOverride={fe.color ?? null} t={fe.stopped ? 0 : effectTime} />
              <EffectAbove  effect={fe.effect} t={fe.stopped ? 0 : effectTime} />
            </>
        }
      </Group>
      {!isPlaying && (
        <Circle radius={5} fill="rgba(200,169,95,0.55)"
          stroke="rgba(200,169,95,0.9)" strokeWidth={1.5} listening={false} />
      )}
      {isLocked && (
        <Text text="🔒" x={12} y={-32} fontSize={10} listening={false} />
      )}
    </Group>
  )
}

// ─── Label style helpers ──────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(200,162,39,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}


function TokenLabel({ text, lx, ly, lw, fontSize = 12, color = '#ffffff' }) {
  if (!text) return null
  return (
    <Text text={text} x={lx} y={ly} width={lw} align="center" fontSize={fontSize}
      fontFamily="'Cinzel', serif" fontStyle="bold"
      fill={color} shadowColor="#000" shadowBlur={5} shadowOpacity={0.7} listening={false} />
  )
}

// ─── Main canvas ──────────────────────────────────────────────────────────────

export default function RaidCanvas({
  stageRef, cursorPosRef,
  width, height, players, positions, arrows, swirls, swirlAngle, texts, markers, bosses, bgImage,
  keyframes, activeKeyframe,
  tool, setTool, isPlaying, playTimeSeconds,
  selectedId, selectedTextId, selectedIds,
  onSelectPlayer, onSetSelectedIds, onSelectText,
  onMovePlayer, onMoveSelected, onAddPlayer,
  onAddText, onAddArrow, onAddMarker, onAddBoss,
  onRemovePlayer, onRemoveArrow, onMoveArrow, onUpdateArrow,
  onMoveSwirl, onRemoveSwirl,
  onMoveText, onRemoveText,
  onMoveMarker, onRemoveMarker,
  onMoveBoss, onRemoveBoss,
  fieldEffects, onAddFieldEffect, onMoveFieldEffect, onRemoveFieldEffect, onUpdateFieldEffect,
  onUpdateText, onApplyTextSegmentColor,
  onUpdatePlayerScale, onUpdatePlayerRotation, onSetPlayerEffect, onUpdatePlayerSpec, onUpdatePlayerClass,
  onUpdatePlayerLabelStyle, onUpdateBossLabelStyle, onUpdatePlayerLabelColor, onUpdateBossLabelColor,
  onUpdatePlayerLabelFont, onUpdateBossLabelFont,
  onUpdateMarkerScale, onUpdateBossScale,
  onUpdatePlayerLabel, onUpdateMarkerLabel, onUpdateBossLabel,
  arrowStyle, onArrowStyleChange,
  snapEnabled, onToggleSnap,
  clipboard, onCopyObject, onPasteAt, onObjectFocus, onObjectHover,
  onTogglePlayerLocked, onToggleTextLocked, onToggleMarkerLocked,
  onToggleBossLocked, onToggleFieldEffectLocked,
  onToggleEffectStopped,
  onSetBossEffect, onToggleBossEffectStopped,
  onHideInFrame,
  onCopyToAllPages, onDuplicateToFrames, pageCount,
  swaps,
  onSetPlayerSwap, onRemovePlayerSwap, onSetSwapToFrame,
  onSetPlayerClassForFrames, onClearPlayerClassOverride,
}) {
  const bgImg   = useImage(bgImage)
  const beamLen = Math.max(width, height) * 1.6

  const [arrowStart,   setArrowStart]   = useState(null)
  const [mousePos,     setMousePos]     = useState({ x: 0, y: 0 })
  const [selectionBox, setSelectionBox] = useState(null)
  const [contextMenu,  setContextMenu]  = useState(null)
  const [selectedAll,  setSelectedAll]  = useState(new Set())
  const [openEffectGroups, setOpenEffectGroups] = useState(new Set())

  const selectionStartRef = useRef(null)
  const selectionBoxRef   = useRef(null)
  const isDraggingSelRef  = useRef(false)
  const ctxMenuRef        = useRef(null)
  const hoveredObjectRef  = useRef(null)

  useLayoutEffect(() => {
    const el = ctxMenuRef.current
    if (!el || !contextMenu) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    if (rect.right  > vw - 8) el.style.left = `${Math.max(8, vw - rect.width  - 8)}px`
    if (rect.bottom > vh - 8) el.style.top  = `${Math.max(8, vh - rect.height - 8)}px`
  }, [contextMenu])

  const wrapperRef            = useRef(null)
  const playerGroupRefs       = useRef({})
  const markerGroupRefs       = useRef({})
  const bossGroupRefs         = useRef({})
  const fieldEffectGroupRefs  = useRef({})
  const textGroupRefs         = useRef({})
  const dragStateRef    = useRef(null)
  const selectedIdsRef  = useRef(selectedIds)
  const selectedAllRef  = useRef(new Set())
  const positionsRef    = useRef(positions)
  const markersRef      = useRef(markers)
  const bossesRef       = useRef(bosses)
  const textsRef        = useRef(texts)
  const arrowsRef       = useRef(arrows)
  const fieldEffectsRef = useRef(fieldEffects)
  const swirlsRef       = useRef(swirls)
  useEffect(() => { selectedIdsRef.current = selectedIds },   [selectedIds])
  useEffect(() => { positionsRef.current   = positions },     [positions])
  useEffect(() => { markersRef.current      = markers },      [markers])
  useEffect(() => { bossesRef.current       = bosses },       [bosses])
  useEffect(() => { textsRef.current        = texts },        [texts])
  useEffect(() => { arrowsRef.current       = arrows },       [arrows])
  useEffect(() => { fieldEffectsRef.current = fieldEffects }, [fieldEffects])
  useEffect(() => { swirlsRef.current       = swirls },       [swirls])

  const snapEnabledRef = useRef(snapEnabled ?? true)
  useEffect(() => { snapEnabledRef.current = snapEnabled ?? true }, [snapEnabled])
  const [snapLines, setSnapLines] = useState({ v: [], h: [] })

  const getSnapPos = useCallback((x, y, excludeType, excludeId) => {
    const SNAP_THRESH = 8
    const pts = []
    Object.entries(positionsRef.current ?? {}).forEach(([id, pos]) => {
      if (excludeType === 'player' && id === excludeId) return
      pts.push({ x: pos.x, y: pos.y })
    })
    ;(markersRef.current ?? []).forEach(m => {
      if (excludeType === 'marker' && m.id === excludeId) return
      pts.push({ x: m.x, y: m.y })
    })
    ;(bossesRef.current ?? []).forEach(b => {
      if (excludeType === 'boss' && b.id === excludeId) return
      pts.push({ x: b.x, y: b.y })
    })
    ;(textsRef.current ?? []).forEach(t => {
      if (excludeType === 'text' && t.id === excludeId) return
      pts.push({ x: t.x, y: t.y })
    })
    ;(fieldEffectsRef.current ?? []).forEach(fe => {
      if (excludeType === 'field-effect' && fe.id === excludeId) return
      pts.push({ x: fe.x, y: fe.y })
    })
    if (pts.length === 0) return { x, y, vLines: [], hLines: [] }
    let snapX = x, snapY = y, minDX = SNAP_THRESH, minDY = SNAP_THRESH
    let didSnapX = false, didSnapY = false
    for (const pt of pts) {
      const dx = Math.abs(pt.x - x), dy = Math.abs(pt.y - y)
      if (dx < minDX) { minDX = dx; snapX = pt.x; didSnapX = true }
      if (dy < minDY) { minDY = dy; snapY = pt.y; didSnapY = true }
    }
    const vLines = didSnapX ? [...new Set(pts.filter(pt => Math.abs(pt.x - snapX) < 0.5).map(pt => pt.x))] : []
    const hLines = didSnapY ? [...new Set(pts.filter(pt => Math.abs(pt.y - snapY) < 0.5).map(pt => pt.y))] : []
    return { x: snapX, y: snapY, vLines, hLines }
  }, [])

  const handleTokenDragMove = useCallback((e, type, id) => {
    if (!snapEnabledRef.current) return
    const node = e.target
    const { x, y, vLines, hLines } = getSnapPos(node.x(), node.y(), type, id)
    node.x(x); node.y(y)
    setSnapLines({ v: vLines, h: hLines })
  }, [getSnapPos])

  const clearSnapLines = useCallback(() => setSnapLines({ v: [], h: [] }), [])

  const mountTimeRef = useRef(performance.now())
  const [effectTime, setEffectTime] = useState(0)
  const playStartEffectTimeRef = useRef(0)
  const prevIsPlayingRef = useRef(isPlaying)
  if (prevIsPlayingRef.current !== isPlaying) {
    prevIsPlayingRef.current = isPlaying
    if (isPlaying) playStartEffectTimeRef.current = effectTime
  }
  // playTimeSeconds (from PlanViewer) is scrubber-accurate; fall back to wall-clock elapsed for the editor
  const playElapsedTime = playTimeSeconds ?? (isPlaying ? Math.max(0, effectTime - playStartEffectTimeRef.current) : 0)
  const effectRafRef = useRef(null)
  const hasAnyEffect   = Object.values(players).some(p => p.effect)
  const hasAnyBossEffect = (bosses ?? []).some(b => b.effect)
  const hasAnyFieldFx  = (fieldEffects ?? []).length > 0
  const hasAnyTextAnim      = (texts ?? []).some(t => t.textAnim && t.textAnim !== 'none')
  const hasAnyTextHighlight = (texts ?? []).some(t => t.textHighlight && t.textHighlight !== 'none')
  const needsAnimClock = hasAnyEffect || hasAnyBossEffect || hasAnyFieldFx || hasAnyTextAnim || hasAnyTextHighlight

  // Per-frame text animation time — resets to 0 whenever the texts array changes
  // (i.e. when the active keyframe changes during playback). Updated inline during
  // render (not in useEffect) so the base is correct on the very first paint of
  // each keyframe, keeping text intro animations in sync with player effects.
  const textAnimBaseRef = useRef(0)
  const prevTextsRef    = useRef(texts)
  if (prevTextsRef.current !== texts) {
    prevTextsRef.current = texts
    textAnimBaseRef.current = (performance.now() - mountTimeRef.current) / 1000
  }
  const textAnimTime = Math.max(0, effectTime - textAnimBaseRef.current)

  // Sync effectTime to true elapsed wall-clock before browser paints so all effects
  // in a frame start from the same time reference (eliminates staggered appearance).
  useLayoutEffect(() => {
    if (needsAnimClock) setEffectTime((performance.now() - mountTimeRef.current) / 1000)
  }, [needsAnimClock])

  useEffect(() => {
    // Only run the effect clock during playback. While paused/stopped the frame is a
    // still image — effects freeze so nothing animates while editing. (In the read-only
    // viewer isPlaying is always true, so effects animate there as normal.)
    if (!needsAnimClock || !isPlaying) return
    const base = (performance.now() - mountTimeRef.current) / 1000
    let rafStart = null
    let lastUpdate = -1
    const STEP = 1 / 60  // cap canvas redraws from effects at 60fps
    const tick = (ts) => {
      if (!rafStart) rafStart = ts
      const now = base + (ts - rafStart) / 1000
      if (now - lastUpdate >= STEP) {
        lastUpdate = now
        setEffectTime(now)
      }
      effectRafRef.current = requestAnimationFrame(tick)
    }
    effectRafRef.current = requestAnimationFrame(tick)
    return () => { if (effectRafRef.current) cancelAnimationFrame(effectRafRef.current) }
  }, [needsAnimClock, isPlaying])

  useEffect(() => {
    const ARROW_DELTAS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (!e.shiftKey) return
      }
      if (e.key === 'Escape') { setArrowStart(null); setContextMenu(null) }
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) onToggleSnap?.()

      const delta = ARROW_DELTAS[e.key]
      if (!delta) return
      const step = e.shiftKey ? 10 : 1
      const dx = delta[0] * step, dy = delta[1] * step

      const sel = selectedAllRef.current
      if (sel.size > 0) {
        e.preventDefault()
        for (const item of sel) {
          const sep = item.indexOf(':'), type = item.slice(0, sep), id = item.slice(sep + 1)
          if (type === 'player') {
            const pos = positionsRef.current[id]
            if (pos) onMovePlayer(id, pos.x + dx, pos.y + dy)
          } else if (type === 'marker') {
            const m = markersRef.current?.find(m => m.id === id)
            if (m) onMoveMarker(id, m.x + dx, m.y + dy)
          } else if (type === 'boss') {
            const b = bossesRef.current?.find(b => b.id === id)
            if (b) onMoveBoss(id, b.x + dx, b.y + dy)
          } else if (type === 'text') {
            const t = textsRef.current?.find(t => t.id === id)
            if (t) onUpdateText(id, { x: t.x + dx, y: t.y + dy })
          } else if (type === 'field-effect') {
            const fe = fieldEffectsRef.current?.find(fe => fe.id === id)
            if (fe) onMoveFieldEffect(id, fe.x + dx, fe.y + dy)
          } else if (type === 'swirl') {
            const s = swirlsRef.current?.find(s => s.id === id)
            if (s) onMoveSwirl(id, s.x + dx, s.y + dy)
          } else if (type === 'arrow') {
            onMoveArrow(id, dx, dy)
          }
        }
      } else if (selectedId) {
        const pos = positionsRef.current[selectedId]
        if (pos) { e.preventDefault(); onMovePlayer(selectedId, pos.x + dx, pos.y + dy) }
      } else if (selectedTextId) {
        const t = textsRef.current?.find(t => t.id === selectedTextId)
        if (t) { e.preventDefault(); onUpdateText(selectedTextId, { x: t.x + dx, y: t.y + dy }) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onToggleSnap, selectedId, selectedTextId,
      onMovePlayer, onMoveMarker, onMoveBoss, onUpdateText, onMoveFieldEffect, onMoveSwirl, onMoveArrow])

  useEffect(() => {
    if (!contextMenu) return
    const handler = (e) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  useEffect(() => {
    const handleMouseUp = () => {
      if (!selectionStartRef.current) return
      const wasDragging = isDraggingSelRef.current
      selectionStartRef.current = null
      isDraggingSelRef.current  = false

      if (wasDragging && selectionBoxRef.current) {
        const box = selectionBoxRef.current
        const inBox = new Set(
          Object.entries(positionsRef.current)
            .filter(([, p]) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h)
            .map(([id]) => id)
        )
        const allInBox = new Set([...inBox].map(id => `player:${id}`))
        const inB = (v) => v >= box.x && v <= box.x + box.w
        const inBY = (v) => v >= box.y && v <= box.y + box.h
        for (const b of bossesRef.current       ?? []) { if (inB(b.x)                   && inBY(b.y))                   allInBox.add(`boss:${b.id}`) }
        for (const t of textsRef.current        ?? []) { if (inB(t.x)                   && inBY(t.y))                   allInBox.add(`text:${t.id}`) }
        for (const a of arrowsRef.current       ?? []) { if (inB((a.x1+a.x2)/2)         && inBY((a.y1+a.y2)/2))         allInBox.add(`arrow:${a.id}`) }
        for (const fe of fieldEffectsRef.current ?? []) { if (inB(fe.x)                  && inBY(fe.y))                  allInBox.add(`field-effect:${fe.id}`) }
        for (const s of swirlsRef.current       ?? []) { if (inB(s.x)                   && inBY(s.y))                   allInBox.add(`swirl:${s.id}`) }
        setSelectedAll(allInBox)
        selectedAllRef.current = allInBox
        onSetSelectedIds(inBox)
      } else {
        setSelectedAll(new Set())
        selectedAllRef.current = new Set()
        onSetSelectedIds(new Set())
      }
      selectionBoxRef.current = null
      setSelectionBox(null)
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [onSetSelectedIds])

  const handleShowContextMenu = useCallback((info) => {
    if (info.type === 'player') {
      setContextMenu({ ...info, classScope: 'all', classScopeFrames: new Set() })
    } else {
      setContextMenu(info)
    }
  }, [])

  const handleMultiDragStart = useCallback((type, id, startX, startY) => {
    const startPositions = {}
    for (const sel of selectedAllRef.current) {
      const sep = sel.indexOf(':')
      const selType = sel.slice(0, sep)
      const selId   = sel.slice(sep + 1)
      let pos
      if (selType === 'player')            pos = positionsRef.current[selId]
      else if (selType === 'marker')       pos = markersRef.current?.find(m => m.id === selId)
      else if (selType === 'boss')         pos = bossesRef.current?.find(b => b.id === selId)
      else if (selType === 'field-effect') pos = fieldEffectsRef.current?.find(fe => fe.id === selId)
      else if (selType === 'text')         pos = textsRef.current?.find(t => t.id === selId)
      if (pos) startPositions[sel] = { x: pos.x, y: pos.y }
      // Lift all followers (leader lifts itself in its own onDragStart)
      if (sel !== `${type}:${id}`) {
        let node
        if (selType === 'player')            node = playerGroupRefs.current[selId]
        else if (selType === 'marker')       node = markerGroupRefs.current[selId]
        else if (selType === 'boss')         node = bossGroupRefs.current[selId]
        else if (selType === 'field-effect') node = fieldEffectGroupRefs.current[selId]
        else if (selType === 'text')         node = textGroupRefs.current[selId]
        node?.to({ scaleX: 1.08, scaleY: 1.08, shadowEnabled: true, shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.5)', shadowOffset: { x: 2, y: 5 }, shadowOpacity: 0.45, duration: 0.12 })
      }
    }
    dragStateRef.current = { type, id, startX, startY, dx: 0, dy: 0, startPositions }
  }, [])

  const handleMultiDragMove = useCallback((e, type, id) => {
    const ds = dragStateRef.current
    if (!ds || ds.id !== id || ds.type !== type) return
    const dx = e.target.x() - ds.startX
    const dy = e.target.y() - ds.startY
    ds.dx = dx
    ds.dy = dy
    for (const sel of selectedAllRef.current) {
      if (sel === `${type}:${id}`) continue
      const sep = sel.indexOf(':')
      const selType = sel.slice(0, sep)
      const selId   = sel.slice(sep + 1)
      let node
      if (selType === 'player')            node = playerGroupRefs.current[selId]
      else if (selType === 'marker')       node = markerGroupRefs.current[selId]
      else if (selType === 'boss')         node = bossGroupRefs.current[selId]
      else if (selType === 'field-effect') node = fieldEffectGroupRefs.current[selId]
      else if (selType === 'text')         node = textGroupRefs.current[selId]
      const startPos = ds.startPositions?.[sel]
      if (node && startPos) { node.x(startPos.x + dx); node.y(startPos.y + dy) }
    }
    e.target.getLayer().batchDraw()
  }, [])

  const handleMultiDragEnd = useCallback((type, id, newX, newY) => {
    const ds = dragStateRef.current
    dragStateRef.current = null
    const dx = ds?.dx ?? 0
    const dy = ds?.dy ?? 0
    for (const sel of (selectedAllRef.current ?? [])) {
      const sep = sel.indexOf(':')
      const selType = sel.slice(0, sep)
      const selId   = sel.slice(sep + 1)
      const isLeader = selType === type && selId === id
      const startPos = ds?.startPositions?.[sel]
      const x = isLeader ? newX : (startPos?.x ?? 0) + dx
      const y = isLeader ? newY : (startPos?.y ?? 0) + dy
      if (selType === 'player')            onMovePlayer(selId, x, y)
      else if (selType === 'marker')       onMoveMarker(selId, x, y)
      else if (selType === 'boss')         onMoveBoss(selId, x, y)
      else if (selType === 'field-effect') onMoveFieldEffect(selId, x, y)
      else if (selType === 'text')         onMoveText(selId, x, y)
      // Drop all (leader drops itself in its own onDragEnd)
      if (sel !== `${type}:${id}`) {
        let node
        if (selType === 'player')            node = playerGroupRefs.current[selId]
        else if (selType === 'marker')       node = markerGroupRefs.current[selId]
        else if (selType === 'boss')         node = bossGroupRefs.current[selId]
        else if (selType === 'field-effect') node = fieldEffectGroupRefs.current[selId]
        else if (selType === 'text')         node = textGroupRefs.current[selId]
        node?.to({ scaleX: 1, scaleY: 1, shadowEnabled: false, duration: 0.1 })
      }
    }
  }, [onMovePlayer, onMoveMarker, onMoveBoss, onMoveFieldEffect, onMoveText])

  // Builds a multi-object clipboard from the current selection
  const copySelection = useCallback(() => {
    const items = [...(selectedIds ?? [])].flatMap(id => {
      const player = players[id]
      if (!player) return []
      const pos = positions[id] ?? { x: 0, y: 0 }
      return [{ objType: 'player', classKey: player.classKey, specKey: player.specKey ?? null,
                name: player.name, scale: player.scale ?? 1, effect: player.effect ?? null,
                color: player.color, x: pos.x, y: pos.y }]
    })
    if (items.length === 0) return
    const cx = items.reduce((s, i) => s + i.x, 0) / items.length
    const cy = items.reduce((s, i) => s + i.y, 0) / items.length
    onCopyObject({ type: 'multi', items: items.map(i => ({ ...i, relX: i.x - cx, relY: i.y - cy })) })
  }, [selectedIds, players, positions, onCopyObject])

  const buildHideTargets = (ctxType, ctxId) => {
    const key = `${ctxType}:${ctxId}`
    if (selectedAll.size > 1 && selectedAll.has(key)) {
      return [...selectedAll].map(s => {
        const sep = s.indexOf(':')
        const t = s.slice(0, sep)
        return { type: t === 'field-effect' ? 'fieldEffect' : t, id: s.slice(sep + 1) }
      })
    }
    return [{ type: ctxType === 'field-effect' ? 'fieldEffect' : ctxType, id: ctxId }]
  }

  const handleStageClick = (e) => {
    const pos = e.target.getStage().getPointerPosition()
    if (tool === 'arrow') {
      if (!arrowStart) { setArrowStart(pos) }
      else { onAddArrow(arrowStart.x, arrowStart.y, pos.x, pos.y); setArrowStart(null); setTool('select') }
    } else if (tool === 'text') {
      onAddText(pos.x, pos.y, 'small')
      setTool('select')
    } else {
      setSelectedAll(new Set())
      selectedAllRef.current = new Set()
      onSetSelectedIds(new Set())
    }
  }

  const handlePlayerAction = (id, action) => {
    if (action === 'delete') onRemovePlayer(id)
    else onSelectPlayer(id)
  }

  const handleTextAction = (id, action) => {
    if (action === 'delete') onRemoveText(id)
    else onSelectText(id === selectedTextId ? null : id)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (data.type === 'player') onAddPlayer(data.classKey, data.specKey, x, y)
      else if (data.type === 'marker') onAddMarker(data.key, x, y)
      else if (data.type === 'boss') onAddBoss(data.bossType, x, y)
      else if (data.type === 'field-effect') onAddFieldEffect(data.effect, x, y)
    } catch { /* ignore */ }
  }

  const spotlitPlayer = Object.values(players).find(p => p.effect === 'spotlight')
  const spotlitField  = (fieldEffects ?? []).find(fe => fe.effect === 'spotlight')
  const spotlightPos  = spotlitPlayer
    ? (positions[spotlitPlayer.id] ?? { x: width / 2, y: height / 2 })
    : spotlitField ? { x: spotlitField.x, y: spotlitField.y } : null

  const cursor = tool === 'arrow' ? 'crosshair'
               : tool === 'delete' ? 'not-allowed'
               : tool === 'text'   ? 'text'
               : 'default'

  const ARROW_COLORS = [
    '#ffffff', '#dddddd', '#aaaaaa', '#666666',
    '#fff0a0', '#ffdd44', '#ffaa22', '#ff7700',
    '#ff4444', '#ff1166', '#ff44ff', '#cc44ff',
    '#8844ff', '#4466ff', '#44aaff', '#44ddff',
    '#44ff88', '#88ff44', '#00cc44', '#44bb00',
    '#C79C6E',
  ]

  return (
    <div
      ref={wrapperRef}
      className="canvas-wrapper"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
      onContextMenu={e => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={width} height={height}
        onClick={handleStageClick}
        onContextMenu={e => {
          e.evt.preventDefault()
          const pos = e.target.getStage().getPointerPosition()
          setContextMenu({ type: 'canvas', section: null, x: e.evt.clientX, y: e.evt.clientY, canvasX: pos.x, canvasY: pos.y })
        }}
        onMouseDown={e => {
          if (tool !== 'select' || isPlaying) return
          const target = e.target
          if (target.draggable && target.draggable()) return
          const pos = target.getStage().getPointerPosition()
          selectionStartRef.current = pos
          isDraggingSelRef.current  = false
          selectionBoxRef.current   = null
          setSelectionBox(null)
        }}
        onMouseMove={e => {
          const p = e.target.getStage().getPointerPosition()
          if (!p) return
          setMousePos(p)
          if (cursorPosRef) cursorPosRef.current = p
          if (tool === 'select' && selectionStartRef.current) {
            const start = selectionStartRef.current
            const dx = p.x - start.x
            const dy = p.y - start.y
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
              isDraggingSelRef.current = true
              const box = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(dx), h: Math.abs(dy) }
              selectionBoxRef.current = box
              setSelectionBox(box)
            }
          }
        }}
        style={{ cursor, background: '#1a1a2e' }}
      >
        <Layer>
          {bgImg && <Image image={bgImg} x={0} y={0} width={width} height={height} opacity={0.85} listening={false} />}
        </Layer>

        <Layer>
          {swirls.map(s => (
            <SwirlOverlay key={s.id} swirl={s} swirlAngle={swirlAngle} beamLen={beamLen}
              isPlaying={isPlaying} tool={tool} onMoveSwirl={onMoveSwirl} onRemoveSwirl={onRemoveSwirl}
              onContextMenu={(e, id) => { if (!isPlaying) setContextMenu({ type: 'swirl', id, x: e.evt.clientX, y: e.evt.clientY }) }} />
          ))}
        </Layer>

        <Layer>
          {(bosses ?? []).map(b => (
            <BossElement key={b.id} boss={b} tool={tool} isPlaying={isPlaying} effectTime={effectTime}
              onMoveBoss={onMoveBoss} onRemoveBoss={onRemoveBoss}
              onShowContextMenu={handleShowContextMenu}
              onHoverObject={obj => { hoveredObjectRef.current = obj; onObjectHover?.(obj) }}
              onSnapDragMove={handleTokenDragMove} onSnapDragEnd={clearSnapLines}
              groupRef={el => { if (el) bossGroupRefs.current[b.id] = el; else delete bossGroupRefs.current[b.id] }}
              isMultiSelected={selectedAll.has(`boss:${b.id}`)}
              onMultiDragStart={handleMultiDragStart}
              onMultiDragMove={handleMultiDragMove}
              onMultiDragEnd={handleMultiDragEnd} />
          ))}
        </Layer>

        <Layer>
          {(markers ?? []).map(m => (
            <MarkerElement key={m.id} marker={m}
              isPlaying={isPlaying} tool={tool}
              onMoveMarker={onMoveMarker} onRemoveMarker={onRemoveMarker}
              onShowContextMenu={handleShowContextMenu}
              onHoverObject={obj => { hoveredObjectRef.current = obj; onObjectHover?.(obj) }}
              onSnapDragMove={handleTokenDragMove} onSnapDragEnd={clearSnapLines}
              groupRef={el => { if (el) markerGroupRefs.current[m.id] = el; else delete markerGroupRefs.current[m.id] }}
              isMultiSelected={selectedAll.has(`marker:${m.id}`)}
              onMultiDragStart={handleMultiDragStart}
              onMultiDragMove={handleMultiDragMove}
              onMultiDragEnd={handleMultiDragEnd} />
          ))}
        </Layer>

        <Layer>
          {arrows.map(a => (
            <Group key={a.id} x={0} y={0}
              draggable={tool === 'select'}
              onDragEnd={e => {
                const dx = e.target.x(), dy = e.target.y()
                e.target.position({ x: 0, y: 0 })
                onMoveArrow(a.id, dx, dy)
              }}
              onClick={e => { e.cancelBubble = true; if (e.evt.button !== 0) return; if (tool === 'delete') onRemoveArrow(a.id) }}
              onMouseDown={e => {
                e.cancelBubble = true
                if (e.evt.button === 1) { e.evt.preventDefault(); onRemoveArrow(a.id) }
              }}
              onContextMenu={e => {
                e.evt.preventDefault(); e.cancelBubble = true
                if (!isPlaying) setContextMenu({ type: 'arrow', id: a.id, x: e.evt.clientX, y: e.evt.clientY,
                  color: a.color ?? '#ff4444', dash: a.dash ?? false, strokeWidth: a.strokeWidth ?? 2.5, twoHeaded: a.twoHeaded ?? false })
              }}
            >
              <Arrow
                points={[a.x1, a.y1, a.x2, a.y2]}
                stroke={a.color ?? '#ff4444'} fill={a.color ?? '#ff4444'}
                strokeWidth={a.strokeWidth ?? 2.5}
                pointerLength={12} pointerWidth={10}
                dash={a.dash ? [10, 6] : undefined}
                pointerAtBeginning={a.twoHeaded ?? false}
                pointerAtEnd={true}
              />
            </Group>
          ))}
          {arrowStart && (
            <Arrow
              points={[arrowStart.x, arrowStart.y, mousePos.x, mousePos.y]}
              stroke={arrowStyle?.color ?? '#ff6666'} fill={arrowStyle?.color ?? '#ff6666'}
              strokeWidth={arrowStyle?.strokeWidth ?? 2}
              pointerLength={12} pointerWidth={10}
              dash={[6, 3]} listening={false}
              pointerAtBeginning={arrowStyle?.twoHeaded ?? false}
              pointerAtEnd={true}
            />
          )}
        </Layer>

        <Layer>
          {(fieldEffects ?? []).map(fe => (
            <FieldEffectElement key={fe.id} fe={fe}
              tool={tool} isPlaying={isPlaying} effectTime={effectTime} playElapsedTime={playElapsedTime}
              onMove={onMoveFieldEffect} onRemove={onRemoveFieldEffect}
              onShowContextMenu={setContextMenu}
              onHoverObject={obj => { hoveredObjectRef.current = obj; onObjectHover?.(obj) }}
              onSnapDragMove={handleTokenDragMove} onSnapDragEnd={clearSnapLines}
              groupRef={el => { if (el) fieldEffectGroupRefs.current[fe.id] = el; else delete fieldEffectGroupRefs.current[fe.id] }}
              isMultiSelected={selectedAll.has(`field-effect:${fe.id}`)}
              onMultiDragStart={handleMultiDragStart}
              onMultiDragMove={handleMultiDragMove}
              onMultiDragEnd={handleMultiDragEnd} />
          ))}
        </Layer>

        {/* ── Trajectory paths — only the segments adjacent to the active frame ── */}
        {!isPlaying && (keyframes?.length ?? 0) > 1 && (
          <Layer listening={false}>
            {/* Boss trajectories */}
            {bosses.map(boss => {
              const getPos = (fi) => {
                const kf = keyframes[fi]
                if (!kf) return null
                return (kf._bosses ?? []).find(b => b.id === boss.id) ?? null
              }
              const cur  = getPos(activeKeyframe)
              if (!cur) return null
              const prev = getPos(activeKeyframe - 1)
              const next = getPos(activeKeyframe + 1)
              const col  = '#c8a227'
              const arrows = [], dots = []
              if (prev) {
                const dx = cur.x - prev.x, dy = cur.y - prev.y
                if (Math.sqrt(dx*dx + dy*dy) > 3) {
                  arrows.push(<Arrow key="in" points={[prev.x, prev.y, cur.x, cur.y]}
                    stroke={col} fill={col} strokeWidth={1.5} opacity={0.45}
                    dash={[6, 4]} pointerLength={8} pointerWidth={6} listening={false} />)
                  dots.push({ fi: activeKeyframe - 1, ...prev })
                }
              }
              if (next) {
                const dx = next.x - cur.x, dy = next.y - cur.y
                if (Math.sqrt(dx*dx + dy*dy) > 3) {
                  arrows.push(<Arrow key="out" points={[cur.x, cur.y, next.x, next.y]}
                    stroke={col} fill={col} strokeWidth={1.5} opacity={0.45}
                    dash={[6, 4]} pointerLength={8} pointerWidth={6} listening={false} />)
                  dots.push({ fi: activeKeyframe + 1, ...next })
                }
              }
              if (arrows.length === 0) return null
              dots.push({ fi: activeKeyframe, ...cur })
              return (
                <Group key={boss.id} listening={false}>
                  {arrows}
                  {dots.map(({ fi, x, y }) => {
                    const isCur = fi === activeKeyframe
                    return (
                      <Group key={fi} x={x} y={y} listening={false}>
                        <Circle radius={isCur ? 8 : 5} fill={col} opacity={isCur ? 0.9 : 0.45}
                          stroke={isCur ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.4)'}
                          strokeWidth={isCur ? 2 : 1} />
                        <Text text={String(fi + 1)} fontSize={isCur ? 9 : 7} fontStyle="bold" fill="white"
                          align="center" verticalAlign="middle" width={16} height={16} x={-8} y={-8} listening={false} />
                      </Group>
                    )
                  })}
                </Group>
              )
            })}
            {/* Player + enemy trajectories */}
            {Object.values(players).map(player => {
              const getPos = (fi) => {
                const kf = keyframes[fi]
                if (!kf) return null
                const pos    = kf[player.id]
                const hidden = (kf._hiddenPlayerIds ?? []).includes(player.id)
                if (!pos || (player.birthFrame ?? 0) > fi || hidden) return null
                return { x: pos.x, y: pos.y }
              }

              const cur  = getPos(activeKeyframe)
              if (!cur) return null

              const prev = getPos(activeKeyframe - 1)
              const next = getPos(activeKeyframe + 1)
              const col  = player.color ?? '#aaa'

              const arrows = []
              const dots   = []

              if (prev) {
                const dx = cur.x - prev.x, dy = cur.y - prev.y
                if (Math.sqrt(dx*dx + dy*dy) > 3) {
                  arrows.push(
                    <Arrow key="in"
                      points={[prev.x, prev.y, cur.x, cur.y]}
                      stroke={col} fill={col} strokeWidth={1.5} opacity={0.45}
                      dash={[6, 4]} pointerLength={8} pointerWidth={6} listening={false} />
                  )
                  dots.push({ fi: activeKeyframe - 1, ...prev })
                }
              }

              if (next) {
                const dx = next.x - cur.x, dy = next.y - cur.y
                if (Math.sqrt(dx*dx + dy*dy) > 3) {
                  arrows.push(
                    <Arrow key="out"
                      points={[cur.x, cur.y, next.x, next.y]}
                      stroke={col} fill={col} strokeWidth={1.5} opacity={0.45}
                      dash={[6, 4]} pointerLength={8} pointerWidth={6} listening={false} />
                  )
                  dots.push({ fi: activeKeyframe + 1, ...next })
                }
              }

              if (arrows.length === 0) return null
              dots.push({ fi: activeKeyframe, ...cur })

              return (
                <Group key={player.id} listening={false}>
                  {arrows}
                  {dots.map(({ fi, x, y }) => {
                    const isCur = fi === activeKeyframe
                    return (
                      <Group key={fi} x={x} y={y} listening={false}>
                        <Circle
                          radius={isCur ? 8 : 5}
                          fill={col}
                          opacity={isCur ? 0.9 : 0.45}
                          stroke={isCur ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.4)'}
                          strokeWidth={isCur ? 2 : 1}
                        />
                        <Text
                          text={String(fi + 1)}
                          fontSize={isCur ? 9 : 7}
                          fontStyle="bold" fill="white"
                          align="center" verticalAlign="middle"
                          width={16} height={16} x={-8} y={-8}
                          listening={false}
                        />
                      </Group>
                    )
                  })}
                </Group>
              )
            })}
          </Layer>
        )}

        <Layer>
          {Object.values(players).map(player => {
            const pos           = positions[player.id] ?? { x: width / 2, y: height / 2 }
            const isMulti       = selectedIds?.has(player.id) ?? false
            const classOverride = keyframes?.[activeKeyframe]?._classOverrides?.[player.id] ?? null
            return (
              <PlayerMarker key={player.id} player={player} pos={pos} classOverride={classOverride}
                isSelected={player.id === selectedId}
                isMultiSelected={isMulti}
                isPlaying={isPlaying} tool={tool} effectTime={effectTime}
                onAction={handlePlayerAction}
                groupRef={el => {
                  if (el) playerGroupRefs.current[player.id] = el
                  else delete playerGroupRefs.current[player.id]
                }}
                onDragStart={isMulti ? (pid, x, y) => handleMultiDragStart('player', pid, x, y) : null}
                onDragMove={isMulti ? (e, pid) => handleMultiDragMove(e, 'player', pid) : null}
                onDragEnd={e => onMovePlayer(player.id, e.target.x(), e.target.y())}
                onDragEndMulti={(pid, x, y) => handleMultiDragEnd('player', pid, x, y)}
                onShowContextMenu={handleShowContextMenu}
                onSnapDragMove={handleTokenDragMove} onSnapDragEnd={clearSnapLines}
                onHoverObject={obj => { hoveredObjectRef.current = obj; onObjectHover?.(obj) }}
              />
            )
          })}
        </Layer>

        {spotlightPos && (
          <Layer listening={false}>
            <Rect
              x={0} y={0} width={width} height={height}
              fillRadialGradientStartPoint={{ x: spotlightPos.x, y: spotlightPos.y }}
              fillRadialGradientEndPoint={{ x: spotlightPos.x, y: spotlightPos.y }}
              fillRadialGradientStartRadius={55}
              fillRadialGradientEndRadius={95}
              fillRadialGradientColorStops={[0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.82)']}
            />
          </Layer>
        )}

        <Layer>
          {(texts ?? []).map(t => (
            <TextElement key={t.id} textEl={t}
              isSelected={t.id === selectedTextId}
              isPlaying={isPlaying} tool={tool}
              effectTime={effectTime}
              animTime={textAnimTime}
              onAction={handleTextAction}
              onDragEnd={e => onMoveText(t.id, e.target.x(), e.target.y())}
              onShowContextMenu={handleShowContextMenu}
              onHoverObject={obj => { hoveredObjectRef.current = obj; onObjectHover?.(obj) }}
              onSnapDragMove={handleTokenDragMove} onSnapDragEnd={clearSnapLines}
              groupRef={el => { if (el) textGroupRefs.current[t.id] = el; else delete textGroupRefs.current[t.id] }}
              isMultiSelected={selectedAll.has(`text:${t.id}`)}
              onMultiDragStart={handleMultiDragStart}
              onMultiDragMove={handleMultiDragMove}
              onMultiDragEnd={handleMultiDragEnd} />
          ))}
        </Layer>

        {selectionBox && (
          <Layer listening={false}>
            <Rect
              x={selectionBox.x} y={selectionBox.y}
              width={selectionBox.w} height={selectionBox.h}
              stroke="#c8a95f" strokeWidth={1.5} fill="rgba(200,169,95,0.08)" dash={[5, 3]}
            />
          </Layer>
        )}

        {(snapLines.v.length > 0 || snapLines.h.length > 0) && (
          <Layer listening={false}>
            {snapLines.v.map((lx, i) => (
              <Line key={`sv${i}`} points={[lx, 0, lx, height]} stroke="#44ccff" strokeWidth={1} dash={[4, 4]} opacity={0.7} />
            ))}
            {snapLines.h.map((ly, i) => (
              <Line key={`sh${i}`} points={[0, ly, width, ly]} stroke="#44ccff" strokeWidth={1} dash={[4, 4]} opacity={0.7} />
            ))}
          </Layer>
        )}
      </Stage>

      {tool === 'arrow' && (
        <div className="tool-hint">
          {arrowStart ? 'Click to finish arrow (Esc to cancel)' : 'Click to start arrow'}
        </div>
      )}
      {tool === 'text' && (
        <div className="tool-hint">Click on canvas to place text</div>
      )}
      {tool === 'select' && (selectedAll?.size ?? 0) > 1 && (
        <div className="tool-hint">{selectedAll.size} objects selected — right-click any to act on all</div>
      )}

      {/* ── Floating text toolbar ── */}
      {selectedTextId && !isPlaying && (() => {
        const textEl = (texts ?? []).find(t => t.id === selectedTextId)
        if (!textEl) return null
        const rect = wrapperRef.current?.getBoundingClientRect()
        if (!rect) return null
        return (
          <TextToolbar
            key={selectedTextId}
            textEl={textEl}
            onUpdate={updates => onUpdateText(selectedTextId, updates)}
            onColorRange={(start, end, color) => onApplyTextSegmentColor(selectedTextId, start, end, color)}
            onMove={(dx, dy) => onUpdateText(selectedTextId, { x: textEl.x + dx, y: textEl.y + dy })}
            anchorX={rect.left + textEl.x}
            anchorY={rect.top  + textEl.y}
          />
        )
      })()}

      {/* ── Unified canvas right-click menu ── */}
      {contextMenu?.type === 'canvas' && (
        <div ref={ctxMenuRef} className="ctx-menu ctx-menu-canvas" style={{ left: contextMenu.x + 16, top: contextMenu.y - 8 }}>
          <div className="ctx-title">
            Canvas
            <button className="ctx-close" onClick={() => setContextMenu(null)}>×</button>
          </div>

          {/* Main section */}
          {contextMenu.section == null && (
            <>
              <button className="ctx-canvas-btn" onClick={() =>
                setContextMenu(m => ({ ...m, section: 'text' }))
              }>Add Text</button>

              <button className="ctx-canvas-btn" onClick={() =>
                setContextMenu(m => ({ ...m, section: 'effect' }))
              }>Add Effect</button>

              <button className="ctx-canvas-btn" onClick={() =>
                setContextMenu(m => ({ ...m, section: 'arrow' }))
              }>Add Arrow</button>

              {(selectedIds?.size ?? 0) > 0 && (
                <button className="ctx-canvas-btn" onClick={() => {
                  copySelection()
                  setContextMenu(null)
                }}>📋 Copy Selection ({selectedIds.size})</button>
              )}

              {clipboard && (
                <button className="ctx-canvas-btn ctx-paste-btn" onClick={() => {
                  onPasteAt(contextMenu.canvasX, contextMenu.canvasY)
                  setContextMenu(null)
                }}>
                  📋 Paste {clipboard.type === 'multi' ? `${clipboard.items.length} items` : clipboard.type}
                </button>
              )}
            </>
          )}

          {/* Text preset sub-menu */}
          {contextMenu.section === 'text' && (
            <>
              <button className="ctx-back-btn" onClick={() => setContextMenu(m => ({ ...m, section: null }))}>← Back</button>
              <button className="ctx-canvas-btn" style={{ textAlign: 'left' }} onClick={() => {
                onAddText(contextMenu.canvasX, contextMenu.canvasY, 'small')
                setContextMenu(null)
              }}>
                Small Label
                <span style={{ display: 'block', fontSize: 9, opacity: 0.6, marginTop: 1 }}>13pt · Bold · Charcoal bg</span>
              </button>
              <button className="ctx-canvas-btn" style={{ textAlign: 'left' }} onClick={() => {
                onAddText(contextMenu.canvasX, contextMenu.canvasY, 'header')
                setContextMenu(null)
              }}>
                Header
                <span style={{ display: 'block', fontSize: 9, opacity: 0.6, marginTop: 1 }}>34pt · Impact · Grey Bar bg</span>
              </button>
            </>
          )}

          {/* Effect sub-menu */}
          {contextMenu.section === 'effect' && (
            <>
              <button className="ctx-back-btn" onClick={() => setContextMenu(m => ({ ...m, section: null }))}>← Back</button>
              <div style={{ flex: '0 0 100%' }}>
                {[...EFFECT_GROUPS, TEXT_HIGHLIGHT_GROUP].map(group => {
                  const isOpen = openEffectGroups.has(group.label)
                  return (
                    <div key={group.label} className="ctx-effect-group">
                      <button
                        className="ctx-effect-group-header"
                        onClick={() => setOpenEffectGroups(prev =>
                          prev.has(group.label) ? new Set() : new Set([group.label])
                        )}
                      >
                        <span className="ctx-effect-group-arrow">{isOpen ? '▾' : '▸'}</span>
                        <span className="ctx-effect-group-name">{group.label}</span>
                      </button>
                      {isOpen && (
                        <div className="effect-grid" style={{ padding: '3px 4px 5px' }}>
                          {group.effects.map(eff => (
                            <button key={eff.key} className="effect-btn" title={eff.desc}
                              onClick={() => { onAddFieldEffect(eff.key, contextMenu.canvasX, contextMenu.canvasY); setContextMenu(null) }}
                            >
                              <span className="effect-emoji">{eff.emoji}</span>
                              <span className="effect-label-text">{eff.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Arrow sub-menu */}
          {contextMenu.section === 'arrow' && (
            <>
              <button className="ctx-back-btn" onClick={() => setContextMenu(m => ({ ...m, section: null }))}>← Back</button>
              <div className="ctx-section">
                <div className="ctx-label">Color</div>
                <div className="text-color-row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  {ARROW_COLORS.map(c => (
                    <button key={c}
                      className={`text-color-swatch ${arrowStyle?.color === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => onArrowStyleChange({ color: c })}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <div className="ctx-section">
                <div className="ctx-label">Width</div>
                <div className="arrow-style-row">
                  {[['Thin', 1.5], ['Normal', 2.5], ['Thick', 4.5]].map(([label, w]) => (
                    <button key={label}
                      className={`arrow-style-btn ${arrowStyle?.strokeWidth === w ? 'active' : ''}`}
                      onClick={() => onArrowStyleChange({ strokeWidth: w })}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <div className="ctx-section">
                <div className="ctx-label">Line</div>
                <div className="arrow-style-row">
                  <button className={`arrow-style-btn ${!arrowStyle?.dash ? 'active' : ''}`}
                    onClick={() => onArrowStyleChange({ dash: false })}>Solid</button>
                  <button className={`arrow-style-btn ${arrowStyle?.dash ? 'active' : ''}`}
                    onClick={() => onArrowStyleChange({ dash: true })}>Dashed</button>
                </div>
              </div>
              <div className="ctx-section">
                <div className="ctx-label">Heads</div>
                <div className="arrow-style-row">
                  <button className={`arrow-style-btn ${!arrowStyle?.twoHeaded ? 'active' : ''}`}
                    onClick={() => onArrowStyleChange({ twoHeaded: false })}>→ One</button>
                  <button className={`arrow-style-btn ${arrowStyle?.twoHeaded ? 'active' : ''}`}
                    onClick={() => onArrowStyleChange({ twoHeaded: true })}>↔ Two</button>
                </div>
              </div>
              <div className="ctx-section">
                <button className="ctx-canvas-btn" style={{ marginTop: 2 }} onClick={() => {
                  setArrowStart({ x: contextMenu.canvasX, y: contextMenu.canvasY })
                  setTool('arrow')
                  setContextMenu(null)
                }}>→ Start Arrow Here</button>
              </div>
            </>
          )}
        </div>
      )}


      {/* ── Field effect color + lock ── */}
      {contextMenu?.type === 'field-effect' && (
        <div ref={ctxMenuRef} className="ctx-menu" style={{ left: contextMenu.x + 16, top: contextMenu.y - 8 }}>
          <div className="ctx-title">
            Effect
            <button className="ctx-close" onClick={() => setContextMenu(null)}>×</button>
          </div>
          <div className="ctx-section">
            <div className="ctx-label">Size</div>
            <div className="ctx-scale-row">
              <input type="range" className="ctx-slider"
                min={0.3} max={4} step={0.05}
                value={contextMenu.scale ?? 1}
                onChange={e => {
                  const s = Number(e.target.value)
                  setContextMenu(m => ({ ...m, scale: s }))
                  onUpdateFieldEffect(contextMenu.id, { scale: s })
                }}
              />
              <span className="ctx-scale-val">{Math.round((contextMenu.scale ?? 1) * 100)}%</span>
            </div>
          </div>
          {((contextMenu.effect ?? '').startsWith('beam_') || contextMenu.effect === 'banish_wall') && (
            <div className="ctx-section">
              <div className="ctx-label">Length</div>
              <div className="ctx-scale-row">
                <input type="range" className="ctx-slider"
                  min={0.2} max={3} step={0.05}
                  value={contextMenu.beamLength ?? 1}
                  onChange={e => {
                    const l = Number(e.target.value)
                    setContextMenu(m => ({ ...m, beamLength: l }))
                    onUpdateFieldEffect(contextMenu.id, { beamLength: l })
                  }}
                />
                <span className="ctx-scale-val">{Math.round((contextMenu.beamLength ?? 1) * 100)}%</span>
              </div>
            </div>
          )}
          <div className="ctx-section">
            <div className="ctx-label">Rotation: {Math.round(contextMenu.rotation ?? 0)}°</div>
            <div className="ctx-rotation-row" style={{ marginBottom: 4 }}>
              {[[0,'0°'],[90,'90°'],[180,'180°'],[270,'270°']].map(([deg, lbl]) => (
                <button key={deg} className={`ctx-rot-btn${Math.round(contextMenu.rotation ?? 0) === deg ? ' active' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    setContextMenu(m => ({ ...m, rotation: deg }))
                    onUpdateFieldEffect(contextMenu.id, { rotation: deg })
                  }}>{lbl}</button>
              ))}
            </div>
            <div className="ctx-rotation-row">
              {[-90, -45, -15, -5, 5, 15, 45, 90].map(deg => (
                <button key={deg} className="ctx-rot-btn"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    const r = ((contextMenu.rotation ?? 0) + deg + 360) % 360
                    setContextMenu(m => ({ ...m, rotation: r }))
                    onUpdateFieldEffect(contextMenu.id, { rotation: r })
                  }}>
                  {deg > 0 ? `+${deg}` : deg}°
                </button>
              ))}
              <button className="ctx-rot-btn ctx-rot-reset"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setContextMenu(m => ({ ...m, rotation: 0 }))
                  onUpdateFieldEffect(contextMenu.id, { rotation: 0 })
                }}>↺</button>
            </div>
          </div>
          {(contextMenu.rotateSpeed ?? 0) !== 0 && (
            <div className="ctx-section">
              <button className="ctx-canvas-btn" style={{ fontSize: 11 }}
                onClick={() => {
                  onUpdateFieldEffect(contextMenu.id, {
                    rotation: contextMenu.rotation ?? 0,
                    rotateSpeed: contextMenu.rotateSpeed ?? 0,
                  })
                  setContextMenu(null)
                }}>
                ↺ Sync rotation to all frames
              </button>
            </div>
          )}
          <div className="ctx-section">
            <div className="ctx-label">Spin Speed: {contextMenu.rotateSpeed ? `${contextMenu.rotateSpeed}°/s` : 'Off'}</div>
            <div className="ctx-spin-row">
              {[['Off', 0], ['Slow', 10], ['Medium', 20], ['Fast', 40]].map(([label, spd]) => (
                <button key={label}
                  className={`ctx-spin-btn ${(contextMenu.rotateSpeed ?? 0) === spd ? 'active' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    setContextMenu(m => ({ ...m, rotateSpeed: spd }))
                    onUpdateFieldEffect(contextMenu.id, { rotateSpeed: spd })
                  }}>{label}</button>
              ))}
            </div>
            <div className="ctx-spin-custom-row">
              <span className="ctx-label" style={{ marginBottom: 0 }}>Custom:</span>
              <input type="number" className="ctx-spin-input"
                min={0} max={360} step={1}
                value={contextMenu.rotateSpeed ?? 0}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  const spd = Math.max(0, Number(e.target.value))
                  setContextMenu(m => ({ ...m, rotateSpeed: spd }))
                  onUpdateFieldEffect(contextMenu.id, { rotateSpeed: spd })
                }}
              />
              <span className="ctx-label" style={{ marginBottom: 0 }}>°/s</span>
            </div>
          </div>
          <div className="ctx-section ctx-section-full">
            <div className="ctx-label">Effect Type</div>
            {[...EFFECT_GROUPS, TEXT_HIGHLIGHT_GROUP].map(group => {
              const isOpen = openEffectGroups.has(group.label)
              const hasActive = group.effects.some(e => e.key === contextMenu.effect)
              return (
                <div key={group.label} className="ctx-effect-group">
                  <button
                    className={`ctx-effect-group-header ${hasActive ? 'has-active' : ''}`}
                    onClick={() => setOpenEffectGroups(prev =>
                      prev.has(group.label) ? new Set() : new Set([group.label])
                    )}
                  >
                    <span className="ctx-effect-group-arrow">{isOpen ? '▾' : '▸'}</span>
                    <span className="ctx-effect-group-name">{group.label}</span>
                    {hasActive && <span className="ctx-effect-group-dot" />}
                  </button>
                  {isOpen && (
                    <div className="effect-grid" style={{ padding: '3px 4px 5px' }}>
                      {group.effects.map(eff => (
                        <button key={eff.key}
                          className={`effect-btn ${contextMenu.effect === eff.key ? 'active' : ''}`}
                          title={eff.desc}
                          onClick={() => {
                            setContextMenu(m => ({ ...m, effect: eff.key }))
                            onUpdateFieldEffect(contextMenu.id, { effect: eff.key })
                          }}
                        >
                          <span className="effect-emoji">{eff.emoji}</span>
                          <span className="effect-label-text">{eff.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="ctx-section">
            <button
              className={`persist-btn ${contextMenu.persistent ? 'active' : ''}`}
              onClick={() => {
                const p = !contextMenu.persistent
                setContextMenu(m => ({ ...m, persistent: p }))
                onUpdateFieldEffect(contextMenu.id, { persistent: p })
              }}
              title="When on, this effect carries over to every new blank frame"
            >
              📌 {contextMenu.persistent ? 'Persists to new frames' : 'Frame only'}
            </button>
          </div>
          <div className="ctx-section">
            <button
              className={`persist-btn ${contextMenu.stopped ? 'active' : ''}`}
              onClick={() => {
                const s = !contextMenu.stopped
                setContextMenu(m => ({ ...m, stopped: s }))
                onUpdateFieldEffect(contextMenu.id, { stopped: s })
              }}
            >
              {contextMenu.stopped ? '▶ Animate' : '⏸ Freeze Effect'}
            </button>
          </div>
          <div className="ctx-section">
            <div className="ctx-label">Color</div>
            <div className="text-color-row" style={{ flexWrap: 'wrap', gap: 5 }}>
              <button
                className={`text-color-swatch ${contextMenu.color == null ? 'active' : ''}`}
                style={{ background: 'transparent', border: '1.5px dashed #666' }}
                onClick={() => { onUpdateFieldEffect(contextMenu.id, { color: null }); setContextMenu(m => ({ ...m, color: null })) }}
                title="Default"
              />
              {['#ffffff','#dddddd','#aaaaaa','#666666','#ffdd44','#ffbb22','#ff8844','#ff4444','#ff2266','#ff44ff','#bb44ff','#8844ff','#4466ff','#44ddff','#44ff88','#88ff44'].map(c => (
                <button key={c}
                  className={`text-color-swatch ${contextMenu.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => { onUpdateFieldEffect(contextMenu.id, { color: c }); setContextMenu(m => ({ ...m, color: c })) }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div className="ctx-action-row">
            <button className="ctx-action-btn" onClick={() => { onCopyObject(contextMenu); setContextMenu(null) }}>📋 Copy</button>
            {keyframes.length > 1 && (
              <button className="ctx-action-btn" onClick={() => setContextMenu(m => ({ ...m, showFramePicker: !m.showFramePicker, pickerFrames: new Set() }))}>
                🗂 Frames
              </button>
            )}
            {pageCount > 1 && (
              <button className="ctx-action-btn" onClick={() => { onCopyToAllPages('field-effect', contextMenu.id); setContextMenu(null) }}>📄 Pages</button>
            )}
            <button className="ctx-action-btn" onClick={() => {
              onToggleFieldEffectLocked(contextMenu.id)
              setContextMenu(m => ({ ...m, locked: !m.locked }))
            }}>{contextMenu.locked ? '🔓 Unlock' : '🔒 Lock'}</button>
          </div>
          {contextMenu.showFramePicker && (
            <div className="ctx-section ctx-section-full ctx-frame-picker">
              <div className="ctx-label">Duplicate to frames</div>
              <div className="frame-picker-grid">
                {keyframes.map((_, idx) => {
                  const isCurrent = idx === activeKeyframe
                  const isSelected = contextMenu.pickerFrames?.has(idx)
                  return (
                    <button key={idx}
                      className={`frame-picker-btn ${isCurrent ? 'current' : ''} ${isSelected ? 'active' : ''}`}
                      disabled={isCurrent}
                      onClick={() => setContextMenu(m => {
                        const next = new Set(m.pickerFrames)
                        next.has(idx) ? next.delete(idx) : next.add(idx)
                        return { ...m, pickerFrames: next }
                      })}
                    >{idx + 1}</button>
                  )
                })}
              </div>
              <div className="frame-picker-actions">
                <button className="frame-picker-sel-btn" onClick={() => setContextMenu(m => ({
                  ...m, pickerFrames: new Set(keyframes.map((_, i) => i).filter(i => i !== activeKeyframe))
                }))}>All</button>
                <button className="frame-picker-sel-btn" onClick={() => setContextMenu(m => ({ ...m, pickerFrames: new Set() }))}>None</button>
                <button className="frame-picker-apply-btn"
                  disabled={!contextMenu.pickerFrames?.size}
                  onClick={() => {
                    onDuplicateToFrames('fieldEffect', contextMenu.id, [...(contextMenu.pickerFrames ?? [])])
                    setContextMenu(null)
                  }}
                >Duplicate to {contextMenu.pickerFrames?.size ?? 0} frame{contextMenu.pickerFrames?.size === 1 ? '' : 's'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Text right-click menu ── */}
      {contextMenu?.type === 'text' && (
        <div ref={ctxMenuRef} className="ctx-menu ctx-menu-text" style={{ left: contextMenu.x + 16, top: contextMenu.y - 8 }}>
          <div className="ctx-title">
            Text
            <button className="ctx-close" onClick={() => setContextMenu(null)}>×</button>
          </div>
          <div className="ctx-action-row">
            <button className="ctx-action-btn" onClick={() => { onCopyObject(contextMenu); setContextMenu(null) }}>📋 Copy</button>
            {keyframes.length > 1 && (
              <button className="ctx-action-btn" onClick={() => setContextMenu(m => ({ ...m, showFramePicker: !m.showFramePicker, pickerFrames: new Set() }))}>
                🗂 Frames
              </button>
            )}
            <button className="ctx-action-btn" onClick={() => {
              onToggleTextLocked(contextMenu.id)
              setContextMenu(m => ({ ...m, locked: !m.locked }))
            }}>{contextMenu.locked ? '🔓 Unlock' : '🔒 Lock'}</button>
          </div>
          {contextMenu.showFramePicker && (
            <div className="ctx-section ctx-section-full ctx-frame-picker">
              <div className="ctx-label">Duplicate to frames</div>
              <div className="frame-picker-grid">
                {keyframes.map((_, idx) => {
                  const isCurrent = idx === activeKeyframe
                  const isSelected = contextMenu.pickerFrames?.has(idx)
                  return (
                    <button key={idx}
                      className={`frame-picker-btn ${isCurrent ? 'current' : ''} ${isSelected ? 'active' : ''}`}
                      disabled={isCurrent}
                      onClick={() => setContextMenu(m => {
                        const next = new Set(m.pickerFrames)
                        next.has(idx) ? next.delete(idx) : next.add(idx)
                        return { ...m, pickerFrames: next }
                      })}
                    >{idx + 1}</button>
                  )
                })}
              </div>
              <div className="frame-picker-actions">
                <button className="frame-picker-sel-btn" onClick={() => setContextMenu(m => ({
                  ...m, pickerFrames: new Set(keyframes.map((_, i) => i).filter(i => i !== activeKeyframe))
                }))}>All</button>
                <button className="frame-picker-sel-btn" onClick={() => setContextMenu(m => ({ ...m, pickerFrames: new Set() }))}>None</button>
                <button className="frame-picker-apply-btn"
                  disabled={!contextMenu.pickerFrames?.size}
                  onClick={() => {
                    onDuplicateToFrames('text', contextMenu.id, [...(contextMenu.pickerFrames ?? [])])
                    setContextMenu(null)
                  }}
                >Duplicate to {contextMenu.pickerFrames?.size ?? 0} frame{contextMenu.pickerFrames?.size === 1 ? '' : 's'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Arrow right-click menu ── */}
      {contextMenu?.type === 'arrow' && (
        <div ref={ctxMenuRef} className="ctx-menu" style={{ left: contextMenu.x + 16, top: contextMenu.y - 8 }}>
          <div className="ctx-title">
            Arrow
            <button className="ctx-close" onClick={() => setContextMenu(null)}>×</button>
          </div>
          <div className="ctx-section">
            <div className="ctx-label">Color</div>
            <div className="text-color-row" style={{ flexWrap: 'wrap', gap: 4 }}>
              {ARROW_COLORS.map(c => (
                <button key={c}
                  className={`text-color-swatch ${contextMenu.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => { onUpdateArrow(contextMenu.id, { color: c }); setContextMenu(m => ({ ...m, color: c })) }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div className="ctx-section">
            <div className="ctx-label">Width</div>
            <div className="arrow-style-row">
              {[['Thin', 1.5], ['Normal', 2.5], ['Thick', 4.5]].map(([label, w]) => (
                <button key={label}
                  className={`arrow-style-btn ${contextMenu.strokeWidth === w ? 'active' : ''}`}
                  onClick={() => { onUpdateArrow(contextMenu.id, { strokeWidth: w }); setContextMenu(m => ({ ...m, strokeWidth: w })) }}
                >{label}</button>
              ))}
            </div>
          </div>
          <div className="ctx-section">
            <div className="ctx-label">Line</div>
            <div className="arrow-style-row">
              <button className={`arrow-style-btn ${!contextMenu.dash ? 'active' : ''}`}
                onClick={() => { onUpdateArrow(contextMenu.id, { dash: false }); setContextMenu(m => ({ ...m, dash: false })) }}>Solid</button>
              <button className={`arrow-style-btn ${contextMenu.dash ? 'active' : ''}`}
                onClick={() => { onUpdateArrow(contextMenu.id, { dash: true }); setContextMenu(m => ({ ...m, dash: true })) }}>Dashed</button>
            </div>
          </div>
          <div className="ctx-section">
            <div className="ctx-label">Heads</div>
            <div className="arrow-style-row">
              <button className={`arrow-style-btn ${!contextMenu.twoHeaded ? 'active' : ''}`}
                onClick={() => { onUpdateArrow(contextMenu.id, { twoHeaded: false }); setContextMenu(m => ({ ...m, twoHeaded: false })) }}>→ One</button>
              <button className={`arrow-style-btn ${contextMenu.twoHeaded ? 'active' : ''}`}
                onClick={() => { onUpdateArrow(contextMenu.id, { twoHeaded: true }); setContextMenu(m => ({ ...m, twoHeaded: true })) }}>↔ Two</button>
            </div>
          </div>
          <div className="ctx-section">
            <button className="ctx-canvas-btn" style={{ marginTop: 2, color: '#c84848', borderColor: '#c8484844' }}
              onClick={() => { onRemoveArrow(contextMenu.id); setContextMenu(null) }}>Delete Arrow</button>
          </div>
        </div>
      )}

      {/* ── Player / marker / boss right-click menu ── */}
      {contextMenu && contextMenu.type !== 'canvas' && contextMenu.type !== 'field-effect' && contextMenu.type !== 'text' && contextMenu.type !== 'arrow' && contextMenu.type !== 'swirl' && (
        <div ref={ctxMenuRef} className="ctx-menu" style={{ left: contextMenu.x + 16, top: contextMenu.y - 8 }}>
          <div className="ctx-title">
            {contextMenu.type === 'player' ? 'Player' : contextMenu.type === 'marker' ? 'Marker' : 'Boss'}
            <button className="ctx-close" onClick={() => setContextMenu(null)}>×</button>
          </div>
          <div className="ctx-section">
            <div className="ctx-label">Size</div>
            <div className="ctx-scale-row">
              <input type="range" className="ctx-slider"
                min={0.4} max={3} step={0.05}
                value={contextMenu.scale}
                onChange={e => {
                  const s = Number(e.target.value)
                  setContextMenu(m => ({ ...m, scale: s }))
                  const ctxKey = `${contextMenu.type}:${contextMenu.id}`
                  if (selectedAll.size > 1 && selectedAll.has(ctxKey)) {
                    for (const sel of selectedAll) {
                      const sep = sel.indexOf(':'); const t = sel.slice(0, sep); const id = sel.slice(sep + 1)
                      if (t === 'player') onUpdatePlayerScale(id, s)
                      else if (t === 'marker') onUpdateMarkerScale(id, s)
                      else if (t === 'boss') onUpdateBossScale(id, s)
                    }
                  } else {
                    if (contextMenu.type === 'player') onUpdatePlayerScale(contextMenu.id, s)
                    else if (contextMenu.type === 'marker') onUpdateMarkerScale(contextMenu.id, s)
                    else if (contextMenu.type === 'boss') onUpdateBossScale(contextMenu.id, s)
                  }
                }}
              />
              <span className="ctx-scale-val">{Math.round(contextMenu.scale * 100)}%</span>
            </div>
          </div>
          {contextMenu.type === 'player' && contextMenu.isEnemy && (
            <div className="ctx-section">
              <div className="ctx-label">Rotation</div>
              <div className="ctx-scale-row">
                <input type="range" className="ctx-slider"
                  min={0} max={355} step={5}
                  value={contextMenu.rotation ?? 0}
                  onChange={e => {
                    const r = Number(e.target.value)
                    setContextMenu(m => ({ ...m, rotation: r }))
                    if (selectedAll.size > 1 && selectedAll.has(`player:${contextMenu.id}`)) {
                      for (const sel of selectedAll) {
                        const sep = sel.indexOf(':')
                        if (sel.slice(0, sep) === 'player') onUpdatePlayerRotation(sel.slice(sep + 1), r)
                      }
                    } else {
                      onUpdatePlayerRotation(contextMenu.id, r)
                    }
                  }}
                />
                <span className="ctx-scale-val">{Math.round(contextMenu.rotation ?? 0)}°</span>
              </div>
              <div className="arrow-style-row" style={{ marginTop: 4 }}>
                {[0, 90, 180, 270].map(deg => (
                  <button key={deg} className={`arrow-style-btn ${(contextMenu.rotation ?? 0) === deg ? 'active' : ''}`}
                    onClick={() => {
                      setContextMenu(m => ({ ...m, rotation: deg }))
                      if (selectedAll.size > 1 && selectedAll.has(`player:${contextMenu.id}`)) {
                        for (const sel of selectedAll) {
                          const sep = sel.indexOf(':')
                          if (sel.slice(0, sep) === 'player') onUpdatePlayerRotation(sel.slice(sep + 1), deg)
                        }
                      } else {
                        onUpdatePlayerRotation(contextMenu.id, deg)
                      }
                    }}
                  >{deg}°</button>
                ))}
              </div>
            </div>
          )}
          {(contextMenu.type === 'player' || contextMenu.type === 'boss') && (
            <div className="ctx-section ctx-section-full">
              <div className="ctx-label">Effect</div>
              {/* Grouped */}
              {EFFECT_GROUPS.map(group => {
                const isOpen = openEffectGroups.has(group.label)
                const hasActive = group.effects.some(e => e.key === contextMenu.effect)
                return (
                  <div key={group.label} className="ctx-effect-group">
                    <button
                      className={`ctx-effect-group-header ${hasActive ? 'has-active' : ''}`}
                      onClick={() => setOpenEffectGroups(prev => {
                        const next = new Set(prev)
                        if (next.has(group.label)) next.delete(group.label)
                        else next.add(group.label)
                        return next
                      })}
                    >
                      <span className="ctx-effect-group-arrow">{isOpen ? '▾' : '▸'}</span>
                      <span className="ctx-effect-group-name">{group.label}</span>
                      {hasActive && <span className="ctx-effect-group-dot" />}
                    </button>
                    {isOpen && (
                      <div className="effect-grid" style={{ padding: '3px 4px 5px' }}>
                        {group.effects.map(eff => (
                          <button key={eff.key}
                            className={`effect-btn ${contextMenu.effect === eff.key ? 'active' : ''}`}
                            title={eff.desc}
                            onClick={() => {
                              const newEff = contextMenu.effect === eff.key ? null : eff.key
                              setContextMenu(m => ({ ...m, effect: newEff }))
                              if (contextMenu.type === 'boss') {
                                onSetBossEffect(contextMenu.id, newEff)
                              } else if (selectedAll.size > 1 && selectedAll.has(`player:${contextMenu.id}`)) {
                                for (const sel of selectedAll) {
                                  const sep = sel.indexOf(':')
                                  if (sel.slice(0, sep) === 'player') onSetPlayerEffect(sel.slice(sep + 1), newEff)
                                }
                              } else {
                                onSetPlayerEffect(contextMenu.id, newEff)
                              }
                            }}
                          >
                            <span className="effect-emoji">{eff.emoji}</span>
                            <span className="effect-label-text">{eff.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {contextMenu.effect && (
                <button
                  className={`persist-btn ${contextMenu.effectStopped ? 'active' : ''}`}
                  style={{ margin: '4px 4px 2px' }}
                  onClick={() => {
                    const next = !contextMenu.effectStopped
                    setContextMenu(m => ({ ...m, effectStopped: next }))
                    if (contextMenu.type === 'boss') onToggleBossEffectStopped(contextMenu.id)
                    else onToggleEffectStopped(contextMenu.id)
                  }}
                >
                  {contextMenu.effectStopped ? '▶ Animate' : '⏸ Freeze Effect'}
                </button>
              )}
            </div>
          )}
          <div className="ctx-section">
            <div className="ctx-label">Label</div>
            <input type="text" className="ctx-text-input"
              value={contextMenu.label ?? ''}
              placeholder="Add label..."
              onChange={e => {
                const label = e.target.value
                setContextMenu(m => ({ ...m, label }))
                if (contextMenu.type === 'player') onUpdatePlayerLabel(contextMenu.id, label)
                else if (contextMenu.type === 'marker') onUpdateMarkerLabel(contextMenu.id, label)
                else if (contextMenu.type === 'boss') onUpdateBossLabel(contextMenu.id, label)
              }}
            />
          </div>
          {contextMenu.type === 'player' && !contextMenu.isEnemy && (
            <div className="ctx-section">
              {/* Scope tabs */}
              <div className="ctx-class-scope-row">
                <button
                  className={`ctx-scope-btn ${contextMenu.classScope === 'all' ? 'active' : ''}`}
                  onClick={() => setContextMenu(m => ({ ...m, classScope: 'all', showClassPicker: false }))}
                >⚔ Whole Fight</button>
                <button
                  className={`ctx-scope-btn ${contextMenu.classScope === 'frames' ? 'active' : ''}`}
                  onClick={() => setContextMenu(m => ({ ...m, classScope: 'frames', showClassPicker: true, classScopeFrames: new Set() }))}
                >🎞 Frames Only</button>
              </div>
              {/* Clear frame override (shown when current frame has one) */}
              {contextMenu.hasClassOverride && contextMenu.classScope === 'all' && (
                <button className="ctx-clear-override-btn" onClick={() => {
                  onClearPlayerClassOverride(contextMenu.id, [activeKeyframe])
                  setContextMenu(m => ({ ...m, hasClassOverride: false }))
                }}>× Clear this frame's class override</button>
              )}
              {/* Class picker toggle */}
              <button className="ctx-label ctx-collapsible-label"
                onClick={() => setContextMenu(m => ({ ...m, showClassPicker: !m.showClassPicker }))}>
                {contextMenu.classScope === 'frames' ? 'Pick Class' : 'Change Class'}
                <span className="ctx-chevron">{contextMenu.showClassPicker ? '▴' : '▾'}</span>
              </button>
              {contextMenu.showClassPicker && (
                <>
                  <div className="ctx-icon-grid ctx-class-grid">
                    {WOW_CLASSES.map(cls => (
                      <img key={cls.key} src={cls.icon} alt={cls.label} className="ctx-icon"
                        title={cls.label}
                        style={{ outline: contextMenu.classKey === cls.key ? '2px solid #c8a95f' : 'none' }}
                        onClick={() => {
                          if (contextMenu.classScope === 'all') {
                            onUpdatePlayerClass(contextMenu.id, cls.key)
                            setContextMenu(m => ({
                              ...m,
                              classKey: cls.key, classIcon: cls.icon,
                              specs: cls.specs ?? [], specKey: null,
                              showClassPicker: false,
                            }))
                          } else {
                            setContextMenu(m => ({
                              ...m,
                              classKey: cls.key, classIcon: cls.icon,
                              specs: cls.specs ?? [], specKey: null,
                            }))
                          }
                        }}
                      />
                    ))}
                  </div>
                  {/* Inline spec picker for frames scope */}
                  {contextMenu.classScope === 'frames' && contextMenu.specs?.length > 0 && (
                    <>
                      <div className="ctx-label" style={{ marginTop: 4 }}>Spec (optional)</div>
                      <div className="ctx-icon-grid">
                        {contextMenu.classIcon && (
                          <img src={contextMenu.classIcon} alt="Class" className="ctx-icon"
                            style={{ outline: !contextMenu.specKey ? '2px solid #c8a95f' : 'none' }}
                            onClick={() => setContextMenu(m => ({ ...m, specKey: null }))}
                          />
                        )}
                        {contextMenu.specs.map(spec => (
                          <img key={spec.key} src={spec.icon} alt={spec.label} className="ctx-icon"
                            style={{ outline: contextMenu.specKey === spec.key ? '2px solid #c8a95f' : 'none' }}
                            onClick={() => setContextMenu(m => ({ ...m, specKey: spec.key }))}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {/* Frame picker for frames scope */}
                  {contextMenu.classScope === 'frames' && (
                    <div className="ctx-class-frame-picker">
                      <div className="ctx-label" style={{ marginTop: 6 }}>Apply to frames</div>
                      <div className="frame-picker-grid">
                        {keyframes.map((_, idx) => {
                          const isSelected = contextMenu.classScopeFrames?.has(idx)
                          return (
                            <button key={idx}
                              className={`frame-picker-btn ${idx === activeKeyframe ? 'current' : ''} ${isSelected ? 'active' : ''}`}
                              onClick={() => setContextMenu(m => {
                                const next = new Set(m.classScopeFrames)
                                next.has(idx) ? next.delete(idx) : next.add(idx)
                                return { ...m, classScopeFrames: next }
                              })}
                            >{idx + 1}</button>
                          )
                        })}
                      </div>
                      <div className="frame-picker-actions">
                        <button className="frame-picker-sel-btn"
                          onClick={() => setContextMenu(m => ({ ...m, classScopeFrames: new Set(keyframes.map((_, i) => i)) }))}>All</button>
                        <button className="frame-picker-sel-btn"
                          onClick={() => setContextMenu(m => ({ ...m, classScopeFrames: new Set() }))}>None</button>
                        <button className="frame-picker-apply-btn"
                          disabled={!contextMenu.classScopeFrames?.size}
                          onClick={() => {
                            onSetPlayerClassForFrames(
                              contextMenu.id,
                              contextMenu.classKey,
                              contextMenu.specKey ?? null,
                              [...(contextMenu.classScopeFrames ?? [])]
                            )
                            setContextMenu(null)
                          }}
                        >Apply to {contextMenu.classScopeFrames?.size ?? 0} frame{contextMenu.classScopeFrames?.size === 1 ? '' : 's'}</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {contextMenu.type === 'player' && !contextMenu.isEnemy && contextMenu.classScope === 'all' && contextMenu.specs && contextMenu.specs.length > 0 && (
            <div className="ctx-section">
              <div className="ctx-label">Spec</div>
              <div className="ctx-icon-grid">
                {contextMenu.classIcon && (
                  <img key="class" src={contextMenu.classIcon} alt="Class" className="ctx-icon"
                    style={{ outline: !contextMenu.specKey ? '2px solid #c8a95f' : 'none' }}
                    onClick={() => {
                      onUpdatePlayerSpec(contextMenu.id, null)
                      setContextMenu(m => ({ ...m, specKey: null }))
                    }}
                  />
                )}
                {contextMenu.specs.map(spec => (
                  <img key={spec.key} src={spec.icon} alt={spec.label} className="ctx-icon"
                    style={{ outline: contextMenu.specKey === spec.key ? '2px solid #c8a95f' : 'none' }}
                    onClick={() => {
                      onUpdatePlayerSpec(contextMenu.id, spec.key)
                      setContextMenu(m => ({ ...m, specKey: spec.key }))
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="ctx-action-row">
            <button className="ctx-action-btn" onClick={() => { onCopyObject(contextMenu); setContextMenu(null) }}>📋 Copy</button>
            {keyframes.length > 1 && (
              <button className="ctx-action-btn" onClick={() => setContextMenu(m => ({ ...m, showFramePicker: !m.showFramePicker, pickerFrames: new Set() }))}>
                🗂 Frames
              </button>
            )}
            {contextMenu.type === 'player' && (
              <button className="ctx-action-btn"
                onClick={() => setContextMenu(m => ({ ...m, showSwapPicker: !m.showSwapPicker, swapFromFrame: activeKeyframe }))}>
                ↔ Swap
              </button>
            )}
            {pageCount > 1 && (
              <button className="ctx-action-btn" onClick={() => { onCopyToAllPages(contextMenu.type, contextMenu.id); setContextMenu(null) }}>📄 Pages</button>
            )}
            <button className="ctx-action-btn" onClick={() => {
              if (contextMenu.type === 'player') onTogglePlayerLocked(contextMenu.id)
              else if (contextMenu.type === 'marker') onToggleMarkerLocked(contextMenu.id)
              else if (contextMenu.type === 'boss') onToggleBossLocked(contextMenu.id)
              setContextMenu(m => ({ ...m, locked: !m.locked }))
            }}>{contextMenu.locked ? '🔓 Unlock' : '🔒 Lock'}</button>
          </div>
          {contextMenu.showSwapPicker && (() => {
            const activeSwap = (swaps ?? []).find(s => s.playerA === contextMenu.id || s.playerB === contextMenu.id)
            const partnerId  = activeSwap ? (activeSwap.playerA === contextMenu.id ? activeSwap.playerB : activeSwap.playerA) : null
            const partner    = partnerId ? players[partnerId] : null
            const partnerCls = partner ? (WOW_CLASSES.find(c => c.key === partner.classKey) ?? ROLE_ICONS.find(r => r.key === partner.classKey) ?? ENEMY_TYPES.find(e => e.key === partner.classKey)) : null
            const partnerSpec = partner?.specKey ? partnerCls?.specs?.find(s => s.key === partner.specKey) : null
            const swapFromFrame = contextMenu.swapFromFrame ?? activeKeyframe
            return (
              <div className="ctx-section ctx-section-full ctx-swap-picker">
                {/* Current swap status */}
                {activeSwap ? (
                  <div className="ctx-swap-current">
                    <img src={partnerSpec?.icon ?? partnerCls?.icon} alt="" className="ctx-swap-icon" />
                    <span className="ctx-swap-current-name">{partner?.name || partnerCls?.label || '?'}</span>
                    <span className="ctx-swap-current-from">
                      fr.{activeSwap.fromFrame + 1}{activeSwap.toFrame != null ? `–${activeSwap.toFrame}` : '+'}
                    </span>
                    <button className="ctx-swap-remove-btn" onClick={() => { onRemovePlayerSwap(contextMenu.id); setContextMenu(null) }}>✕ None</button>
                  </div>
                ) : (
                  <div className="ctx-swap-none-label">No swap set</div>
                )}

                {/* Swap starts on frame */}
                <div className="ctx-label" style={{ marginTop: 6 }}>Swap starts on frame</div>
                <div className="frame-picker-grid">
                  {keyframes.map((_, idx) => (
                    <button key={idx}
                      className={`frame-picker-btn ${swapFromFrame === idx ? 'active' : ''}`}
                      onClick={() => setContextMenu(m => ({ ...m, swapFromFrame: idx }))}
                    >{idx + 1}</button>
                  ))}
                </div>

                {/* Unswap (revert) from frame — only when a partner is already set */}
                {activeSwap && (
                  <>
                    <div className="ctx-label" style={{ marginTop: 6 }}>Unswap from frame</div>
                    <div className="frame-picker-grid">
                      {keyframes.map((_, idx) => {
                        if (idx <= activeSwap.fromFrame) return <button key={idx} className="frame-picker-btn" disabled style={{ opacity: 0.25 }}>{idx + 1}</button>
                        return (
                          <button key={idx}
                            className={`frame-picker-btn ${activeSwap.toFrame === idx ? 'active' : ''}`}
                            onClick={() => onSetSwapToFrame(contextMenu.id, activeSwap.toFrame === idx ? null : idx)}
                          >{idx + 1}</button>
                        )
                      })}
                    </div>
                    {activeSwap.toFrame != null && (
                      <button className="ctx-swap-remove-btn" style={{ marginTop: 4, width: '100%' }}
                        onClick={() => onSetSwapToFrame(contextMenu.id, null)}>✕ Clear unswap</button>
                    )}
                  </>
                )}

                {/* Partner picker */}
                <div className="ctx-label" style={{ marginTop: 6 }}>Swap with</div>
                <div className="ctx-swap-player-list">
                  {Object.values(players)
                    .filter(p => p.id !== contextMenu.id)
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(p => {
                      const cls  = WOW_CLASSES.find(c => c.key === p.classKey) ?? ROLE_ICONS.find(r => r.key === p.classKey) ?? ENEMY_TYPES.find(e => e.key === p.classKey)
                      const spec = p.specKey ? cls?.specs?.find(s => s.key === p.specKey) : null
                      const isActive = p.id === partnerId
                      return (
                        <button key={p.id}
                          className={`ctx-swap-target-btn ${isActive ? 'active' : ''}`}
                          onClick={() => { onSetPlayerSwap(contextMenu.id, p.id, swapFromFrame); setContextMenu(null) }}
                        >
                          <img src={spec?.icon ?? cls?.icon} alt="" className="ctx-swap-icon" />
                          <span>{p.name || p.label || cls?.label || '?'}</span>
                          {isActive && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#b58900' }}>↔</span>}
                        </button>
                      )
                    })
                  }
                </div>
              </div>
            )
          })()}
          {contextMenu.showFramePicker && (
            <div className="ctx-section ctx-section-full ctx-frame-picker">
              <div className="ctx-label">Duplicate to frames</div>
              <div className="frame-picker-grid">
                {keyframes.map((_, idx) => {
                  const isCurrent = idx === activeKeyframe
                  const isSelected = contextMenu.pickerFrames?.has(idx)
                  return (
                    <button key={idx}
                      className={`frame-picker-btn ${isCurrent ? 'current' : ''} ${isSelected ? 'active' : ''}`}
                      disabled={isCurrent}
                      onClick={() => setContextMenu(m => {
                        const next = new Set(m.pickerFrames)
                        next.has(idx) ? next.delete(idx) : next.add(idx)
                        return { ...m, pickerFrames: next }
                      })}
                    >{idx + 1}</button>
                  )
                })}
              </div>
              <div className="frame-picker-actions">
                <button className="frame-picker-sel-btn" onClick={() => setContextMenu(m => ({
                  ...m, pickerFrames: new Set(keyframes.map((_, i) => i).filter(i => i !== activeKeyframe))
                }))}>All</button>
                <button className="frame-picker-sel-btn" onClick={() => setContextMenu(m => ({ ...m, pickerFrames: new Set() }))}>None</button>
                <button className="frame-picker-apply-btn"
                  disabled={!contextMenu.pickerFrames?.size}
                  onClick={() => {
                    onDuplicateToFrames(contextMenu.type, contextMenu.id, [...(contextMenu.pickerFrames ?? [])])
                    setContextMenu(null)
                  }}
                >Duplicate to {contextMenu.pickerFrames?.size ?? 0} frame{contextMenu.pickerFrames?.size === 1 ? '' : 's'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
