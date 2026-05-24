import { useState, useCallback, useEffect, useRef } from 'react'
import { compressToEncodedURIComponent } from 'lz-string'
import RaidCanvas from './components/RaidCanvas'
import Sidebar    from './components/Sidebar'
import Timeline   from './components/Timeline'
import PageTabs   from './components/PageTabs'
import { WOW_CLASSES, ROLE_ICONS, ENEMY_TYPES } from './data/classes'
import './App.css'

const CANVAS_W      = 820
const CANVAS_H      = 580
const FRAME_DURATION = 2000

// ── Page factories ────────────────────────────────────────────────────────────

const BLANK_KF_EXTRAS = () => ({
  _texts: [], _arrows: [], _swirls: [], _markers: [],
  _bosses: [], _fieldEffects: [], _playerEffects: {},
})

function blankPage(title) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    players:   {},
    keyframes: [BLANK_KF_EXTRAS()],
  }
}

function clonePage(source, title) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    players:   { ...source.players },
    keyframes: source.keyframes.map(kf => {
      const out = {}
      for (const [k, v] of Object.entries(kf)) {
        if (k === '_playerEffects') out[k] = { ...v }
        else if (k.startsWith('_') && Array.isArray(v)) out[k] = v.map(el => ({ ...el }))
        else if (!k.startsWith('_')) out[k] = { ...v }
      }
      return { ...BLANK_KF_EXTRAS(), ...out }
    }),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [pages, setPages] = useState(() => {
    try {
      const saved = localStorage.getItem('wow-raidplan-v1')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [blankPage('Phase 1')]
  })
  const [activePageIdx,  setActivePageIdx]  = useState(0)
  const [activeKeyframe, setActiveKeyframe] = useState(0)
  const [selectedId,     setSelectedId]     = useState(null)
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [selectedIds,    setSelectedIds]    = useState(new Set())
  const [tool,           setTool]           = useState('select')
  const [isPlaying,      setIsPlaying]      = useState(false)
  const [playT,          setPlayT]          = useState(0)
  const [bgImage,        setBgImage]        = useState(null)
  const [arrowStyle,     setArrowStyle]     = useState({ color: '#ff4444', dash: false, strokeWidth: 2.5, twoHeaded: false })
  const [clipboard,      setClipboard]      = useState(null)
  const animRef   = useRef(null)
  const pagesRef  = useRef(pages)
  useEffect(() => { pagesRef.current = pages }, [pages])

  const [shareCopied, setShareCopied] = useState(false)

  // Auto-save to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem('wow-raidplan-v1', JSON.stringify(pages)) } catch {}
  }, [pages])

  // Current page (always valid — clamp defensively)
  const safeIdx = Math.min(activePageIdx, pages.length - 1)
  const page     = pages[safeIdx]
  const { players, keyframes } = page
  const currentKf    = keyframes[activeKeyframe] ?? {}
  const texts        = currentKf._texts        ?? []
  const arrows       = currentKf._arrows       ?? []
  const swirls       = currentKf._swirls       ?? []
  const markers      = currentKf._markers      ?? []
  const bosses       = currentKf._bosses       ?? []
  const fieldEffects = currentKf._fieldEffects ?? []

  // Single updater for the active page — all mutations go through here
  const updatePage = useCallback((updater) => {
    setPages(prev => prev.map((p, i) => i === safeIdx ? updater(p) : p))
  }, [safeIdx])

  // ── Page management ─────────────────────────────────────────────────────────

  const switchPage = useCallback((idx) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    setIsPlaying(false)
    setPlayT(0)
    setActivePageIdx(idx)
    setActiveKeyframe(0)
    setSelectedId(null)
    setSelectedTextId(null)
  }, [])

  const addPage = useCallback(() => {
    setPages(prev => {
      const newPage = clonePage(prev[0], `Phase ${prev.length + 1}`)
      return [...prev, newPage]
    })
    setActivePageIdx(pages.length)
    setActiveKeyframe(0)
    setSelectedId(null)
    if (animRef.current) cancelAnimationFrame(animRef.current)
    setIsPlaying(false)
    setPlayT(0)
  }, [pages.length])

  const removePage = useCallback((idx) => {
    if (pages.length <= 1) return
    setPages(prev => prev.filter((_, i) => i !== idx))
    setActivePageIdx(prev => {
      if (idx < prev) return prev - 1
      if (idx === prev) return Math.max(0, prev - 1)
      return prev
    })
    setActiveKeyframe(0)
    setSelectedId(null)
    if (animRef.current) cancelAnimationFrame(animRef.current)
    setIsPlaying(false)
    setPlayT(0)
  }, [pages.length])

  const renamePage = useCallback((idx, title) => {
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, title } : p))
  }, [])

  // ── Players ─────────────────────────────────────────────────────────────────

  const addPlayer = useCallback((classKey, specKey = null, x = null, y = null) => {
    const cls  = WOW_CLASSES.find(c => c.key === classKey) ?? ROLE_ICONS.find(r => r.key === classKey) ?? ENEMY_TYPES.find(e => e.key === classKey)
    const spec = specKey ? cls?.specs?.find(s => s.key === specKey) : null
    const id   = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const px   = x ?? CANVAS_W / 2 + (Math.random() - 0.5) * 120
    const py   = y ?? CANVAS_H / 2 + (Math.random() - 0.5) * 120
    const pos  = { x: px, y: py }
    const data = { id, classKey, specKey, color: cls.color,
                   label: spec?.label ?? cls.label, name: spec?.label ?? cls.label,
                   scale: 0.75, birthFrame: activeKeyframe }
    updatePage(p => ({
      ...p,
      players:   { ...p.players, [id]: data },
      keyframes: p.keyframes.map(kf => ({ ...kf, [id]: pos })),
    }))
  }, [updatePage, activeKeyframe])

  const pastePlayer = useCallback((classKey, specKey, name, scale, x, y, effect = null) => {
    const cls = WOW_CLASSES.find(c => c.key === classKey)
             ?? ROLE_ICONS.find(r => r.key === classKey)
             ?? ENEMY_TYPES.find(e => e.key === classKey)
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const data = { id, classKey, specKey: specKey ?? null, color: cls?.color ?? '#888',
                   label: name, name, scale: scale ?? 1, birthFrame: activeKeyframe }
    updatePage(p => ({
      ...p,
      players:   { ...p.players, [id]: data },
      keyframes: p.keyframes.map((kf, i) => {
        const updated = { ...kf, [id]: { x, y } }
        if (i === activeKeyframe && effect) {
          updated._playerEffects = { ...(kf._playerEffects ?? {}), [id]: effect }
        }
        return updated
      }),
    }))
    setSelectedId(id)
    setSelectedIds(new Set([id]))
    setSelectedTextId(null)
  }, [updatePage, activeKeyframe])

  const removePlayer = useCallback((id) => {
    updatePage(p => ({
      ...p,
      players:   Object.fromEntries(Object.entries(p.players).filter(([k]) => k !== id)),
      keyframes: p.keyframes.map(kf => { const n = { ...kf }; delete n[id]; return n }),
    }))
    setSelectedId(prev => prev === id ? null : prev)
  }, [updatePage])

  const updatePosition = useCallback((id, x, y) => {
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map((kf, i) =>
        i === activeKeyframe ? { ...kf, [id]: { x, y } } : kf
      ),
    }))
  }, [updatePage, activeKeyframe])

  const updatePlayerName = useCallback((id, name) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], name } } }))
  }, [updatePage])

  // ── Keyframes ───────────────────────────────────────────────────────────────

  const updateKf = useCallback((fn) => {
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map((kf, i) => i === activeKeyframe ? fn(kf) : kf),
    }))
  }, [updatePage, activeKeyframe])

  const setPlayerEffectStable = useCallback((id, effect) => {
    updateKf(kf => ({
      ...kf,
      _playerEffects: { ...(kf._playerEffects ?? {}), [id]: effect ?? null },
    }))
  }, [updateKf])

  const addKeyframe = useCallback(() => {
    updatePage(p => {
      const srcKf = p.keyframes[activeKeyframe] || {}
      const playerPositions = Object.fromEntries(
        Object.entries(srcKf).filter(([k]) => !k.startsWith('_'))
      )
      const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const newKf = {
        ...playerPositions,
        ...BLANK_KF_EXTRAS(),
        _bosses:  (srcKf._bosses  ?? []).map(b => ({ ...b, id: uid() })),
        _markers: (srcKf._markers ?? []).map(m => ({ ...m, id: uid() })),
        _texts:   (srcKf._texts   ?? []).filter(t => t.persistent).map(t => ({ ...t, id: uid() })),
      }
      const next = [...p.keyframes]
      next.splice(activeKeyframe + 1, 0, newKf)
      return { ...p, keyframes: next }
    })
    setActiveKeyframe(prev => prev + 1)
  }, [updatePage, activeKeyframe])

  const duplicateKeyframe = useCallback(() => {
    updatePage(p => {
      const srcKf = p.keyframes[activeKeyframe] || {}
      const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const newKf = {
        ...srcKf,
        _texts:         (srcKf._texts        ?? []).map(t  => ({ ...t,  id: uid() })),
        _arrows:        (srcKf._arrows       ?? []).map(a  => ({ ...a,  id: uid() })),
        _swirls:        (srcKf._swirls       ?? []).map(s  => ({ ...s,  id: uid() })),
        _markers:       (srcKf._markers      ?? []).map(m  => ({ ...m,  id: uid() })),
        _bosses:        (srcKf._bosses       ?? []).map(b  => ({ ...b,  id: uid() })),
        _fieldEffects:  (srcKf._fieldEffects ?? []).map(fe => ({ ...fe, id: uid() })),
        _playerEffects: { ...(srcKf._playerEffects ?? {}) },
      }
      const next = [...p.keyframes]
      next.splice(activeKeyframe + 1, 0, newKf)
      return { ...p, keyframes: next }
    })
    setActiveKeyframe(prev => prev + 1)
  }, [updatePage, activeKeyframe])

  const removeKeyframe = useCallback((index) => {
    if (keyframes.length <= 1) return
    updatePage(p => ({ ...p, keyframes: p.keyframes.filter((_, i) => i !== index) }))
    setActiveKeyframe(prev => Math.min(prev, keyframes.length - 2))
  }, [updatePage, keyframes.length])

  // ── Arrows ──────────────────────────────────────────────────────────────────

  const addArrow = useCallback((x1, y1, x2, y2) => {
    updateKf(kf => ({
      ...kf,
      _arrows: [...(kf._arrows ?? []), {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        x1, y1, x2, y2,
        color:       arrowStyle.color,
        dash:        arrowStyle.dash,
        strokeWidth: arrowStyle.strokeWidth,
        twoHeaded:   arrowStyle.twoHeaded,
      }],
    }))
  }, [updateKf, arrowStyle])

  const removeArrow = useCallback((id) => {
    updateKf(kf => ({ ...kf, _arrows: (kf._arrows ?? []).filter(a => a.id !== id) }))
  }, [updateKf])

  const moveArrow = useCallback((id, dx, dy) => {
    updateKf(kf => ({
      ...kf,
      _arrows: (kf._arrows ?? []).map(a => a.id === id
        ? { ...a, x1: a.x1+dx, y1: a.y1+dy, x2: a.x2+dx, y2: a.y2+dy } : a),
    }))
  }, [updateKf])

  const clearArrows = useCallback(() => {
    updateKf(kf => ({ ...kf, _arrows: [] }))
  }, [updateKf])

  // ── Swirls ──────────────────────────────────────────────────────────────────

  const addSwirl = useCallback(() => {
    updateKf(kf => ({ ...kf, _swirls: [...(kf._swirls ?? []), { id: Date.now().toString(), x: CANVAS_W/2, y: CANVAS_H/2, clockwise: true }] }))
  }, [updateKf])

  const removeSwirl = useCallback((id) => {
    updateKf(kf => ({ ...kf, _swirls: (kf._swirls ?? []).filter(s => s.id !== id) }))
  }, [updateKf])

  const moveSwirl = useCallback((id, x, y) => {
    updateKf(kf => ({ ...kf, _swirls: (kf._swirls ?? []).map(s => s.id === id ? { ...s, x, y } : s) }))
  }, [updateKf])

  // ── Texts ───────────────────────────────────────────────────────────────────

  const addText = useCallback((x, y) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    updateKf(kf => ({
      ...kf,
      _texts: [...(kf._texts ?? []), { id, text: 'Text', x, y, color: '#ffffff', fontSize: 16, bold: false, italic: false, fontFamily: 'sans-serif', animation: 'none', bgStyle: 'none', persistent: false }],
    }))
    setSelectedTextId(id)
    setSelectedId(null)
  }, [updateKf])

  const removeText = useCallback((id) => {
    updateKf(kf => ({ ...kf, _texts: (kf._texts ?? []).filter(t => t.id !== id) }))
    setSelectedTextId(prev => prev === id ? null : prev)
  }, [updateKf])

  const moveText = useCallback((id, x, y) => {
    updateKf(kf => ({ ...kf, _texts: (kf._texts ?? []).map(t => t.id === id ? { ...t, x, y } : t) }))
  }, [updateKf])

  const updateTextEl = useCallback((id, updates) => {
    updateKf(kf => ({ ...kf, _texts: (kf._texts ?? []).map(t => t.id === id ? { ...t, ...updates } : t) }))
  }, [updateKf])

  // ── Markers ──────────────────────────────────────────────────────────────────

  const addMarker = useCallback((type, x, y) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    updateKf(kf => ({
      ...kf,
      _markers: [...(kf._markers ?? []), { id, type, x: x ?? CANVAS_W / 2, y: y ?? CANVAS_H / 2, scale: 0.75 }],
    }))
  }, [updateKf])

  const removeMarker = useCallback((id) => {
    updateKf(kf => ({ ...kf, _markers: (kf._markers ?? []).filter(m => m.id !== id) }))
  }, [updateKf])

  const moveMarker = useCallback((id, x, y) => {
    updateKf(kf => ({ ...kf, _markers: (kf._markers ?? []).map(m => m.id === id ? { ...m, x, y } : m) }))
  }, [updateKf])

  // ── Bosses ───────────────────────────────────────────────────────────────────

  const addBoss = useCallback((bossType, x, y) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    updateKf(kf => ({
      ...kf,
      _bosses: [...(kf._bosses ?? []), { id, type: bossType, x: x ?? CANVAS_W / 2, y: y ?? CANVAS_H / 2 }],
    }))
  }, [updateKf])

  const removeBoss = useCallback((id) => {
    updateKf(kf => ({ ...kf, _bosses: (kf._bosses ?? []).filter(b => b.id !== id) }))
  }, [updateKf])

  const moveBoss = useCallback((id, x, y) => {
    updateKf(kf => ({ ...kf, _bosses: (kf._bosses ?? []).map(b => b.id === id ? { ...b, x, y } : b) }))
  }, [updateKf])

  // ── Field Effects ─────────────────────────────────────────────────────────────

  const addFieldEffect = useCallback((effect, x, y) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    updateKf(kf => ({ ...kf, _fieldEffects: [...(kf._fieldEffects ?? []), { id, effect, x, y }] }))
  }, [updateKf])

  const removeFieldEffect = useCallback((id) => {
    updateKf(kf => ({ ...kf, _fieldEffects: (kf._fieldEffects ?? []).filter(fe => fe.id !== id) }))
  }, [updateKf])

  const moveFieldEffect = useCallback((id, x, y) => {
    updateKf(kf => ({ ...kf, _fieldEffects: (kf._fieldEffects ?? []).map(fe => fe.id === id ? { ...fe, x, y } : fe) }))
  }, [updateKf])

  const updateFieldEffect = useCallback((id, updates) => {
    updateKf(kf => ({ ...kf, _fieldEffects: (kf._fieldEffects ?? []).map(fe => fe.id === id ? { ...fe, ...updates } : fe) }))
  }, [updateKf])

  // ── Lock toggles ──────────────────────────────────────────────────────────────

  const togglePlayerLocked = useCallback((id) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], locked: !p.players[id].locked } } }))
  }, [updatePage])

  const toggleTextLocked = useCallback((id) => {
    updateKf(kf => ({ ...kf, _texts: (kf._texts ?? []).map(t => t.id === id ? { ...t, locked: !t.locked } : t) }))
  }, [updateKf])

  const toggleMarkerLocked = useCallback((id) => {
    updateKf(kf => ({ ...kf, _markers: (kf._markers ?? []).map(m => m.id === id ? { ...m, locked: !m.locked } : m) }))
  }, [updateKf])

  const toggleBossLocked = useCallback((id) => {
    updateKf(kf => ({ ...kf, _bosses: (kf._bosses ?? []).map(b => b.id === id ? { ...b, locked: !b.locked } : b) }))
  }, [updateKf])

  const toggleFieldEffectLocked = useCallback((id) => {
    updateKf(kf => ({ ...kf, _fieldEffects: (kf._fieldEffects ?? []).map(fe => fe.id === id ? { ...fe, locked: !fe.locked } : fe) }))
  }, [updateKf])

  // ── Canvas labels ────────────────────────────────────────────────────────────

  const updatePlayerLabel = useCallback((id, canvasLabel) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], canvasLabel } } }))
  }, [updatePage])

  const updateMarkerLabel = useCallback((id, canvasLabel) => {
    updateKf(kf => ({ ...kf, _markers: (kf._markers ?? []).map(m => m.id === id ? { ...m, canvasLabel } : m) }))
  }, [updateKf])

  const updateBossLabel = useCallback((id, canvasLabel) => {
    updateKf(kf => ({ ...kf, _bosses: (kf._bosses ?? []).map(b => b.id === id ? { ...b, canvasLabel } : b) }))
  }, [updateKf])

  // ── Scale & spec updates ─────────────────────────────────────────────────────

  const updatePlayerScale = useCallback((id, scale) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], scale } } }))
  }, [updatePage])

  const updatePlayerSpec = useCallback((id, specKey) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], specKey } } }))
  }, [updatePage])

  const updateMarkerScale = useCallback((id, scale) => {
    updateKf(kf => ({ ...kf, _markers: (kf._markers ?? []).map(m => m.id === id ? { ...m, scale } : m) }))
  }, [updateKf])

  const updateBossScale = useCallback((id, scale) => {
    updateKf(kf => ({ ...kf, _bosses: (kf._bosses ?? []).map(b => b.id === id ? { ...b, scale } : b) }))
  }, [updateKf])

  // ── Multi-select drag ────────────────────────────────────────────────────────

  const moveSelected = useCallback((movedId, newX, newY, dx, dy) => {
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map((kf, i) => {
        if (i !== activeKeyframe) return kf
        const next = { ...kf }
        next[movedId] = { x: newX, y: newY }
        selectedIds.forEach(id => {
          if (id !== movedId && next[id]) {
            next[id] = { x: next[id].x + dx, y: next[id].y + dy }
          }
        })
        return next
      }),
    }))
  }, [updatePage, activeKeyframe, selectedIds])

  // ── Copy / Paste ─────────────────────────────────────────────────────────────

  const pasteAt = useCallback((x, y) => {
    if (!clipboard) return

    // Multi-object paste
    if (clipboard.type === 'multi') {
      const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const newItems = clipboard.items.map(item => ({ ...item, newId: uid() }))

      setPages(prev => prev.map((p, pi) => {
        if (pi !== safeIdx) return p
        let newPlayers = { ...p.players }
        const positionsToAdd = {}
        const effectsToAdd   = {}

        newItems.forEach(item => {
          const px = x + (item.relX ?? 0)
          const py = y + (item.relY ?? 0)
          if (item.objType === 'player') {
            const cls = WOW_CLASSES.find(c => c.key === item.classKey)
                     ?? ROLE_ICONS.find(r => r.key === item.classKey)
                     ?? ENEMY_TYPES.find(e => e.key === item.classKey)
            newPlayers[item.newId] = {
              id: item.newId, classKey: item.classKey, specKey: item.specKey ?? null,
              color: cls?.color ?? item.color ?? '#888', label: item.name, name: item.name,
              scale: item.scale ?? 1, birthFrame: activeKeyframe,
            }
            positionsToAdd[item.newId] = { x: px, y: py }
            if (item.effect) effectsToAdd[item.newId] = item.effect
          }
        })

        const newKeyframes = p.keyframes.map((kf, i) => {
          const updated = { ...kf, ...positionsToAdd }
          if (i === activeKeyframe && Object.keys(effectsToAdd).length > 0) {
            updated._playerEffects = { ...(kf._playerEffects ?? {}), ...effectsToAdd }
          }
          return updated
        })

        return { ...p, players: newPlayers, keyframes: newKeyframes }
      }))

      const newPlayerIds = new Set(newItems.filter(i => i.objType === 'player').map(i => i.newId))
      setSelectedIds(newPlayerIds)
      setSelectedId(null)
      setSelectedTextId(null)
      return
    }

    // Single-object paste
    if (clipboard.type === 'player') {
      pastePlayer(clipboard.classKey, clipboard.specKey, clipboard.name, clipboard.scale, x, y, clipboard.effect ?? null)
    } else if (clipboard.type === 'text') {
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      updateKf(kf => ({
        ...kf,
        _texts: [...(kf._texts ?? []), { ...clipboard, id: newId, x, y }],
      }))
      setSelectedTextId(newId)
      setSelectedId(null)
      setSelectedIds(new Set())
    } else if (clipboard.type === 'marker') {
      addMarker(clipboard.markerType, x, y)
    } else if (clipboard.type === 'boss') {
      addBoss(clipboard.bossType, x, y)
    } else if (clipboard.type === 'fieldEffect') {
      addFieldEffect(clipboard.effect, x, y)
    }
  }, [clipboard, pastePlayer, updateKf, addMarker, addBoss, addFieldEffect, safeIdx, activeKeyframe]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyFromContextMenu = useCallback((ctxInfo) => {
    if (ctxInfo.type === 'player') {
      setClipboard({ type: 'player', classKey: ctxInfo.classKey, specKey: ctxInfo.specKey ?? null,
                     name: ctxInfo.name ?? '', scale: ctxInfo.scale ?? 1,
                     effect: ctxInfo.effect ?? null,
                     x: ctxInfo.canvasX ?? CANVAS_W/2, y: ctxInfo.canvasY ?? CANVAS_H/2 })
    } else if (ctxInfo.type === 'text') {
      if (ctxInfo.textEl) setClipboard({ type: 'text', ...ctxInfo.textEl })
    } else if (ctxInfo.type === 'multi') {
      setClipboard({ type: 'multi', items: ctxInfo.items })
    } else if (ctxInfo.type === 'marker') {
      setClipboard({ type: 'marker', markerType: ctxInfo.markerType,
                     scale: ctxInfo.scale ?? 1,
                     x: ctxInfo.canvasX ?? CANVAS_W/2, y: ctxInfo.canvasY ?? CANVAS_H/2 })
    } else if (ctxInfo.type === 'boss') {
      setClipboard({ type: 'boss', bossType: ctxInfo.bossType,
                     scale: ctxInfo.scale ?? 1,
                     x: ctxInfo.canvasX ?? CANVAS_W/2, y: ctxInfo.canvasY ?? CANVAS_H/2 })
    }
  }, [])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        const kf = keyframes[activeKeyframe] ?? {}
        if (selectedIds.size > 1) {
          // Multi-copy: all selected players with their current effects
          const items = [...selectedIds].flatMap(id => {
            const p = players[id]
            if (!p) return []
            const pos    = kf[id] ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 }
            const effect = kf._playerEffects?.[id] ?? null
            return [{ objType: 'player', classKey: p.classKey, specKey: p.specKey ?? null,
                      name: p.name, scale: p.scale ?? 1, effect, color: p.color,
                      x: pos.x, y: pos.y }]
          })
          if (items.length > 0) {
            const cx = items.reduce((s, i) => s + i.x, 0) / items.length
            const cy = items.reduce((s, i) => s + i.y, 0) / items.length
            setClipboard({ type: 'multi', items: items.map(i => ({ ...i, relX: i.x - cx, relY: i.y - cy })) })
          }
        } else if (selectedId && players[selectedId]) {
          const p      = players[selectedId]
          const pos    = kf[selectedId] ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 }
          const effect = kf._playerEffects?.[selectedId] ?? null
          setClipboard({ type: 'player', classKey: p.classKey, specKey: p.specKey ?? null,
                         name: p.name, scale: p.scale ?? 1, effect, x: pos.x, y: pos.y })
        } else if (selectedTextId) {
          const t = texts.find(txt => txt.id === selectedTextId)
          if (t) setClipboard({ type: 'text', ...t })
        }
        return
      }

      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        if (!clipboard) return
        if (clipboard.type === 'multi') {
          pasteAt(CANVAS_W / 2, CANVAS_H / 2)
        } else {
          const OFFSET = 25
          pasteAt((clipboard.x ?? CANVAS_W / 2) + OFFSET, (clipboard.y ?? CANVAS_H / 2) + OFFSET)
        }
        return
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (selectedId && !players[selectedId]?.locked) removePlayer(selectedId)
      if (selectedTextId) {
        const t = texts.find(txt => txt.id === selectedTextId)
        if (t && !t.locked) removeText(selectedTextId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, selectedTextId, removePlayer, removeText, clipboard, pasteAt,
      players, keyframes, activeKeyframe, texts, selectedIds])

  // ── Playback ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying) return
    const playable = pagesRef.current
      .map((p, idx) => ({ pageIdx: idx, segs: p.keyframes.length - 1 }))
      .filter(e => e.segs > 0)
    if (playable.length === 0) { setIsPlaying(false); return }
    const total = playable.reduce((s, e) => s + e.segs, 0)
    const totalDuration = total * FRAME_DURATION
    let startTime = null

    function tick(ts) {
      if (!startTime) startTime = ts
      const elapsed = ts - startTime
      const globalT = Math.min(elapsed / totalDuration, 1) * total
      let remaining = globalT
      let pageIdx = playable[playable.length - 1].pageIdx
      let localT  = playable[playable.length - 1].segs
      for (const entry of playable) {
        if (remaining <= entry.segs) { pageIdx = entry.pageIdx; localT = remaining; break }
        remaining -= entry.segs
      }
      setActivePageIdx(pageIdx)
      setPlayT(localT)
      if (elapsed < totalDuration) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        setIsPlaying(false)
        setPlayT(0)
      }
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [isPlaying])

  const handlePlay = useCallback(() => {
    const hasAnything = pagesRef.current.some(p => p.keyframes.length >= 2)
    if (!hasAnything) return
    setActivePageIdx(0)
    setPlayT(0)
    setIsPlaying(true)
  }, [])

  const handleStop = useCallback(() => {
    setIsPlaying(false); setPlayT(0)
    if (animRef.current) cancelAnimationFrame(animRef.current)
  }, [])

  const handleShare = useCallback(() => {
    try {
      const compressed = compressToEncodedURIComponent(JSON.stringify({ pages: pagesRef.current, bgImage }))
      const url = `${window.location.origin}${window.location.pathname}#view=${compressed}`
      navigator.clipboard.writeText(url).then(() => {
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2500)
      })
    } catch (e) {
      console.error('Share failed:', e)
    }
  }, [bgImage])

  // ── Display positions ────────────────────────────────────────────────────────

  const swirlAngle = isPlaying ? (playT * 120) % 360 : 0
  const currentFrame = isPlaying ? Math.round(playT) : activeKeyframe

  const displayKf           = keyframes[Math.min(currentFrame, keyframes.length - 1)] ?? {}
  const visibleTexts        = displayKf._texts        ?? []
  const visibleArrows       = displayKf._arrows       ?? []
  const visibleSwirls       = displayKf._swirls       ?? []
  const visibleMarkers      = displayKf._markers      ?? []
  const visibleBosses       = displayKf._bosses       ?? []
  const visibleFieldEffects = displayKf._fieldEffects ?? []

  const visiblePlayers = Object.fromEntries(
    Object.entries(players)
      .filter(([, p]) => (p.birthFrame ?? 0) <= currentFrame)
      .map(([id, p]) => [id, {
        ...p,
        effect: displayKf._playerEffects?.[id] ?? null,
      }])
  )

  let displayPositions
  if (!isPlaying) {
    displayPositions = keyframes[activeKeyframe] || {}
  } else {
    const frameIndex = Math.min(Math.floor(playT), keyframes.length - 2)
    const t = playT - frameIndex
    const frameA = keyframes[frameIndex] || {}
    const frameB = keyframes[frameIndex + 1] || frameA
    displayPositions = {}
    Object.keys(visiblePlayers).forEach(id => {
      const a = frameA[id] || { x: CANVAS_W / 2, y: CANVAS_H / 2 }
      const b = frameB[id] || a
      displayPositions[id] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    })
  }

  const handleBgUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new window.Image()
      img.onload = () => {
        const MAX_W = 820, MAX_H = 580
        const scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1)
        const c = document.createElement('canvas')
        c.width  = Math.round(img.width  * scale)
        c.height = Math.round(img.height * scale)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        setBgImage(c.toDataURL('image/jpeg', 0.65))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">🗺 Raid Planner</h1>
        <label className="btn-secondary upload-btn">
          Upload Map
          <input type="file" accept="image/*" onChange={handleBgUpload} style={{ display: 'none' }} />
        </label>
        {bgImage && (
          <button className="btn-secondary" onClick={() => setBgImage(null)}>Clear Map</button>
        )}
        <button
          className="btn-danger"
          onClick={() => {
            if (!window.confirm('Wipe everything and start fresh?')) return
            setPages([blankPage('Phase 1')])
            setActivePageIdx(0)
            setActiveKeyframe(0)
            setSelectedId(null)
            setSelectedTextId(null)
            setSelectedIds(new Set())
            setBgImage(null)
            if (animRef.current) cancelAnimationFrame(animRef.current)
            setIsPlaying(false)
            setPlayT(0)
          }}
        >
          🗑 Wipe Plan
        </button>
        {clipboard && (
          <span className="clipboard-hint">
            📋 {clipboard.type === 'multi' ? `${clipboard.items.length} items` : clipboard.type} copied — Ctrl+V to paste
          </span>
        )}
      </header>

      <PageTabs
        pages={pages}
        activePageIdx={safeIdx}
        onSelect={switchPage}
        onAdd={addPage}
        onRemove={removePage}
        onRename={renamePage}
      />

      <div className="app-body">
        <Sidebar
          tool={tool} setTool={setTool}
          onAddPlayer={addPlayer}
          selectedId={selectedId} players={players}
          onRemovePlayer={removePlayer}
          onUpdateName={updatePlayerName}
          onSetEffect={setPlayerEffectStable}
          selectedTextId={selectedTextId}
          texts={texts}
          onUpdateText={updateTextEl}
          onAddMarker={addMarker}
          onAddBoss={addBoss}
          arrowStyle={arrowStyle}
          onArrowStyleChange={(updates) => setArrowStyle(prev => ({ ...prev, ...updates }))}
        />
        <main className="canvas-area">
          <RaidCanvas
            width={CANVAS_W} height={CANVAS_H}
            players={visiblePlayers} positions={displayPositions}
            arrows={visibleArrows} swirls={visibleSwirls} swirlAngle={swirlAngle}
            texts={visibleTexts} markers={visibleMarkers} bosses={visibleBosses}
            fieldEffects={visibleFieldEffects}
            onAddFieldEffect={addFieldEffect}
            onMoveFieldEffect={moveFieldEffect}
            onRemoveFieldEffect={removeFieldEffect}
            onUpdateFieldEffect={updateFieldEffect}
            bgImage={bgImage} tool={tool} setTool={setTool}
            isPlaying={isPlaying} selectedId={selectedId}
            selectedTextId={selectedTextId} selectedIds={selectedIds}
            arrowStyle={arrowStyle}
            onArrowStyleChange={(updates) => setArrowStyle(prev => ({ ...prev, ...updates }))}
            clipboard={clipboard}
            onCopyObject={copyFromContextMenu}
            onPasteAt={pasteAt}
            onSelectPlayer={(id) => {
              const newId = id === selectedId ? null : id
              setSelectedId(newId)
              setSelectedIds(newId ? new Set([newId]) : new Set())
              setSelectedTextId(null)
            }}
            onSetSelectedIds={(ids) => { setSelectedIds(ids); setSelectedId(null); setSelectedTextId(null) }}
            onSelectText={(id) => { setSelectedTextId(id); setSelectedId(null); setSelectedIds(new Set()) }}
            onMovePlayer={updatePosition}
            onMoveSelected={moveSelected}
            onAddPlayer={addPlayer}
            onAddText={addText}
            onAddArrow={addArrow}
            onAddMarker={addMarker}
            onRemovePlayer={removePlayer}
            onRemoveArrow={removeArrow}
            onMoveArrow={moveArrow}
            onMoveSwirl={moveSwirl}
            onRemoveSwirl={removeSwirl}
            onMoveText={moveText}
            onRemoveText={removeText}
            onMoveMarker={moveMarker}
            onRemoveMarker={removeMarker}
            onAddBoss={addBoss}
            onMoveBoss={moveBoss}
            onRemoveBoss={removeBoss}
            onUpdatePlayerScale={updatePlayerScale}
            onUpdatePlayerSpec={updatePlayerSpec}
            onUpdateMarkerScale={updateMarkerScale}
            onUpdateBossScale={updateBossScale}
            onUpdatePlayerLabel={updatePlayerLabel}
            onUpdateMarkerLabel={updateMarkerLabel}
            onUpdateBossLabel={updateBossLabel}
            onTogglePlayerLocked={togglePlayerLocked}
            onToggleTextLocked={toggleTextLocked}
            onToggleMarkerLocked={toggleMarkerLocked}
            onToggleBossLocked={toggleBossLocked}
            onToggleFieldEffectLocked={toggleFieldEffectLocked}
          />
          <Timeline
            keyframes={keyframes}
            activeKeyframe={activeKeyframe}
            onSelectKeyframe={setActiveKeyframe}
            onAddKeyframe={addKeyframe}
            onDuplicateKeyframe={duplicateKeyframe}
            onRemoveKeyframe={removeKeyframe}
            isPlaying={isPlaying} playT={playT}
            onPlay={handlePlay} onStop={handleStop}
            onShare={handleShare} shareCopied={shareCopied}
          />
        </main>
      </div>
    </div>
  )
}
