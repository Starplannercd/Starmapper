import { useState, useRef, useCallback, useEffect } from 'react'

// ── Timing helpers ────────────────────────────────────────────────────────────

function getFrameTimesMs(keyframes) {
  const times = [0]
  for (let i = 1; i < keyframes.length; i++) {
    times.push(times[i - 1] + (keyframes[i]._duration ?? 2000))
  }
  return times
}

function totalAnimMs(keyframes) {
  return keyframes.slice(1).reduce((s, kf) => s + (kf._duration ?? 2000), 0)
}

function playTToScrubPct(keyframes, pt) {
  const total = totalAnimMs(keyframes)
  if (total === 0 || keyframes.length < 2) return 0
  const fi = Math.min(Math.floor(pt), keyframes.length - 2)
  const frac = Math.max(0, pt - fi)
  const times = getFrameTimesMs(keyframes)
  const ms = times[fi] + frac * (keyframes[fi + 1]?._duration ?? 2000)
  return Math.min(100, (ms / total) * 100)
}

function scrubPctToFrameIdx(keyframes, pct) {
  const total = totalAnimMs(keyframes)
  if (total === 0) return 0
  const targetMs = (pct / 100) * total
  const times = getFrameTimesMs(keyframes)
  let best = 0, bestDist = Infinity
  times.forEach((t, i) => {
    const d = Math.abs(t - targetMs)
    if (d < bestDist) { bestDist = d; best = i }
  })
  return best
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  return s % 1 === 0 ? `${s}s` : `${s.toFixed(1)}s`
}

function parseMs(str) {
  const s = str.trim().toLowerCase()
  const n = parseFloat(s)
  if (isNaN(n) || n <= 0) return null
  return s.endsWith('ms') ? Math.round(n) : Math.round(n * 1000)
}

// ── Scrubber ──────────────────────────────────────────────────────────────────

function Scrubber({ keyframes, activeKeyframe, playT, isPlaying, onSelectKeyframe }) {
  const trackRef = useRef(null)

  const times = getFrameTimesMs(keyframes)
  const total = totalAnimMs(keyframes)
  const displayT = isPlaying ? playT : activeKeyframe
  const playheadPct = playTToScrubPct(keyframes, displayT)

  const pctFromEvent = useCallback((e) => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (isPlaying) return
    e.preventDefault()
    onSelectKeyframe(scrubPctToFrameIdx(keyframes, pctFromEvent(e)))
    const onMove = (me) => onSelectKeyframe(scrubPctToFrameIdx(keyframes, pctFromEvent(me)))
    const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [isPlaying, keyframes, onSelectKeyframe, pctFromEvent])

  const n = keyframes.length

  return (
    <div
      className={`scrubber-track${isPlaying ? ' scrubber-playing' : ''}`}
      ref={trackRef}
      onMouseDown={handleMouseDown}
    >
      {/* Alternating segment fills */}
      {times.slice(0, -1).map((t, i) => {
        const x1 = total > 0 ? (t / total) * 100 : (i / (n - 1)) * 100
        const x2 = total > 0 ? (times[i + 1] / total) * 100 : ((i + 1) / (n - 1)) * 100
        return (
          <div key={i}
            className={`scrubber-seg${i % 2 === 0 ? '' : ' scrubber-seg-alt'}${activeKeyframe === i || activeKeyframe === i + 1 ? ' scrubber-seg-active' : ''}`}
            style={{ left: `${x1}%`, width: `${x2 - x1}%` }}
          />
        )
      })}

      {/* Frame tick marks */}
      {times.map((t, i) => {
        const pct = total > 0 ? (t / total) * 100 : (i / Math.max(n - 1, 1)) * 100
        return (
          <div key={i}
            className={`scrubber-tick${activeKeyframe === i ? ' scrubber-tick-active' : ''}`}
            style={{ left: `${pct}%` }}
            onMouseDown={e => { e.stopPropagation(); if (!isPlaying) onSelectKeyframe(i) }}
          >
            <span className="scrubber-tick-num">{i + 1}</span>
          </div>
        )
      })}

      {/* Playhead */}
      <div className="scrubber-playhead" style={{ left: `${playheadPct}%` }}>
        <div className="scrubber-ph-diamond" />
      </div>
    </div>
  )
}

// ── Duration badge ────────────────────────────────────────────────────────────

function DurationLabel({ ms, onCommit }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const elRef = useRef(null)

  // Non-passive wheel listener — lets us preventDefault to stop page scroll
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const handler = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const step  = e.shiftKey ? 500 : 100
      const delta = e.deltaY < 0 ? step : -step
      const base  = editing ? (parseMs(draft) ?? ms) : ms
      const next  = Math.max(100, Math.min(30000, base + delta))
      if (editing) setDraft(fmtMs(next))
      onCommit(next)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  })

  if (editing) {
    return (
      <input ref={elRef}
        className="duration-input"
        value={draft}
        autoFocus
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          const parsed = parseMs(draft)
          if (parsed) onCommit(Math.min(30000, Math.max(100, parsed)))
          setEditing(false)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.target.blur(); return }
          if (e.key === 'Escape') { setEditing(false); return }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const step = e.shiftKey ? 500 : 100
            const next = Math.max(100, Math.min(30000,
              (parseMs(draft) ?? ms) + (e.key === 'ArrowUp' ? step : -step)))
            setDraft(fmtMs(next))
            onCommit(next)
          }
          e.stopPropagation()
        }}
        onClick={e => e.stopPropagation()}
      />
    )
  }

  return (
    <span ref={elRef}
      className="duration-badge"
      title="Scroll or ↑↓ to adjust · shift = ×5 · click to type"
      onClick={e => { e.stopPropagation(); setDraft(fmtMs(ms)); setEditing(true) }}
    >
      {fmtMs(ms)}
    </span>
  )
}

// ── Duration right-click popup ────────────────────────────────────────────────

function FrameMenu({ ms, x, bottom, frameIdx, label, isSnap, onCommit, onToggleSnap, onClose }) {
  const [draft,   setDraft]   = useState(fmtMs(ms))
  const [snap,    setSnap]    = useState(isSnap)
  const rootRef = useRef(null)

  useEffect(() => {
    rootRef.current?.querySelector('input')?.select()
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (!rootRef.current?.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const commit = () => {
    const parsed = parseMs(draft)
    if (parsed) onCommit(Math.max(100, Math.min(30000, parsed)))
    else onClose()
  }

  const handleSnap = (next) => {
    if (next === snap) return
    setSnap(next)
    onToggleSnap()
  }

  return (
    <div ref={rootRef} style={{
      position: 'fixed', left: x, bottom, zIndex: 9999,
      background: '#1a1208', border: '1px solid #3a2210', borderRadius: 6,
      padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.7)', minWidth: 130,
    }}>
      <span style={{ fontSize: 10, color: '#5a3820', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {label ?? `Frame ${frameIdx + 1}`}
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 9, color: '#4a3018', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Duration</span>
        <input
          className="duration-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') onClose()
            e.stopPropagation()
          }}
          onBlur={commit}
          style={{ width: 90 }}
        />
      </div>

      <div style={{ borderTop: '1px solid #3a2210', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 9, color: '#4a3018', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Transition in</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={() => handleSnap(false)}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, cursor: snap ? 'pointer' : 'default',
              background: snap ? 'transparent' : '#dfca88',
              border: `1px solid ${snap ? '#3a2210' : '#b58900'}`,
              borderRadius: 3, color: snap ? '#5a3820' : '#7a4e00',
              fontWeight: snap ? 400 : 700,
            }}
          >~ Smooth</button>
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={() => handleSnap(true)}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, cursor: snap ? 'default' : 'pointer',
              background: snap ? '#dfca88' : 'transparent',
              border: `1px solid ${snap ? '#b58900' : '#3a2210'}`,
              borderRadius: 3, color: snap ? '#7a4e00' : '#5a3820',
              fontWeight: snap ? 700 : 400,
            }}
          >⚡ Cut</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const SPEEDS = [0.5, 1, 2]

export default function Timeline({
  keyframes, activeKeyframe, onSelectKeyframe,
  onAddKeyframe, onDuplicateKeyframe, onRemoveKeyframe, onReorderKeyframes,
  isPlaying, playT, onPlay, onStop,
  onShare, shareCopied, shareLoading,
  onExportAddon, addonExportCopied,
  onSwitchToDiagram,
  onUpdateDuration, onToggleSnapFrame,
  playbackSpeed, onSetPlaybackSpeed,
  onShareClip,
}) {
  const totalFrames = keyframes.length
  const [collapsed,     setCollapsed]     = useState(false)
  const [dragIdx,       setDragIdx]       = useState(null)
  const [dropIdx,       setDropIdx]       = useState(null)
  const [durationMenu,  setDurationMenu]  = useState(null) // { idx, x, y }
  const [showClip,   setShowClip]   = useState(false)
  const [clipStart,  setClipStart]  = useState(0)
  const [clipEnd,    setClipEnd]    = useState(Math.max(0, keyframes.length - 1))
  const [clipCopied, setClipCopied] = useState(false)
  const [clipBusy,   setClipBusy]   = useState(false)

  // Keep clipEnd in bounds when frames are added/removed
  const safeClipEnd = Math.min(clipEnd, totalFrames - 1)
  const safeClipStart = Math.min(clipStart, safeClipEnd)

  const handleCopyClip = async () => {
    if (clipBusy || safeClipStart >= safeClipEnd) return
    setClipBusy(true)
    await onShareClip(safeClipStart, safeClipEnd)
    setClipBusy(false)
    setClipCopied(true)
    setTimeout(() => setClipCopied(false), 2500)
  }

  const handleDragStart = (e, i) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver  = (e, i) => { e.preventDefault(); if (i !== dropIdx) setDropIdx(i) }
  const handleDrop      = (e, i) => {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== i) onReorderKeyframes(dragIdx, i)
    setDragIdx(null); setDropIdx(null)
  }
  const handleDragEnd = () => { setDragIdx(null); setDropIdx(null) }

  return (
    <div className={`timeline${collapsed ? ' timeline-collapsed' : ''}`}>

      {/* ── Controls ── */}
      <div className="timeline-controls">
        <button
          className={isPlaying ? 'btn-stop' : 'btn-play'}
          onClick={isPlaying ? onStop : onPlay}
          disabled={totalFrames < 2}
        >
          {isPlaying ? '⏹ Stop' : '▶ Play'}
        </button>

        <button className="btn-secondary" onClick={onAddKeyframe} disabled={isPlaying}>
          + Frame
        </button>
        <button className="btn-secondary" onClick={onDuplicateKeyframe} disabled={isPlaying}
          title="Duplicate this frame into the next slot">
          ⧉ Dup
        </button>
        <button className="btn-secondary" onClick={onShare} disabled={isPlaying || shareLoading}>
          {shareLoading ? 'Saving…' : shareCopied ? '✓ Copied!' : '🔗 Share'}
        </button>
        {totalFrames > 1 && (
          <button
            className={`btn-secondary clip-toggle${showClip ? ' active' : ''}`}
            onClick={() => { setShowClip(v => !v); setClipCopied(false) }}
            disabled={isPlaying}
            title="Share a slice of frames as a standalone link"
          >✂️ Clip</button>
        )}

        <span className="frame-label">
          {isPlaying
            ? `▶ ${Math.min(Math.floor(playT) + 1, totalFrames)} / ${totalFrames}`
            : `Frame ${activeKeyframe + 1} / ${totalFrames}`}
        </span>

        <button className="btn-secondary diagram-mode-switch"
          onClick={onSwitchToDiagram} disabled={isPlaying}
          title="Pause — return to diagram view, steps are preserved">
          ⏸ Pause
        </button>

        <button
          className="timeline-collapse-btn"
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Expand timeline' : 'Collapse timeline'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed && <>
        {/* ── Clip panel ── */}
        {showClip && totalFrames > 1 && !isPlaying && (
          <div className="clip-panel">
            <span className="clip-label">Share frames</span>
            <select
              className="clip-select"
              value={safeClipStart}
              onChange={e => setClipStart(Number(e.target.value))}
            >
              {Array.from({ length: totalFrames }, (_, i) => (
                <option key={i} value={i} disabled={i >= safeClipEnd}>{i + 1}</option>
              ))}
            </select>
            <span className="clip-label">→</span>
            <select
              className="clip-select"
              value={safeClipEnd}
              onChange={e => setClipEnd(Number(e.target.value))}
            >
              {Array.from({ length: totalFrames }, (_, i) => (
                <option key={i} value={i} disabled={i <= safeClipStart}>{i + 1}</option>
              ))}
            </select>
            <span className="clip-count">
              {safeClipEnd - safeClipStart} step{safeClipEnd - safeClipStart !== 1 ? 's' : ''}
            </span>
            <button
              className="btn-secondary clip-copy"
              onClick={handleCopyClip}
              disabled={clipBusy || safeClipStart >= safeClipEnd}
            >
              {clipCopied ? '✓ Copied!' : clipBusy ? 'Saving…' : '🔗 Copy Clip'}
            </button>
          </div>
        )}

        {/* ── Scrubber ── */}
        {totalFrames > 1 && (
          <Scrubber
            keyframes={keyframes}
            activeKeyframe={activeKeyframe}
            playT={playT}
            isPlaying={isPlaying}
            onSelectKeyframe={onSelectKeyframe}
          />
        )}

        {/* ── Frame cards ── */}
        <div className="timeline-track">
          {keyframes.map((kf, i) => (
            <div key={i}
              className={[
                'keyframe-box',
                activeKeyframe === i && !isPlaying ? 'active' : '',
                isPlaying && Math.floor(playT) === i ? 'current' : '',
                dragIdx === i ? 'kf-dragging' : '',
                dropIdx === i && dragIdx !== i ? 'kf-drop-target' : '',
              ].filter(Boolean).join(' ')}
              draggable={!isPlaying}
              onClick={() => !isPlaying && onSelectKeyframe(i)}
              onMouseDown={e => {
                if (e.button === 1) {
                  e.preventDefault()
                  if (totalFrames > 1 && !isPlaying) onRemoveKeyframe(i)
                }
              }}
              onContextMenu={e => {
                e.preventDefault()
                if (isPlaying) return
                if (i === 0) {
                  if (keyframes.length < 2) return
                  setDurationMenu({ idx: 1, x: e.clientX, bottom: window.innerHeight - e.clientY + 8, label: 'Frame 1 → 2' })
                } else {
                  setDurationMenu({ idx: i, x: e.clientX, bottom: window.innerHeight - e.clientY + 8 })
                }
              }}
              onDragStart={e => handleDragStart(e, i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={e => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
            >
              <div className="kf-header">
                <span className="kf-num">{i + 1}</span>
                {i > 0 && kf._snap && (
                  <span className="kf-snap-indicator" title="Hard cut">⚡</span>
                )}
              </div>
              <span className="kf-start-label">
                {i === 0 ? 'start' : fmtMs(kf._duration ?? 2000)}
              </span>
            </div>
          ))}
        </div>

        {/* ── Frame right-click menu ── */}
        {durationMenu && (
          <FrameMenu
            ms={keyframes[durationMenu.idx]?._duration ?? 2000}
            x={durationMenu.x}
            bottom={durationMenu.bottom}
            frameIdx={durationMenu.idx}
            label={durationMenu.label}
            isSnap={!!(keyframes[durationMenu.idx]?._snap)}
            onCommit={ms => { onUpdateDuration(durationMenu.idx, ms); setDurationMenu(null) }}
            onToggleSnap={() => { onToggleSnapFrame?.(durationMenu.idx) }}
            onClose={() => setDurationMenu(null)}
          />
        )}

      </>}
    </div>
  )
}
