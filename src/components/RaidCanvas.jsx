import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Stage, Layer, Image, Circle, Text, Arrow, Group, Wedge, Line, Rect } from 'react-konva'
import { WOW_CLASSES, ROLE_ICONS, ENEMY_TYPES } from '../data/classes'
import { WORLD_MARKERS } from '../data/markers'
import { IMMERSEUS_IMG } from '../data/bosses'
import { EFFECTS } from '../data/effects'

function useImage(src) {
  const [img, setImg] = useState(null)
  useEffect(() => {
    if (!src) { setImg(null); return }
    let cancelled = false
    const el = new window.Image()
    el.crossOrigin = 'anonymous'
    el.onload  = () => { if (!cancelled) setImg(el) }
    el.onerror = () => { if (!cancelled) setImg(null) }
    el.src = src
    return () => { cancelled = true }
  }, [src])
  return img
}

function useRedTintCanvas(iconImg, size) {
  return useMemo(() => {
    if (!iconImg) return null
    const c = document.createElement('canvas')
    c.width  = size
    c.height = size
    const ctx = c.getContext('2d')
    ctx.drawImage(iconImg, 0, 0, size, size)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = 'rgb(220,0,0)'
    ctx.fillRect(0, 0, size, size)
    return c
  }, [iconImg, size])
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
      const r = 26 + 4 * Math.sin(t * 2.2)
      const a = 0.55 + 0.25 * Math.sin(t * 2.2)
      return <>
        <Circle radius={r} fill={`rgba(${clr(255,200,30)},${a * 0.18})`}
          stroke={`rgba(${clr(255,215,60)},${a})`} strokeWidth={3} listening={false} />
        <Circle radius={r - 7} fill={`rgba(${clr(255,220,50)},0.04)`}
          stroke={`rgba(${clr(255,240,150)},${a * 0.4})`} strokeWidth={1} listening={false} />
      </>
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
    case 'froststun':
      return <FrostStunEffect t={t} />
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

// ─── Player marker ────────────────────────────────────────────────────────────

function PlayerMarker({
  player, pos, isSelected, isMultiSelected, isPlaying, tool, effectTime,
  onAction, onDragEnd, onDragEndMulti, groupRef, onDragStart, onDragMove, onShowContextMenu,
}) {
  const cls  = WOW_CLASSES.find(c => c.key === player.classKey)
            ?? ROLE_ICONS.find(r => r.key === player.classKey)
            ?? ENEMY_TYPES.find(e => e.key === player.classKey)
  const isEnemy  = cls?.isEnemy ?? false
  const isLocked = player.locked ?? false
  const spec = player.specKey ? cls?.specs?.find(s => s.key === player.specKey) : null
  const iconImg    = useImage(spec ? spec.icon : cls?.icon)
  const redTintImg = useRedTintCanvas(iconImg, 36)
  const color  = cls?.color ?? '#888'
  const R_BASE = 18
  const scale  = player.scale ?? 1
  const R      = R_BASE * scale

  const { x: offX, y: offY } = getEffectOffset(player.effect, effectTime)

  const handleClick = (e) => {
    e.cancelBubble = true
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
      scale: player.scale ?? 1, classKey: player.classKey, specKey: player.specKey ?? null,
      classIcon: cls?.icon ?? null, specs: cls?.specs ?? [],
      label: player.canvasLabel ?? '', name: player.name ?? '',
      effect: player.effect ?? null,
      locked: isLocked,
    })
  }

  const redFlashAlpha = player.effect === 'redflash'
    ? 0.08 + 0.52 * (0.5 + 0.5 * Math.sin(effectTime * 2.5))
    : 0

  return (
    <Group
      ref={groupRef}
      x={pos.x + offX} y={pos.y + offY}
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onDragStart={e => {
        if (isMultiSelected && onDragStart) onDragStart(player.id, e.target.x(), e.target.y())
      }}
      onDragMove={e => {
        if (isMultiSelected && onDragMove) onDragMove(e, player.id)
      }}
      onDragEnd={e => {
        if (isMultiSelected) {
          onDragEndMulti(player.id, e.target.x(), e.target.y())
        } else {
          onDragEnd(e)
        }
      }}
    >
      {player.effect && <Group listening={false}><EffectBehind effect={player.effect} color={color} t={effectTime} /></Group>}

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
            </Group>
            <Circle radius={R_BASE} fill="transparent" stroke={color} strokeWidth={2.5} />
          </>
        )}
      </Group>

      {/* Hit area — always base icon size regardless of scale */}
      {isEnemy
        ? <Rect x={-R_BASE} y={-R_BASE} width={R_BASE*2} height={R_BASE*2} fill="rgba(0,0,0,0.01)" />
        : <Circle radius={R_BASE} fill="rgba(0,0,0,0.01)" />
      }

      {player.canvasLabel && <Text text={player.canvasLabel} x={-R * 1.8} y={R + 3} width={R * 3.6} align="center"
        fontSize={9} fill="#ddd" shadowColor="#000" shadowBlur={3} listening={false} />}

      {/* Lock indicator */}
      {isLocked && (
        <Text text="🔒" x={R - 6} y={-R - 14} fontSize={10} listening={false} />
      )}

      {player.effect && <Group listening={false}><EffectAbove effect={player.effect} t={effectTime} /></Group>}
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

function SwirlOverlay({ swirl, swirlAngle, beamLen, isPlaying, tool, onMoveSwirl, onRemoveSwirl }) {
  const [localAngle, setLocalAngle] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    if (isPlaying) return
    let start = null
    const tick = ts => {
      if (!start) start = ts
      setLocalAngle(((ts - start) / 5000) * 360 % 360)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying])

  const angle = isPlaying ? swirlAngle : localAngle
  const baseAngle  = (swirl.clockwise ? angle : -angle) - 90
  const radLeading = baseAngle * (Math.PI / 180)
  const lineX = Math.cos(radLeading) * beamLen
  const lineY = Math.sin(radLeading) * beamLen

  return (
    <Group
      x={swirl.x} y={swirl.y}
      draggable={!isPlaying && tool === 'select'}
      onDragEnd={e => onMoveSwirl(swirl.id, e.target.x(), e.target.y())}
      onClick={e => { e.cancelBubble = true; if (tool === 'delete') onRemoveSwirl(swirl.id) }}
      onMouseDown={e => {
        e.cancelBubble = true
        if (e.evt.button === 1) { e.evt.preventDefault(); onRemoveSwirl(swirl.id) }
      }}
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

function MarkerElement({ marker, isPlaying, tool, onMoveMarker, onRemoveMarker, onShowContextMenu }) {
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
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onDragEnd={e => onMoveMarker(marker.id, e.target.x(), e.target.y())}
      onClick={e => {
        e.cancelBubble = true
        if (!isLocked && tool === 'delete') onRemoveMarker(marker.id)
      }}
      onMouseDown={e => {
        e.cancelBubble = true
        if (e.evt.button === 1) { e.evt.preventDefault(); if (!isLocked) onRemoveMarker(marker.id) }
      }}
      onContextMenu={handleContextMenu}
    >
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

function BossElement({ boss, tool, isPlaying, onMoveBoss, onRemoveBoss, onShowContextMenu }) {
  const img      = useImage(IMMERSEUS_IMG)
  const isLocked = boss.locked ?? false
  const sc       = boss.scale ?? 1

  const handleContextMenu = (e) => {
    e.evt.preventDefault()
    e.cancelBubble = true
    onShowContextMenu({ type: 'boss', id: boss.id, x: e.evt.clientX, y: e.evt.clientY,
      canvasX: boss.x, canvasY: boss.y,
      bossType: boss.type,
      scale: sc, label: boss.canvasLabel ?? '',
      locked: isLocked,
    })
  }

  return (
    <Group
      x={boss.x} y={boss.y}
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onDragEnd={e => onMoveBoss(boss.id, e.target.x(), e.target.y())}
      onClick={e => {
        e.cancelBubble = true
        if (!isLocked && tool === 'delete') onRemoveBoss(boss.id)
      }}
      onMouseDown={e => {
        e.cancelBubble = true
        if (e.evt.button === 1) { e.evt.preventDefault(); if (!isLocked) onRemoveBoss(boss.id) }
      }}
      onContextMenu={handleContextMenu}
    >
      <Group scaleX={sc} scaleY={sc}>
        <Circle radius={80} fill="rgba(0,0,0,0.01)" />
        {img && (
          <Image image={img} x={-80} y={-80} width={160} height={160} listening={false} />
        )}
      </Group>
      {boss.canvasLabel && (
        <Text text={boss.canvasLabel} x={-70} y={80 * sc + 6} width={140} align="center"
          fontSize={10} fill="#ddd" shadowColor="#000" shadowBlur={3} listening={false} />
      )}
      {isLocked && (
        <Text text="🔒" x={70 * sc - 6} y={-80 * sc - 14} fontSize={10} listening={false} />
      )}
    </Group>
  )
}

// ─── Text background ─────────────────────────────────────────────────────────

function computeBgDims(textEl) {
  const fs = textEl.fontSize ?? 16
  const lines = (textEl.text || ' ').split('\n')
  const maxLen = Math.max(...lines.map(l => l.length), 1)
  const padX = 10, padY = 7
  const w = maxLen * fs * 0.56 + padX * 2
  const h = lines.length * fs * 1.18 + padY * 2
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

function TextElement({ textEl, isSelected, isPlaying, tool, onAction, onDragEnd, onShowContextMenu }) {
  const fs         = textEl.fontSize ?? 16
  const fontStyle  = textEl.bold ? 'bold' : 'normal'
  const fontFamily = textEl.fontFamily ?? 'sans-serif'
  const fill       = textEl.color ?? '#ffffff'
  const hasBg      = (textEl.bgStyle ?? 'none') !== 'none'
  const isLocked   = textEl.locked ?? false

  const handleClick = (e) => {
    e.cancelBubble = true
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

  const { w: bgW, h: bgH, padY: bgPadY } = hasBg ? computeBgDims(textEl) : {}
  const textX     = hasBg ? -bgW / 2 : 0
  const textWidth = hasBg ? bgW      : undefined
  const textAlign = hasBg ? 'center' : undefined

  let selRect = null
  if (isSelected) {
    if (hasBg) {
      selRect = <Rect x={-bgW/2 - 3} y={-bgPadY - 3} width={bgW + 6} height={bgH + 6}
        stroke="#c8a95f" strokeWidth={1.5} dash={[4, 3]} fill="transparent" listening={false} />
    } else {
      const w = (textEl.text?.length ?? 1) * fs * 0.6 + 8
      const h = fs + 8
      selRect = <Rect x={-4} y={-4} width={w} height={h}
        stroke="#c8a95f" strokeWidth={1.5} dash={[4, 3]} fill="transparent" listening={false} />
    }
  }

  return (
    <Group
      x={textEl.x} y={textEl.y}
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onDragEnd={onDragEnd}
    >
      <TextBackground textEl={textEl} />
      <Text
        x={textX}
        text={textEl.text || ' '}
        fontSize={fs}
        fontStyle={fontStyle}
        fontFamily={fontFamily}
        fill={fill}
        width={textWidth}
        align={textAlign}
        shadowColor="rgba(0,0,0,0.8)"
        shadowBlur={4}
        shadowOffset={{ x: 1, y: 1 }}
      />
      {selRect}
      {isLocked && (
        <Text text="🔒" x={hasBg ? bgW / 2 - 10 : 4} y={hasBg ? -bgPadY - 14 : -14}
          fontSize={9} listening={false} />
      )}
    </Group>
  )
}

// ─── Standalone field effect ──────────────────────────────────────────────────

function FieldEffectElement({ fe, tool, isPlaying, onMove, onRemove, onShowContextMenu, effectTime }) {
  const isLocked = fe.locked ?? false
  return (
    <Group
      x={fe.x} y={fe.y}
      draggable={!isPlaying && tool === 'select' && !isLocked}
      onDragEnd={e => onMove(fe.id, e.target.x(), e.target.y())}
      onMouseDown={e => {
        e.cancelBubble = true
        if (e.evt.button === 1) { e.evt.preventDefault(); if (!isLocked) onRemove(fe.id) }
      }}
      onContextMenu={e => {
        e.evt.preventDefault()
        e.cancelBubble = true
        onShowContextMenu({ type: 'field-effect', id: fe.id, x: e.evt.clientX, y: e.evt.clientY,
          color: fe.color ?? null, locked: isLocked })
      }}
    >
      <Circle radius={52} fill="rgba(0,0,0,0.01)" />
      <EffectBehind effect={fe.effect} color="#c8a95f" colorOverride={fe.color ?? null} t={effectTime} />
      <EffectAbove  effect={fe.effect} t={effectTime} />
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

// ─── Main canvas ──────────────────────────────────────────────────────────────

export default function RaidCanvas({
  stageRef,
  width, height, players, positions, arrows, swirls, swirlAngle, texts, markers, bosses, bgImage,
  tool, setTool, isPlaying, selectedId, selectedTextId, selectedIds,
  onSelectPlayer, onSetSelectedIds, onSelectText,
  onMovePlayer, onMoveSelected, onAddPlayer,
  onAddText, onAddArrow, onAddMarker, onAddBoss,
  onRemovePlayer, onRemoveArrow, onMoveArrow,
  onMoveSwirl, onRemoveSwirl,
  onMoveText, onRemoveText,
  onMoveMarker, onRemoveMarker,
  onMoveBoss, onRemoveBoss,
  fieldEffects, onAddFieldEffect, onMoveFieldEffect, onRemoveFieldEffect, onUpdateFieldEffect,
  onUpdatePlayerScale, onUpdatePlayerSpec, onUpdateMarkerScale, onUpdateBossScale,
  onUpdatePlayerLabel, onUpdateMarkerLabel, onUpdateBossLabel,
  arrowStyle, onArrowStyleChange,
  clipboard, onCopyObject, onPasteAt,
  onTogglePlayerLocked, onToggleTextLocked, onToggleMarkerLocked,
  onToggleBossLocked, onToggleFieldEffectLocked,
}) {
  const bgImg   = useImage(bgImage)
  const beamLen = Math.max(width, height) * 1.6

  const [arrowStart,   setArrowStart]   = useState(null)
  const [mousePos,     setMousePos]     = useState({ x: 0, y: 0 })
  const [selectionBox, setSelectionBox] = useState(null)
  const [contextMenu,  setContextMenu]  = useState(null)

  const selectionStartRef = useRef(null)
  const selectionBoxRef   = useRef(null)
  const isDraggingSelRef  = useRef(false)
  const ctxMenuRef        = useRef(null)

  const playerGroupRefs = useRef({})
  const dragStateRef    = useRef(null)
  const selectedIdsRef  = useRef(selectedIds)
  const positionsRef    = useRef(positions)
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])
  useEffect(() => { positionsRef.current   = positions },   [positions])

  const [effectTime, setEffectTime] = useState(0)
  const effectRafRef = useRef(null)
  const hasAnyEffect   = Object.values(players).some(p => p.effect)
  const hasAnyFieldFx  = (fieldEffects ?? []).length > 0
  const needsAnimClock = hasAnyEffect || hasAnyFieldFx

  useEffect(() => {
    if (!needsAnimClock) { setEffectTime(0); return }
    let startTs = null
    const tick = (ts) => {
      if (!startTs) startTs = ts
      setEffectTime((ts - startTs) / 1000)
      effectRafRef.current = requestAnimationFrame(tick)
    }
    effectRafRef.current = requestAnimationFrame(tick)
    return () => { if (effectRafRef.current) cancelAnimationFrame(effectRafRef.current) }
  }, [needsAnimClock])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { setArrowStart(null); setContextMenu(null) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
        onSetSelectedIds(inBox)
      } else {
        onSetSelectedIds(new Set())
      }
      selectionBoxRef.current = null
      setSelectionBox(null)
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [onSetSelectedIds])

  const handleShowContextMenu = useCallback((info) => {
    setContextMenu(info)
  }, [])

  const handlePlayerDragStart = useCallback((playerId, startX, startY) => {
    dragStateRef.current = { id: playerId, startX, startY, dx: 0, dy: 0 }
  }, [])

  const handlePlayerDragMove = useCallback((e, playerId) => {
    if (!dragStateRef.current || dragStateRef.current.id !== playerId) return
    const dx = e.target.x() - dragStateRef.current.startX
    const dy = e.target.y() - dragStateRef.current.startY
    dragStateRef.current.dx = dx
    dragStateRef.current.dy = dy
    selectedIdsRef.current.forEach(otherId => {
      if (otherId === playerId) return
      const node = playerGroupRefs.current[otherId]
      const p    = positionsRef.current[otherId]
      if (node && p) { node.x(p.x + dx); node.y(p.y + dy) }
    })
    e.target.getLayer().batchDraw()
  }, [])

  const handlePlayerDragEndMulti = useCallback((playerId, newX, newY) => {
    const ds = dragStateRef.current
    dragStateRef.current = null
    onMoveSelected(playerId, newX, newY, ds?.dx ?? 0, ds?.dy ?? 0)
  }, [onMoveSelected])

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

  const handleStageClick = (e) => {
    const pos = e.target.getStage().getPointerPosition()
    if (tool === 'arrow') {
      if (!arrowStart) { setArrowStart(pos) }
      else { onAddArrow(arrowStart.x, arrowStart.y, pos.x, pos.y); setArrowStart(null); setTool('select') }
    } else if (tool === 'text') {
      onAddText(pos.x, pos.y)
      setTool('select')
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

  const ARROW_COLORS = ['#ff4444', '#ffdd44', '#44ddff', '#44ff88', '#ffffff', '#ff88ff', '#ff8844', '#aaaaaa']

  return (
    <div
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
              isPlaying={isPlaying} tool={tool} onMoveSwirl={onMoveSwirl} onRemoveSwirl={onRemoveSwirl} />
          ))}
        </Layer>

        <Layer>
          {(bosses ?? []).map(b => (
            <BossElement key={b.id} boss={b} tool={tool} isPlaying={isPlaying}
              onMoveBoss={onMoveBoss} onRemoveBoss={onRemoveBoss}
              onShowContextMenu={handleShowContextMenu} />
          ))}
        </Layer>

        <Layer>
          {(markers ?? []).map(m => (
            <MarkerElement key={m.id} marker={m}
              isPlaying={isPlaying} tool={tool}
              onMoveMarker={onMoveMarker} onRemoveMarker={onRemoveMarker}
              onShowContextMenu={handleShowContextMenu} />
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
              onClick={e => { e.cancelBubble = true; if (tool === 'delete') onRemoveArrow(a.id) }}
              onMouseDown={e => {
                e.cancelBubble = true
                if (e.evt.button === 1) { e.evt.preventDefault(); onRemoveArrow(a.id) }
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
              tool={tool} isPlaying={isPlaying} effectTime={effectTime}
              onMove={onMoveFieldEffect} onRemove={onRemoveFieldEffect}
              onShowContextMenu={setContextMenu} />
          ))}
        </Layer>

        <Layer>
          {Object.values(players).map(player => {
            const pos     = positions[player.id] ?? { x: width / 2, y: height / 2 }
            const isMulti = selectedIds?.has(player.id) ?? false
            return (
              <PlayerMarker key={player.id} player={player} pos={pos}
                isSelected={player.id === selectedId}
                isMultiSelected={isMulti}
                isPlaying={isPlaying} tool={tool} effectTime={effectTime}
                onAction={handlePlayerAction}
                groupRef={el => {
                  if (el) playerGroupRefs.current[player.id] = el
                  else delete playerGroupRefs.current[player.id]
                }}
                onDragStart={isMulti ? handlePlayerDragStart : null}
                onDragMove={isMulti ? handlePlayerDragMove : null}
                onDragEnd={e => onMovePlayer(player.id, e.target.x(), e.target.y())}
                onDragEndMulti={handlePlayerDragEndMulti}
                onShowContextMenu={handleShowContextMenu}
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
              onAction={handleTextAction}
              onDragEnd={e => onMoveText(t.id, e.target.x(), e.target.y())}
              onShowContextMenu={handleShowContextMenu} />
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
      </Stage>

      {tool === 'arrow' && (
        <div className="tool-hint">
          {arrowStart ? 'Click to finish arrow (Esc to cancel)' : 'Click to start arrow'}
        </div>
      )}
      {tool === 'text' && (
        <div className="tool-hint">Click on canvas to place text</div>
      )}
      {tool === 'select' && (selectedIds?.size ?? 0) > 1 && (
        <div className="tool-hint">{selectedIds.size} players selected — drag any to move all</div>
      )}

      {/* ── Unified canvas right-click menu ── */}
      {contextMenu?.type === 'canvas' && (
        <div ref={ctxMenuRef} className="ctx-menu ctx-menu-canvas" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="ctx-title">
            Canvas
            <button className="ctx-close" onClick={() => setContextMenu(null)}>×</button>
          </div>

          {/* Main section */}
          {contextMenu.section == null && (
            <>
              <button className="ctx-canvas-btn" onClick={() => {
                onAddText(contextMenu.canvasX, contextMenu.canvasY)
                setContextMenu(null)
              }}>Add Text</button>

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

          {/* Effect sub-menu */}
          {contextMenu.section === 'effect' && (
            <>
              <button className="ctx-back-btn" onClick={() => setContextMenu(m => ({ ...m, section: null }))}>← Back</button>
              <div className="ctx-effects-grid">
                {EFFECTS.map(eff => (
                  <button key={eff.key} className="ctx-effect-btn" title={eff.desc}
                    onClick={() => { onAddFieldEffect(eff.key, contextMenu.canvasX, contextMenu.canvasY); setContextMenu(null) }}
                  >
                    <span className="ctx-effect-emoji">{eff.emoji}</span>
                    <span className="ctx-effect-name">{eff.label}</span>
                  </button>
                ))}
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
        <div ref={ctxMenuRef} className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="ctx-title">
            Effect
            <button className="ctx-close" onClick={() => setContextMenu(null)}>×</button>
          </div>
          <div className="ctx-section">
            <div className="ctx-label">Color</div>
            <div className="text-color-row" style={{ flexWrap: 'wrap', gap: 5 }}>
              <button
                className={`text-color-swatch ${contextMenu.color == null ? 'active' : ''}`}
                style={{ background: 'transparent', border: '1.5px dashed #666', position: 'relative' }}
                onClick={() => { onUpdateFieldEffect(contextMenu.id, { color: null }); setContextMenu(m => ({ ...m, color: null })) }}
                title="Default"
              >
                <span style={{ fontSize: 10, color: '#888', lineHeight: '20px' }}>auto</span>
              </button>
              {['#ff4444','#ff8844','#ffdd44','#44ff88','#44ddff','#4488ff','#8844ff','#ff44ff','#ffffff','#aaaaaa'].map(c => (
                <button key={c}
                  className={`text-color-swatch ${contextMenu.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => { onUpdateFieldEffect(contextMenu.id, { color: c }); setContextMenu(m => ({ ...m, color: c })) }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div className="ctx-section">
            <button className="ctx-lock-btn" onClick={() => {
              onToggleFieldEffectLocked(contextMenu.id)
              setContextMenu(m => ({ ...m, locked: !m.locked }))
            }}>
              {contextMenu.locked ? '🔓 Unlock' : '🔒 Lock'}
            </button>
          </div>
        </div>
      )}

      {/* ── Text right-click menu ── */}
      {contextMenu?.type === 'text' && (
        <div ref={ctxMenuRef} className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="ctx-title">
            Text
            <button className="ctx-close" onClick={() => setContextMenu(null)}>×</button>
          </div>
          <div className="ctx-section">
            <button className="ctx-copy-btn" onClick={() => { onCopyObject(contextMenu); setContextMenu(null) }}>
              📋 Copy
            </button>
          </div>
          <div className="ctx-section">
            <button className="ctx-lock-btn" onClick={() => {
              onToggleTextLocked(contextMenu.id)
              setContextMenu(m => ({ ...m, locked: !m.locked }))
            }}>
              {contextMenu.locked ? '🔓 Unlock' : '🔒 Lock'}
            </button>
          </div>
        </div>
      )}

      {/* ── Player / marker / boss right-click menu ── */}
      {contextMenu && contextMenu.type !== 'canvas' && contextMenu.type !== 'field-effect' && contextMenu.type !== 'text' && (
        <div ref={ctxMenuRef} className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
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
                  if (contextMenu.type === 'player') onUpdatePlayerScale(contextMenu.id, s)
                  else if (contextMenu.type === 'marker') onUpdateMarkerScale(contextMenu.id, s)
                  else if (contextMenu.type === 'boss') onUpdateBossScale(contextMenu.id, s)
                }}
              />
              <span className="ctx-scale-val">{Math.round(contextMenu.scale * 100)}%</span>
            </div>
          </div>
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
          {contextMenu.type === 'player' && contextMenu.specs && contextMenu.specs.length > 0 && (
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
          <div className="ctx-section">
            <button className="ctx-copy-btn" onClick={() => { onCopyObject(contextMenu); setContextMenu(null) }}>
              📋 Copy
            </button>
          </div>
          <div className="ctx-section">
            <button className="ctx-lock-btn" onClick={() => {
              if (contextMenu.type === 'player') onTogglePlayerLocked(contextMenu.id)
              else if (contextMenu.type === 'marker') onToggleMarkerLocked(contextMenu.id)
              else if (contextMenu.type === 'boss') onToggleBossLocked(contextMenu.id)
              setContextMenu(m => ({ ...m, locked: !m.locked }))
            }}>
              {contextMenu.locked ? '🔓 Unlock' : '🔒 Lock'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
