import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { decompressFromEncodedURIComponent } from 'lz-string'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'
import RaidCanvas from './RaidCanvas'
import { WOW_CLASSES, ROLE_ICONS, ENEMY_TYPES } from '../data/classes'
import { normalizeMaps, resolveMapUrl } from '../utils/maps'

const CANVAS_W   = 1294
const CANVAS_H   = 728
const NOOP       = () => {}
const NOOP_SET   = new Set()

// ── Briefcase dimensions ───────────────────────────────────────────────────
const BC_PAD_H   = 3     // compensates for border-box 3px border on each side
const BC_PAD_V   = 3     // compensates for border-box 3px border top+bottom
const FLAP_H     = 62    // top flap height (PROFESSIONAL section)
const BC_W       = CANVAS_W + BC_PAD_H * 2    // 1300
const BC_BODY_H  = CANVAS_H + BC_PAD_V * 2    // 734
const BC_H       = FLAP_H + BC_BODY_H         // 796
const HDL_ABOVE  = 46    // how far handle sticks above briefcase top
const NP_W       = 370   // notepad width — scaled up proportionally with canvas

const NP_GAP     = 2             // gap between briefcase and notepad
const TOTAL_W    = BC_W + 2 * (NP_GAP + NP_W)  // symmetric — briefcase centered

// ── Helpers ────────────────────────────────────────────────────────────────
// gtMs is in milliseconds; playable entries have { pageIdx, segments[], pageMs }
function globalToLocal(gtMs, playable) {
  if (!playable.length) return { pageIdx: 0, localT: 0 }
  let rem = gtMs
  for (const entry of playable) {
    if (rem <= entry.pageMs) {
      let acc = 0
      for (let i = 0; i < entry.segments.length; i++) {
        const segDur = entry.segments[i]
        if (rem <= acc + segDur) {
          return { pageIdx: entry.pageIdx, localT: i + (rem - acc) / segDur }
        }
        acc += segDur
      }
      return { pageIdx: entry.pageIdx, localT: entry.segments.length }
    }
    rem -= entry.pageMs
  }
  const last = playable[playable.length - 1]
  return { pageIdx: last.pageIdx, localT: last.segments.length }
}

// ── Briefcase SVG parts ────────────────────────────────────────────────────

function Handle() {
  return (
    <svg width="148" height="54" viewBox="0 0 148 54" style={{ display: 'block' }}>
      {/* shadow */}
      <path d="M 22 52 C 22 14 126 14 126 52"
        stroke="rgba(0,0,0,0.55)" strokeWidth="14" fill="none" strokeLinecap="round"/>
      {/* body dark */}
      <path d="M 22 52 C 22 14 126 14 126 52"
        stroke="#3e2a06" strokeWidth="11" fill="none" strokeLinecap="round"/>
      {/* brass */}
      <path d="M 22 52 C 22 17 126 17 126 52"
        stroke="#b08010" strokeWidth="8" fill="none" strokeLinecap="round"/>
      {/* highlight */}
      <path d="M 28 50 C 28 22 120 22 120 50"
        stroke="#d4aa28" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.4"/>
      {/* left mount */}
      <rect x="9"   y="40" width="22" height="16" rx="3.5" fill="#2e1c04"/>
      <rect x="10"  y="41" width="20" height="14" rx="3"   fill="#c8a227"/>
      <rect x="13"  y="44" width="14" height="8"  rx="2"   fill="#9a7820"/>
      <circle cx="20" cy="48" r="2.2" fill="#c8a227"/>
      {/* right mount */}
      <rect x="117" y="40" width="22" height="16" rx="3.5" fill="#2e1c04"/>
      <rect x="118" y="41" width="20" height="14" rx="3"   fill="#c8a227"/>
      <rect x="121" y="44" width="14" height="8"  rx="2"   fill="#9a7820"/>
      <circle cx="128" cy="48" r="2.2" fill="#c8a227"/>
    </svg>
  )
}

function CornerPiece({ posStyle, tx = 'none' }) {
  return (
    <div style={{
      position: 'absolute', pointerEvents: 'none', zIndex: 9,
      transform: tx, ...posStyle,
    }}>
      <svg width="48" height="48" viewBox="0 0 48 48">
        <rect x="0" y="0" width="48" height="11" rx="2.5" fill="#3e2a06"/>
        <rect x="0" y="0" width="11" height="48" rx="2.5" fill="#3e2a06"/>
        <rect x="1" y="1" width="46" height="9"  rx="2"   fill="#c8a227"/>
        <rect x="1" y="1" width="9"  height="46" rx="2"   fill="#c8a227"/>
        {/* rivet */}
        <circle cx="11" cy="11" r="8.5" fill="#2e1c04"/>
        <circle cx="11" cy="11" r="7"   fill="#c8a227"/>
        <circle cx="11" cy="11" r="4"   fill="#9a7820"/>
        <circle cx="11" cy="11" r="2"   fill="#c8a227"/>
        <circle cx="11" cy="11" r="0.8" fill="#2e1c04"/>
      </svg>
    </div>
  )
}

function Clasp() {
  return (
    <svg width="46" height="20" viewBox="0 0 46 20">
      <rect x="0"  y="2"  width="46" height="16" rx="4"   fill="#2e1c04"/>
      <rect x="1"  y="3"  width="44" height="14" rx="3.5" fill="#c8a227"/>
      <rect x="10" y="5"  width="26" height="10" rx="2.5" fill="#9a7820"/>
      <rect x="11" y="6"  width="24" height="8"  rx="2"   fill="#b08010"/>
      <circle cx="23" cy="10" r="3.2" fill="#3e2a06"/>
      <circle cx="23" cy="10" r="2"   fill="#6a5010"/>
      <rect x="22" y="10" width="2" height="4" rx="0.8" fill="#3e2a06"/>
    </svg>
  )
}

function BriefcaseIcon() {
  return (
    <svg width="38" height="30" viewBox="0 0 52 44" fill="none">
      <path d="M19 14L19 9Q19 5 26 5Q33 5 33 9L33 14"
        stroke="#c8a227" strokeWidth="2.5" strokeLinecap="round"/>
      <rect x="4" y="14" width="44" height="26" rx="3"
        stroke="#c8a227" strokeWidth="2.5"/>
      <line x1="4" y1="27" x2="48" y2="27" stroke="#c8a227" strokeWidth="1.5"/>
      <rect x="21" y="24" width="10" height="6" rx="1.5"
        stroke="#c8a227" strokeWidth="1.5"/>
    </svg>
  )
}

// ── Notepad role icon style ─────────────────────────────────────────────────
const ROLE_ICON_STYLE = {
  containerStyle: (c) => ({ borderRadius: 3, border: `1.5px solid ${c}55`, background: 'rgba(12,8,4,0.92)', boxShadow: `inset 0 0 4px rgba(0,0,0,0.7), 0 0 5px ${c}33` }),
  Tank:   ({ color }) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 2H11V8.5C11 11 9.5 12.5 7 13.5C4.5 12.5 3 11 3 8.5Z" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/><line x1="7" y1="2" x2="7" y2="13.5" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.45"/><line x1="3" y1="6" x2="11" y2="6" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.45"/></svg>,
  Healer: ({ color }) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="7" y1="2" x2="7" y2="12" stroke={color} strokeWidth="2.2" strokeLinecap="round" opacity="0.9"/><line x1="2" y1="7" x2="12" y2="7" stroke={color} strokeWidth="2.2" strokeLinecap="round" opacity="0.9"/></svg>,
  Dps:    ({ color }) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke={color} strokeWidth="2.2" strokeLinecap="round" opacity="0.9"/><line x1="11" y1="3" x2="3" y2="11" stroke={color} strokeWidth="2.2" strokeLinecap="round" opacity="0.9"/><line x1="7" y1="2" x2="7" y2="5" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.65"/></svg>,
}

// ── Notepad ────────────────────────────────────────────────────────────────
function NotesPanel({ notes = {} }) {
  const noteFont = "'Spectral', serif"
  const [expanded, setExpanded] = useState(new Set())

  const toggle = useCallback((key) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const sections = [
    { key: 'tank',   label: 'Tank',   accent: '#3a7ee0', Icon: ROLE_ICON_STYLE.Tank   },
    { key: 'healer', label: 'Healer', accent: '#22b872', Icon: ROLE_ICON_STYLE.Healer },
    { key: 'dps',    label: 'DPS',    accent: '#cc3333', Icon: ROLE_ICON_STYLE.Dps    },
  ]

  return (
    <div style={{
      width: NP_W, marginLeft: NP_GAP, marginTop: HDL_ABOVE, marginBottom: 2,
      display: 'flex', flexDirection: 'column', position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── NOTES header ── */}
      <div style={{
        flexShrink: 0, padding: '14px 20px 12px',
        background: 'linear-gradient(180deg, #1a1006 0%, #221408 100%)',
        borderBottom: '2px solid rgba(100,58,14,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 11, letterSpacing: '0.55em', textTransform: 'uppercase',
          fontFamily: noteFont, fontWeight: 'bold',
          color: '#6e421a',
        }}>Notes</span>
      </div>

      {/* ── Accordion sections ── */}
      <div style={{ position: 'relative', zIndex: 2, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {sections.map(({ key, label, accent, Icon }) => {
          const isOpen = expanded.has(key)
          const text   = notes[key] ?? ''
          return (
            <div key={key} style={{ borderBottom: '1px solid rgba(60,35,8,0.7)' }}>
              <button onClick={() => toggle(key)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px 10px 0',
                background: `linear-gradient(to right, ${accent}30 0%, ${accent}12 45%, transparent 75%)`,
                border: 'none',
                borderLeft: `3px solid ${accent}`,
                cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = `linear-gradient(to right, ${accent}44 0%, ${accent}1a 45%, transparent 75%)` }}
                onMouseLeave={e => { e.currentTarget.style.background = `linear-gradient(to right, ${accent}30 0%, ${accent}12 45%, transparent 75%)` }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginLeft: 10,
                  border: `1.5px solid ${accent}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0.85,
                  ...ROLE_ICON_STYLE.containerStyle(accent),
                }}>
                  <Icon color={accent} />
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 8, color: accent, opacity: 0.5, marginRight: 4 }}>
                  {isOpen ? '▲' : '▼'}
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: '10px 14px 14px 16px', minHeight: 44,
                  borderLeft: `3px solid ${accent}`, background: 'rgba(0,0,0,0.15)' }}>
                  {text
                    ? <div style={{ fontFamily: noteFont, fontSize: 15, lineHeight: 1.75 }}>
                        {text.split('\n').map((line, i) => (
                          <div key={i} style={{ color: '#c8b890', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {line.startsWith('• ')
                              ? <><span style={{ color: accent, fontSize: 19, verticalAlign: '1px' }}>• </span>{line.slice(2)}</>
                              : line || ' '
                            }
                          </div>
                        ))}
                      </div>
                    : <p style={{ fontSize: 12, color: '#4a3018', fontStyle: 'italic',
                        margin: 0, fontFamily: noteFont }}>No notes</p>
                  }
                </div>
              )}
            </div>
          )
        })}


      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PlanViewer() {
  const [pages,         setPages]         = useState(null)
  const [maps,          setMaps]          = useState([])
  const [error,         setError]         = useState(null)
  const [activePageIdx, setActivePageIdx] = useState(0)
  const [playT,         setPlayT]         = useState(0)
  const [globalT,       setGlobalT]       = useState(0)
  const [isPlaying,     setIsPlaying]     = useState(true)
  const [viewW,         setViewW]         = useState(window.innerWidth)

  const animRef      = useRef(null)
  const startTimeRef = useRef(null)
  const pausedAtRef  = useRef(0)
  const textsSourceRef = useRef(null)
  const stableTextsRef = useRef([])

  useEffect(() => {
    const fn = () => setViewW(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    // Spinning beams may have inconsistent rotation/rotateSpeed/beamLength across keyframes
    // (written to only one frame before the global-update fix). Normalize by:
    //   • rotation: mode (most common value) across all frames that have the beam
    //   • rotateSpeed / beamLength: last non-zero value found across all frames
    const normalizePages = (pages) => pages.map(page => {
      const spinningIds = new Set()
      const rotCounts   = {}   // id -> { roundedDeg: count }
      const canonSpeed  = {}   // id -> last non-zero rotateSpeed
      const canonLength = {}   // id -> last non-zero beamLength

      for (const kf of page.keyframes) {
        for (const fe of (kf._fieldEffects ?? [])) {
          if ((fe.rotateSpeed ?? 0) !== 0) {
            spinningIds.add(fe.id)
            canonSpeed[fe.id]  = fe.rotateSpeed
          }
          if ((fe.beamLength ?? 0) !== 0) canonLength[fe.id] = fe.beamLength
          if (!rotCounts[fe.id]) rotCounts[fe.id] = {}
          const r = Math.round(fe.rotation ?? 0)
          rotCounts[fe.id][r] = (rotCounts[fe.id][r] || 0) + 1
        }
      }
      if (!spinningIds.size) return page

      const canonRot = {}
      for (const id of spinningIds) {
        const counts = rotCounts[id] ?? {}
        const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
        canonRot[id] = best ? Number(best[0]) : 0
      }

      return {
        ...page,
        keyframes: page.keyframes.map(kf => ({
          ...kf,
          _fieldEffects: (kf._fieldEffects ?? []).map(fe => {
            if (!spinningIds.has(fe.id)) return fe
            return {
              ...fe,
              rotation:    canonRot[fe.id],
              rotateSpeed: canonSpeed[fe.id] ?? fe.rotateSpeed,
              ...(canonLength[fe.id] !== undefined ? { beamLength: canonLength[fe.id] } : {}),
            }
          }),
        })),
      }
    })

    const hash = window.location.hash
    if (hash.startsWith('#plan=')) {
      const id = hash.slice(6)
      getDoc(doc(db, 'plans', id))
        .then(snap => {
          if (!snap.exists()) { setError('Plan not found — the link may be invalid.'); return }
          const data = snap.data()
          setPages(normalizePages(data.pages)); setMaps(normalizeMaps(data))
        })
        .catch(() => setError('Could not load plan — check your connection and try again.'))
      return
    }
    if (hash.startsWith('#view=')) {
      try {
        const raw = JSON.parse(decompressFromEncodedURIComponent(hash.slice(6)))
        if (Array.isArray(raw)) setPages(normalizePages(raw))
        else { setPages(normalizePages(raw.pages)); setMaps(normalizeMaps(raw)) }
      } catch { setError('Could not load plan — the link may be invalid or corrupted.') }
      return
    }
    setError('No plan data found in URL.')
  }, [])

  const { playable, total } = useMemo(() => {
    if (!pages) return { playable: [], total: 0 }
    const pl = pages
      .map((p, idx) => {
        if (p.keyframes.length < 2) return null
        const segments = p.keyframes.slice(1).map(kf => Math.max(100, kf._duration ?? 2000))
        const pageMs   = segments.reduce((s, d) => s + d, 0)
        return { pageIdx: idx, segments, pageMs }
      })
      .filter(Boolean)
    return { playable: pl, total: pl.reduce((s, e) => s + e.pageMs, 0) }
  }, [pages])

  const sliderTicks = useMemo(() => {
    if (!total) return []
    const ticks = []; let offsetMs = 0
    for (let pi = 0; pi < playable.length; pi++) {
      const { segments, pageMs } = playable[pi]
      let segOffset = 0
      for (let fi = 0; fi < segments.length - 1; fi++) {
        segOffset += segments[fi]
        ticks.push({ pos: (offsetMs + segOffset) / total, type: 'frame' })
      }
      offsetMs += pageMs
      if (pi < playable.length - 1) ticks.push({ pos: offsetMs / total, type: 'page' })
    }
    return ticks
  }, [playable, total])

  useEffect(() => {
    if (!pages || !isPlaying || total === 0) {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      return
    }
    startTimeRef.current = performance.now()
    function tick(ts) {
      const elapsed = ts - startTimeRef.current          // ms
      const gt      = (pausedAtRef.current + elapsed) % total  // ms
      const { pageIdx, localT } = globalToLocal(gt, playable)
      setGlobalT(gt); setActivePageIdx(pageIdx); setPlayT(localT)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [pages, isPlaying, total, playable])

  const togglePlay = useCallback(() => {
    if (isPlaying) { pausedAtRef.current = globalT; setIsPlaying(false) }
    else setIsPlaying(true)
  }, [isPlaying, globalT])

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setIsPlaying(prev => {
          if (prev) { pausedAtRef.current = globalT }
          return !prev
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [globalT])

  const wasPlayingRef = useRef(false)

  const handleSliderMouseDown = useCallback(() => {
    wasPlayingRef.current = isPlaying
    pausedAtRef.current = globalT
    setIsPlaying(false)
  }, [isPlaying, globalT])

  const handleSliderChange = useCallback((e) => {
    const newGT = parseFloat(e.target.value)
    pausedAtRef.current = newGT; setGlobalT(newGT)
    const { pageIdx, localT } = globalToLocal(newGT, playable)
    setActivePageIdx(pageIdx); setPlayT(localT)
  }, [playable])

  const handleSliderMouseUp = useCallback(() => {
    if (wasPlayingRef.current) setIsPlaying(true)
  }, [])

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0604', color:'#ff6666',
      fontFamily:'Georgia,serif', fontSize:14 }}>{error}</div>
  )
  if (!pages) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0a0604', color:'#5a4818',
      fontFamily:'Georgia,serif', fontSize:14 }}>Loading…</div>
  )

  // ── Display state ──────────────────────────────────────────────────────
  const safePageIdx    = Math.min(activePageIdx, pages.length - 1)
  const { players, keyframes } = pages[safePageIdx]
  // frameIndex is floor-based — used for interpolation and override lookups
  // currentFrame is round-based — used for birth/hide checks and text display
  const frameIndex   = Math.min(Math.floor(playT), keyframes.length - 2)
  const currentFrame = Math.round(playT)
  const displayKf    = keyframes[Math.min(currentFrame, keyframes.length - 1)] ?? {}
  const overrideKf   = keyframes[frameIndex] ?? {}   // floor-based: overrides stay until the next frame actually begins
  const hiddenPlayerIds = new Set(displayKf._hiddenPlayerIds ?? [])
  if (textsSourceRef.current !== displayKf._texts) {
    textsSourceRef.current = displayKf._texts
    stableTextsRef.current = (displayKf._texts ?? []).filter(t => !t.hidden)
  }
  const stableTexts = stableTextsRef.current

  const visiblePlayers = Object.fromEntries(
    Object.entries(players)
      .filter(([id, p]) => (p.birthFrame ?? 0) <= currentFrame && !hiddenPlayerIds.has(id))
      .map(([id, p]) => {
        const ov = overrideKf._classOverrides?.[id]   // use floor-based kf to avoid mid-transition icon flicker
        if (ov) {
          const cls = WOW_CLASSES.find(c => c.key === ov.classKey)
                   ?? ROLE_ICONS.find(r => r.key === ov.classKey)
                   ?? ENEMY_TYPES.find(e => e.key === ov.classKey)
          return [id, { ...p, classKey: ov.classKey, specKey: ov.specKey ?? null, color: cls?.color ?? p.color, effect: displayKf._playerEffects?.[id] ?? null }]
        }
        return [id, { ...p, effect: displayKf._playerEffects?.[id] ?? null }]
      })
  )

  const frameA    = keyframes[frameIndex] ?? {}
  const frameB    = keyframes[Math.min(frameIndex + 1, keyframes.length - 1)] ?? frameA
  const t         = frameB._snap ? 0 : (playT - frameIndex)
  const pageSwaps = pages[safePageIdx].swaps ?? []

  function applySwaps(positions, activeSwaps) {
    if (!activeSwaps.length) return positions
    const out = { ...positions }
    for (const s of activeSwaps) {
      if (out[s.playerA] && out[s.playerB]) {
        const tmp = out[s.playerA]; out[s.playerA] = out[s.playerB]; out[s.playerB] = tmp
      }
    }
    return out
  }
  const rawA = {}, rawB = {}
  Object.keys(visiblePlayers).forEach(id => {
    rawA[id] = frameA[id] ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 }
    rawB[id] = frameB[id] ?? rawA[id]
  })
  const posA = applySwaps(rawA, pageSwaps.filter(s => s.fromFrame <= frameIndex && (s.toFrame == null || s.toFrame > frameIndex)))
  const posB = applySwaps(rawB, pageSwaps.filter(s => s.fromFrame <= frameIndex + 1 && (s.toFrame == null || s.toFrame > frameIndex + 1)))

  const displayPositions = {}
  Object.keys(visiblePlayers).forEach(id => {
    const a = posA[id] ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 }
    const b = posB[id] ?? a
    displayPositions[id] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  })

  const lerpAngle = (a, b, t) => {
    const diff = ((b - a) % 360 + 540) % 360 - 180
    return (a + diff * t + 360) % 360
  }
  const lerpItems = (listA, listB) => {
    const mapB = Object.fromEntries((listB ?? []).map(o => [o.id, o]))
    const useKfBProps = !frameB._snap && currentFrame > frameIndex
    const fromA = (listA ?? []).filter(o => {
      if (o.hidden) return false
      if (useKfBProps && !mapB[o.id]) return false  // removed in kfB — vanish with text
      return true
    }).map(o => {
      const oB = mapB[o.id]
      if (!oB) return o
      const base = useKfBProps ? { ...o, ...oB } : o
      return {
        ...base,
        x:        o.x + (oB.x - o.x) * t,
        y:        o.y + (oB.y - o.y) * t,
        rotation: (o.rotateSpeed ?? 0) !== 0 ? (o.rotation ?? 0) : lerpAngle(o.rotation ?? 0, oB.rotation ?? 0, t),
      }
    })
    if (useKfBProps) {
      const inA = new Set((listA ?? []).map(o => o.id))
      return [...fromA, ...(listB ?? []).filter(o => !o.hidden && !inA.has(o.id))]
    }
    return fromA
  }
  const visibleBosses       = lerpItems(frameA._bosses,       frameB._bosses)
  const visibleFieldEffects = lerpItems(frameA._fieldEffects, frameB._fieldEffects)

  // globalT is exact elapsed ms since plan start (wraps at loop boundary).
  // Dividing by 1000 gives seconds — used by RaidCanvas for scrubber-accurate beam spin.
  const playTimeSeconds = globalT / 1000

  const canvasProps = {
    width: CANVAS_W, height: CANVAS_H,
    players: visiblePlayers, positions: displayPositions,
    arrows: (displayKf._arrows ?? []).filter(a => !a.hidden),
    swirls: (displayKf._swirls ?? []).filter(s => !s.hidden), swirlAngle: (playT * 120) % 360,
    texts: stableTexts,
    markers: (displayKf._markers ?? []).filter(m => !m.hidden),
    bosses: visibleBosses, fieldEffects: visibleFieldEffects,
    bgImage: resolveMapUrl(maps, keyframes, Math.min(currentFrame, keyframes.length - 1)),
    tool: 'select', setTool: NOOP, isPlaying: true, playTimeSeconds,
    selectedId: null, selectedTextId: null, selectedIds: NOOP_SET,
    arrowStyle: { color: '#ff4444', dash: false, strokeWidth: 2.5, twoHeaded: false },
    clipboard: null,
    onSelectPlayer: NOOP, onSetSelectedIds: NOOP, onSelectText: NOOP,
    onMovePlayer: NOOP, onMoveSelected: NOOP, onAddPlayer: NOOP,
    onAddText: NOOP, onAddArrow: NOOP, onAddMarker: NOOP, onAddBoss: NOOP,
    onRemovePlayer: NOOP, onRemoveArrow: NOOP, onMoveArrow: NOOP,
    onMoveSwirl: NOOP, onRemoveSwirl: NOOP,
    onMoveText: NOOP, onRemoveText: NOOP,
    onMoveMarker: NOOP, onRemoveMarker: NOOP,
    onMoveBoss: NOOP, onRemoveBoss: NOOP,
    onAddFieldEffect: NOOP, onMoveFieldEffect: NOOP, onRemoveFieldEffect: NOOP, onUpdateFieldEffect: NOOP,
    onUpdatePlayerScale: NOOP, onUpdatePlayerRotation: NOOP, onSetPlayerEffect: NOOP, onUpdatePlayerSpec: NOOP, onUpdatePlayerClass: NOOP,
    onUpdatePlayerLabelStyle: NOOP, onUpdateBossLabelStyle: NOOP, onUpdatePlayerLabelColor: NOOP, onUpdateBossLabelColor: NOOP,
    onUpdateMarkerScale: NOOP, onUpdateBossScale: NOOP,
    onUpdatePlayerLabel: NOOP, onUpdateMarkerLabel: NOOP, onUpdateBossLabel: NOOP,
    onArrowStyleChange: NOOP, onCopyObject: NOOP, onPasteAt: NOOP,
    onTogglePlayerLocked: NOOP, onToggleTextLocked: NOOP, onToggleMarkerLocked: NOOP,
    onToggleBossLocked: NOOP, onToggleFieldEffectLocked: NOOP,
    onToggleEffectStopped: NOOP, onHideInFrame: NOOP,
  }

  const pageTitle = pages[safePageIdx].title ?? ''
  const notes     = pages[safePageIdx].notes ?? {}

  // ── Scrubber ───────────────────────────────────────────────────────────
  const fillPct    = total > 0 ? (globalT / total) * 100 : 0
  const frameNum   = Math.floor(playT) + 1
  const frameLabel = pages.length > 1
    ? `${pageTitle} · ${frameNum}/${keyframes.length}`
    : `Frame ${frameNum} / ${keyframes.length}`

  const scrubberEl = total > 0 ? (
    <div style={{
      width: BC_W, padding: '8px 12px 8px 0',
      background: '#0e0c09',
      borderTop: '1px solid rgba(200,162,39,0.2)',
      display: 'flex', alignItems: 'center', gap: 14, userSelect: 'none',
    }}>
      <button onClick={togglePlay} style={{
        width: 34, height: 34, borderRadius: 17,
        background: 'rgba(200,162,39,0.10)',
        border: '1.5px solid rgba(200,162,39,0.40)',
        color: '#c8a227', fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        transition: 'background 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,162,39,0.24)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(200,162,39,0.10)' }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <div style={{ flex: 1, position: 'relative', height: 28, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 3, background: '#2a2010', borderRadius: 2 }}>
          <div style={{ width: `${fillPct}%`, height: '100%',
            background: 'linear-gradient(90deg,#5a3e08,#c8a227)', borderRadius: 2, pointerEvents: 'none' }} />
          {sliderTicks.map((tick, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${tick.pos * 100}%`, top: '50%',
              transform: 'translate(-50%,-50%)',
              width: tick.type === 'page' ? 2 : 1, height: tick.type === 'page' ? 16 : 8,
              borderRadius: 1, pointerEvents: 'none',
              background: tick.type === 'page' ? 'rgba(200,162,39,0.7)' : 'rgba(255,255,255,0.18)',
            }} />
          ))}
        </div>
        <div style={{
          position: 'absolute', left: `${fillPct}%`, top: '50%',
          transform: 'translate(-50%,-50%)',
          width: 13, height: 13, borderRadius: '50%',
          background: '#c8a227', border: '2.5px solid #f0d878',
          boxShadow: '0 0 7px rgba(200,162,39,0.7)', pointerEvents: 'none', zIndex: 2,
        }} />
        <input type="range" className="viewer-scrubber"
          min={0} max={total} step={0.001} value={globalT}
          onMouseDown={handleSliderMouseDown} onChange={handleSliderChange} onMouseUp={handleSliderMouseUp}
          onTouchStart={handleSliderMouseDown} onTouchEnd={handleSliderMouseUp}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', margin: 0, zIndex: 3 }} />
      </div>
      <div style={{ fontSize: 10, color: '#7a6030', fontFamily: 'Georgia,serif',
        minWidth: 110, textAlign: 'right', letterSpacing: '0.03em' }}>
        {frameLabel}
      </div>
    </div>
  ) : null

  const zoom = Math.min(1, viewW / TOTAL_W)

  // ── Leather briefcase colours ──────────────────────────────────────────
  const LEATHER_BG = `
    linear-gradient(160deg,
      #1e1a0e 0%,
      #161208 35%,
      #0f0d07 65%,
      #1a1709 100%)
  `
  const BRASS_BORDER = '3px solid #8a6820'
  const BRASS_SHADOW = [
    '0 0 0 1px #3e2a08',
    'inset 0 0 0 1px rgba(200,162,39,0.14)',
    '0 12px 40px rgba(0,0,0,0.75)',
    '0 2px 8px rgba(0,0,0,0.5)',
  ].join(', ')

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'radial-gradient(ellipse 130% 85% at 50% 38%, #38200a 0%, #1e1006 40%, #0e0804 70%, #070402 100%)' }}>
      <div style={{
        position: 'relative', zIndex: 1, minHeight: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-start',
        paddingTop: 12, paddingBottom: 16,
      }}>
        <div style={{ zoom, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* ── Main row ── */}
          <div style={{ display: 'flex', alignItems: 'stretch' }}>

            {/* Left spacer mirrors notepad width — keeps briefcase centered */}
            <div style={{ width: NP_W + NP_GAP, flexShrink: 0 }} />

            {/* ── Briefcase + scrubber column ── */}
            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, width: BC_W }}>
            <div style={{ position: 'relative', paddingTop: HDL_ABOVE }}>

              {/* Handle — centered above briefcase */}
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 15 }}>
                <Handle />
              </div>

              {/* Briefcase body */}
              <div style={{
                position: 'relative',
                width: BC_W, height: BC_H,
                background: LEATHER_BG,
                border: BRASS_BORDER,
                borderRadius: 8,
                boxShadow: BRASS_SHADOW,
              }}>
                {/* Leather grain texture */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 6, pointerEvents: 'none',
                  background: `
                    repeating-linear-gradient(72deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 3px),
                    repeating-linear-gradient(18deg, transparent, transparent 4px, rgba(255,255,255,0.01) 4px, rgba(255,255,255,0.01) 5px)
                  `,
                }} />

                {/* ── Top flap ── */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: FLAP_H,
                  background: 'linear-gradient(180deg,rgba(255,255,255,0.025) 0%,transparent 100%)',
                  borderBottom: '2px solid rgba(200,162,39,0.6)',
                  borderRadius: '6px 6px 0 0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* Flap inner stitching */}
                  <div style={{
                    position: 'absolute', inset: '6px 12px',
                    border: '1px dashed rgba(200,162,39,0.1)',
                    borderRadius: 4, pointerEvents: 'none',
                  }} />
                  {/* PROFESSIONAL branding */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 2 }}>
                    <div style={{ height: 1, width: 80,
                      background: 'linear-gradient(to right, transparent, rgba(200,162,39,0.5))' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <BriefcaseIcon />
                      <span style={{ fontSize: 14, color: '#c8a227', letterSpacing: '0.6em',
                        textTransform: 'uppercase', fontFamily: 'Georgia,serif', opacity: 0.85, whiteSpace: 'nowrap' }}>
                        Professional
                      </span>
                    </div>
                    <div style={{ height: 1, width: 80,
                      background: 'linear-gradient(to left, transparent, rgba(200,162,39,0.5))' }} />
                  </div>
                </div>

                {/* ── Hinge clasps (straddling the flap seam) ── */}
                <div style={{ position: 'absolute', top: FLAP_H - 8, left: '27%', transform: 'translateX(-50%)', zIndex: 7 }}>
                  <Clasp />
                </div>
                <div style={{ position: 'absolute', top: FLAP_H - 8, left: '78%', transform: 'translateX(-50%)', zIndex: 7 }}>
                  <Clasp />
                </div>

                {/* ── Canvas viewport ── */}
                <div style={{
                  position: 'absolute',
                  top:    FLAP_H,
                  left:   0,
                  width:  CANVAS_W,
                  height: CANVAS_H,
                  overflow: 'hidden',
                  borderRadius: '0 0 5px 5px',
                  boxShadow: 'inset 0 0 28px rgba(0,0,0,0.65)',
                }}>
                  <RaidCanvas {...canvasProps} />
                </div>

                {/* ── Corner hardware (outer briefcase corners) ── */}
                <CornerPiece posStyle={{ top: -2,    left: -2  }}                          tx="none" />
                <CornerPiece posStyle={{ top: -2,    right: -2, transformOrigin: 'center top'    }} tx="scaleX(-1)" />
                <CornerPiece posStyle={{ bottom: -2, left: -2,  transformOrigin: 'left center'   }} tx="scaleY(-1)" />
                <CornerPiece posStyle={{ bottom: -2, right: -2, transformOrigin: 'center center' }} tx="scale(-1,-1)" />

                {/* ── Inner stitching (body area) ── */}
                <div style={{
                  position: 'absolute',
                  top: FLAP_H + 10, left: 10, right: 10, bottom: 10,
                  border: '1px dashed rgba(200,162,39,0.07)',
                  borderRadius: 3, pointerEvents: 'none',
                }} />

                {/* ── Inner gold bezel highlight ── */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 6,
                  boxShadow: 'inset 0 0 0 1px rgba(200,162,39,0.16)',
                  pointerEvents: 'none',
                }} />
              </div>
            </div>

            {scrubberEl}
            </div>{/* end briefcase+scrubber col */}

            {/* ── Notepad ── */}
            <NotesPanel notes={notes} pageTitle={pageTitle} />
          </div>
        </div>
      </div>
    </div>
  )
}
