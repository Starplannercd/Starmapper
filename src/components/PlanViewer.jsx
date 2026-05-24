import { useState, useEffect, useRef } from 'react'
import { decompressFromEncodedURIComponent } from 'lz-string'
import RaidCanvas from './RaidCanvas'

const CANVAS_W = 820
const CANVAS_H = 580
const FRAME_DURATION = 2000
const NOOP = () => {}
const NOOP_SET = new Set()

export default function PlanViewer() {
  const [pages, setPages] = useState(null)
  const [bgImage, setBgImage] = useState(null)
  const [error, setError] = useState(null)
  const [activePageIdx, setActivePageIdx] = useState(0)
  const [playT, setPlayT] = useState(0)
  const animRef = useRef(null)

  useEffect(() => {
    try {
      const hash = window.location.hash
      if (!hash.startsWith('#view=')) { setError('No plan data found in URL.'); return }
      const raw = JSON.parse(decompressFromEncodedURIComponent(hash.slice(6)))
      // Support both old format (plain array) and new format ({ pages, bgImage })
      if (Array.isArray(raw)) {
        setPages(raw)
      } else {
        setPages(raw.pages)
        setBgImage(raw.bgImage ?? null)
      }
    } catch {
      setError('Could not load plan — the link may be invalid or corrupted.')
    }
  }, [])

  useEffect(() => {
    if (!pages) return
    const playable = pages
      .map((p, idx) => ({ pageIdx: idx, segs: p.keyframes.length - 1 }))
      .filter(e => e.segs > 0)
    if (playable.length === 0) return

    const total = playable.reduce((s, e) => s + e.segs, 0)
    const totalDuration = total * FRAME_DURATION
    let startTime = null

    function tick(ts) {
      if (!startTime) startTime = ts
      const elapsed = (ts - startTime) % totalDuration
      const globalT = (elapsed / totalDuration) * total
      let remaining = globalT
      let pageIdx = playable[playable.length - 1].pageIdx
      let localT  = playable[playable.length - 1].segs
      for (const entry of playable) {
        if (remaining <= entry.segs) { pageIdx = entry.pageIdx; localT = remaining; break }
        remaining -= entry.segs
      }
      setActivePageIdx(pageIdx)
      setPlayT(localT)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [pages])

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0e0e1a', color: '#ff6666', fontFamily: 'sans-serif', fontSize: 14 }}>
      {error}
    </div>
  )
  if (!pages) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0e0e1a', color: '#666', fontFamily: 'sans-serif', fontSize: 14 }}>
      Loading…
    </div>
  )

  const safePageIdx = Math.min(activePageIdx, pages.length - 1)
  const { players, keyframes } = pages[safePageIdx]
  const currentFrame = Math.round(playT)
  const displayKf = keyframes[Math.min(currentFrame, keyframes.length - 1)] ?? {}

  const visiblePlayers = Object.fromEntries(
    Object.entries(players)
      .filter(([, p]) => (p.birthFrame ?? 0) <= currentFrame)
      .map(([id, p]) => [id, { ...p, effect: displayKf._playerEffects?.[id] ?? null }])
  )

  const frameIndex = Math.min(Math.floor(playT), keyframes.length - 2)
  const t = playT - frameIndex
  const frameA = keyframes[frameIndex] || {}
  const frameB = keyframes[Math.min(frameIndex + 1, keyframes.length - 1)] || frameA
  const displayPositions = {}
  Object.keys(visiblePlayers).forEach(id => {
    const a = frameA[id] || { x: CANVAS_W / 2, y: CANVAS_H / 2 }
    const b = frameB[id] || a
    displayPositions[id] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0e0e1a', gap: 12 }}>
      <RaidCanvas
        width={CANVAS_W} height={CANVAS_H}
        players={visiblePlayers} positions={displayPositions}
        arrows={displayKf._arrows ?? []}
        swirls={displayKf._swirls ?? []} swirlAngle={(playT * 120) % 360}
        texts={displayKf._texts ?? []}
        markers={displayKf._markers ?? []}
        bosses={displayKf._bosses ?? []}
        fieldEffects={displayKf._fieldEffects ?? []}
        bgImage={bgImage}
        tool="select" setTool={NOOP}
        isPlaying={true}
        selectedId={null} selectedTextId={null} selectedIds={NOOP_SET}
        arrowStyle={{ color: '#ff4444', dash: false, strokeWidth: 2.5, twoHeaded: false }}
        clipboard={null}
        onSelectPlayer={NOOP} onSetSelectedIds={NOOP} onSelectText={NOOP}
        onMovePlayer={NOOP} onMoveSelected={NOOP} onAddPlayer={NOOP}
        onAddText={NOOP} onAddArrow={NOOP} onAddMarker={NOOP} onAddBoss={NOOP}
        onRemovePlayer={NOOP} onRemoveArrow={NOOP} onMoveArrow={NOOP}
        onMoveSwirl={NOOP} onRemoveSwirl={NOOP}
        onMoveText={NOOP} onRemoveText={NOOP}
        onMoveMarker={NOOP} onRemoveMarker={NOOP}
        onMoveBoss={NOOP} onRemoveBoss={NOOP}
        onAddFieldEffect={NOOP} onMoveFieldEffect={NOOP} onRemoveFieldEffect={NOOP} onUpdateFieldEffect={NOOP}
        onUpdatePlayerScale={NOOP} onUpdatePlayerSpec={NOOP} onUpdateMarkerScale={NOOP} onUpdateBossScale={NOOP}
        onUpdatePlayerLabel={NOOP} onUpdateMarkerLabel={NOOP} onUpdateBossLabel={NOOP}
        onArrowStyleChange={NOOP} onCopyObject={NOOP} onPasteAt={NOOP}
        onTogglePlayerLocked={NOOP} onToggleTextLocked={NOOP} onToggleMarkerLocked={NOOP}
        onToggleBossLocked={NOOP} onToggleFieldEffectLocked={NOOP}
      />
      <a
        href={window.location.origin + window.location.pathname}
        style={{ color: '#555', fontSize: 12, fontFamily: 'sans-serif', textDecoration: 'none' }}
      >
        ← Open Editor
      </a>
    </div>
  )
}
