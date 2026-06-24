import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { compressToEncodedURIComponent } from 'lz-string'
import { exportForAddon } from './utils/exportForAddon'
import { normalizeMaps, resolveMapUrl, makeMapId } from './utils/maps'
import { db } from './firebase'
import { doc, setDoc } from 'firebase/firestore'
import RaidCanvas from './components/RaidCanvas'
import Sidebar    from './components/Sidebar'
import Timeline   from './components/Timeline'
import PageTabs   from './components/PageTabs'
import { WOW_CLASSES, ROLE_ICONS, ENEMY_TYPES } from './data/classes'
import { BOSS_CONFIGS, getBossConfig } from './data/bossConfigs'
import PlanPicker from './components/PlanPicker'
import './App.css'

const CANVAS_W = 1294
const CANVAS_H = 728

// ── Page factories ────────────────────────────────────────────────────────────

const BLANK_KF_EXTRAS = () => ({
  _texts: [], _arrows: [], _swirls: [], _markers: [],
  _bosses: [], _fieldEffects: [], _playerEffects: {},
  _hiddenPlayerIds: [],
  _duration: 2000,
})

const BLANK_NOTES = () => ({ tank: '', healer: '', dps: '' })

function blankPage(title) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    mode:      'diagram',
    notes:     BLANK_NOTES(),
    players:   {},
    keyframes: [BLANK_KF_EXTRAS()],
    swaps:     [],
  }
}

function clonePage(source, title) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    mode:      source.mode ?? 'diagram',
    notes:     source.notes ? { ...source.notes } : BLANK_NOTES(),
    players:   { ...source.players },
    keyframes: source.keyframes.map(kf => {
      const out = {}
      for (const [k, v] of Object.entries(kf)) {
        if (k === '_playerEffects') out[k] = { ...v }
        else if (k === '_hiddenPlayerIds') out[k] = [...v]
        else if (k.startsWith('_') && Array.isArray(v)) out[k] = v.map(el => ({ ...el }))
        else if (!k.startsWith('_')) out[k] = { ...v }
      }
      return { ...BLANK_KF_EXTRAS(), ...out }
    }),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

function makePlanId() { return `plan-${Date.now()}-${Math.random().toString(36).slice(2)}` }

export default function App() {
  // ── Plan store ───────────────────────────────────────────────────────────────
  const [plansStore, setPlansStore] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('wow-raidplan-plans-v1'))
      if (stored?.plans?.length > 0 && stored.activePlanId) {
        stored.plans = stored.plans.map(plan => ({
          ...plan,
          pages: (plan.pages ?? []).map(p => ({
            ...p,
            mode: p.mode ?? ((p.keyframes?.length ?? 1) > 1 ? 'sequence' : 'diagram'),
            swaps: p.swaps ?? [],
          })),
        }))
        return stored
      }
    } catch {}
    // Migrate from old format
    try {
      const old = JSON.parse(localStorage.getItem('wow-raidplan-v1'))
      if (Array.isArray(old) && old.length > 0) {
        const id = makePlanId()
        return { plans: [{ id, name: 'My Plan', bossKey: 'immerseus', pages: old, bgImage: null, updatedAt: Date.now() }], activePlanId: id }
      }
    } catch {}
    // Fresh start
    const id = makePlanId()
    return { plans: [{ id, name: 'My Plan', bossKey: 'immerseus', pages: [blankPage('Phase 1')], bgImage: null, updatedAt: Date.now() }], activePlanId: id }
  })
  const [showPlanPicker, setShowPlanPicker] = useState(false)

  const activePlan = plansStore.plans.find(p => p.id === plansStore.activePlanId) ?? plansStore.plans[0]
  const bossConfig = getBossConfig(activePlan?.bossKey)

  const [pages, setPages] = useState(() => activePlan?.pages ?? [blankPage('Phase 1')])
  const [activePageIdx,  setActivePageIdx]  = useState(0)
  const [activeKeyframe, setActiveKeyframe] = useState(0)
  const [selectedId,     setSelectedId]     = useState(null)
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [selectedIds,    setSelectedIds]    = useState(new Set())
  const [tool,           setTool]           = useState('select')
  const [isPlaying,      setIsPlaying]      = useState(false)
  const [playT,          setPlayT]          = useState(0)
  const [maps,           setMaps]           = useState(() => normalizeMaps(activePlan))
  const [arrowStyle,     setArrowStyle]     = useState({ color: '#ff4444', dash: false, strokeWidth: 2.5, twoHeaded: false })
  const [clipboard,      setClipboard]      = useState(null)
  const [snapEnabled,    setSnapEnabled]    = useState(true)
  const [showMapsPanel, setShowMapsPanel]  = useState(false)
  const [privateNote,    setPrivateNote]    = useState(() => {
    try { return localStorage.getItem('raidplan-private-note') ?? '' } catch { return '' }
  })
  const handlePrivateNote = useCallback((val) => {
    setPrivateNote(val)
    try { localStorage.setItem('raidplan-private-note', val) } catch {}
  }, [])
  const animRef        = useRef(null)
  const pagesRef       = useRef(pages)
  const plansStoreRef  = useRef(plansStore)
  const canvasCursorRef        = useRef({ x: CANVAS_W / 2, y: CANVAS_H / 2 })
  const undoStackRef           = useRef([])
  const hoveredCanvasObjectRef = useRef(null)
  const prevPagesRef   = useRef(pages)
  const isUndoingRef   = useRef(false)
  const lsSaveRef      = useRef(null)
  const playStartOffsetRef = useRef(0)
  useEffect(() => { pagesRef.current = pages }, [pages])
  useEffect(() => { plansStoreRef.current = plansStore }, [plansStore])

  useEffect(() => {
    if (isUndoingRef.current) {
      isUndoingRef.current = false
      prevPagesRef.current = pages
      return
    }
    undoStackRef.current.push(prevPagesRef.current)
    if (undoStackRef.current.length > 20) undoStackRef.current.shift()
    prevPagesRef.current = pages
  }, [pages])

  const [shareCopied,       setShareCopied]       = useState(false)
  const [shareLoading,      setShareLoading]      = useState(false)
  const [addonExportCopied, setAddonExportCopied] = useState(false)

  // Auto-save pages + maps into the active plan.
  // plansStore state updates immediately (needed for plan picker UI).
  // localStorage write is debounced — serializing a large plan on every drag
  // would block the main thread and cause lag.
  useEffect(() => {
    setPlansStore(prev => {
      const updated = {
        ...prev,
        plans: prev.plans.map(p =>
          p.id === prev.activePlanId
            ? { ...p, pages, maps, bgImage: maps[0]?.url ?? null, updatedAt: Date.now() }
            : p
        ),
      }
      clearTimeout(lsSaveRef.current)
      lsSaveRef.current = setTimeout(() => {
        try { localStorage.setItem('wow-raidplan-plans-v1', JSON.stringify(updated)) } catch {}
      }, 1500)
      return updated
    })
  }, [pages, maps]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Plan management ──────────────────────────────────────────────────────────

  const resetCanvasState = useCallback(() => {
    setActivePageIdx(0)
    setActiveKeyframe(0)
    setSelectedId(null)
    setSelectedTextId(null)
    setSelectedIds(new Set())
    if (animRef.current) cancelAnimationFrame(animRef.current)
    setIsPlaying(false)
    setPlayT(0)
  }, [])

  const switchPlan = useCallback((planId) => {
    const plan = plansStoreRef.current.plans.find(p => p.id === planId)
    if (!plan) return
    setPages(plan.pages)
    setMaps(normalizeMaps(plan))
    setPlansStore(prev => ({ ...prev, activePlanId: planId }))
    resetCanvasState()
    setShowPlanPicker(false)
  }, [resetCanvasState])

  const createPlan = useCallback((name, bossKey) => {
    const id = makePlanId()
    const plan = { id, name, bossKey, pages: [blankPage('Phase 1')], maps: [], bgImage: null, updatedAt: Date.now() }
    setPlansStore(prev => {
      const updated = { plans: [...prev.plans, plan], activePlanId: id }
      try { localStorage.setItem('wow-raidplan-plans-v1', JSON.stringify(updated)) } catch {}
      return updated
    })
    setPages(plan.pages)
    setMaps([])
    resetCanvasState()
    setShowPlanPicker(false)
  }, [resetCanvasState])

  const deletePlan = useCallback((planId) => {
    const current = plansStoreRef.current
    const filtered = current.plans.filter(p => p.id !== planId)
    if (filtered.length === 0) {
      const id = makePlanId()
      const fallback = { id, name: 'My Plan', bossKey: 'immerseus', pages: [blankPage('Phase 1')], maps: [], bgImage: null, updatedAt: Date.now() }
      const newStore = { plans: [fallback], activePlanId: fallback.id }
      setPages(fallback.pages)
      setMaps([])
      setPlansStore(newStore)
      try { localStorage.setItem('wow-raidplan-plans-v1', JSON.stringify(newStore)) } catch {}
      return
    }
    if (current.activePlanId === planId) {
      const next = filtered[filtered.length - 1]
      const newStore = { plans: filtered, activePlanId: next.id }
      setPages(next.pages)
      setMaps(normalizeMaps(next))
      resetCanvasState()
      setPlansStore(newStore)
      try { localStorage.setItem('wow-raidplan-plans-v1', JSON.stringify(newStore)) } catch {}
      return
    }
    const newStore = { plans: filtered, activePlanId: current.activePlanId }
    setPlansStore(newStore)
    try { localStorage.setItem('wow-raidplan-plans-v1', JSON.stringify(newStore)) } catch {}
  }, [resetCanvasState])

  // Current page (always valid — clamp defensively)
  const safeIdx = Math.min(activePageIdx, pages.length - 1)
  const page     = pages[safeIdx]
  const { players, keyframes } = page
  const bgImage = resolveMapUrl(maps, keyframes, activeKeyframe)
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
      const newPage = { ...clonePage(prev[0], `Phase ${prev.length + 1}`), mode: 'diagram' }
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

  const updateNotes = useCallback((role, text) => {
    setPages(prev => prev.map((p, i) =>
      i === safeIdx ? { ...p, notes: { ...(p.notes ?? {}), [role]: text } } : p
    ))
  }, [safeIdx])

  const [playbackSpeed, setPlaybackSpeed] = useState(1)

  const updateFrameDuration = useCallback((frameIdx, ms) => {
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map((kf, i) => i === frameIdx ? { ...kf, _duration: ms } : kf),
    }))
  }, [updatePage])

  const toggleKeyframeSnap = useCallback((idx) => {
    if (idx <= 0) return
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map((kf, i) => i === idx ? { ...kf, _snap: !kf._snap } : kf),
    }))
  }, [updatePage])

  const updatePageMode = useCallback((mode) => {
    updatePage(p => ({ ...p, mode }))
    if (mode === 'diagram') {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      setIsPlaying(false)
      setPlayT(0)
    }
  }, [updatePage])

  const enterSequenceMode = useCallback(() => {
    updatePage(p => ({ ...p, mode: 'sequence' }))
  }, [updatePage])

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
                   scale: 0.85, birthFrame: activeKeyframe }
    updatePage(p => ({
      ...p,
      players:   { ...p.players, [id]: data },
      keyframes: p.keyframes.map(kf => ({ ...kf, [id]: pos })),
    }))
  }, [updatePage, activeKeyframe])

  const pastePlayer = useCallback((cb, x, y) => {
    const cls = WOW_CLASSES.find(c => c.key === cb.classKey)
             ?? ROLE_ICONS.find(r => r.key === cb.classKey)
             ?? ENEMY_TYPES.find(e => e.key === cb.classKey)
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const data = {
      id, classKey: cb.classKey, specKey: cb.specKey ?? null,
      color: cls?.color ?? '#888', label: cb.name, name: cb.name,
      scale: cb.scale ?? 1, birthFrame: activeKeyframe,
      ...(cb.rotation   ? { rotation: cb.rotation }     : {}),
      ...(cb.canvasLabel ? { canvasLabel: cb.canvasLabel } : {}),
      ...(cb.labelStyle && cb.labelStyle !== 'plain'  ? { labelStyle: cb.labelStyle }   : {}),
      ...(cb.labelFont  && cb.labelFont  !== 'cinzel' ? { labelFont:  cb.labelFont  }   : {}),
      ...(cb.labelColor  ? { labelColor:  cb.labelColor  }  : {}),
      ...(cb.effectStopped ? { effectStopped: cb.effectStopped } : {}),
    }
    updatePage(p => ({
      ...p,
      players:   { ...p.players, [id]: data },
      keyframes: p.keyframes.map((kf, i) => {
        const updated = { ...kf, [id]: { x, y } }
        if (i === activeKeyframe && cb.effect) {
          updated._playerEffects = { ...(kf._playerEffects ?? {}), [id]: cb.effect }
        }
        return updated
      }),
    }))
    setSelectedId(id)
    setSelectedIds(new Set([id]))
    setSelectedTextId(null)
  }, [updatePage, activeKeyframe])

  const removePlayer = useCallback((id) => {
    updatePage(p => {
      if (activeKeyframe === 0) {
        // On the first frame: full delete — no previous frames to preserve
        return {
          ...p,
          players:   Object.fromEntries(Object.entries(p.players).filter(([k]) => k !== id)),
          keyframes: p.keyframes.map(kf => { const n = { ...kf }; delete n[id]; return n }),
        }
      }
      // On any later frame: hide from this frame onwards, leave earlier frames intact
      return {
        ...p,
        keyframes: p.keyframes.map((kf, i) => {
          if (i < activeKeyframe) return kf
          const hidden = new Set(kf._hiddenPlayerIds ?? [])
          hidden.add(id)
          return { ...kf, _hiddenPlayerIds: [...hidden] }
        }),
      }
    })
    setSelectedId(prev => prev === id ? null : prev)
  }, [updatePage, activeKeyframe])

  const updatePosition = useCallback((id, x, y) => {
    updatePage(p => ({
      ...p,
      keyframes: p.mode === 'diagram'
        ? p.keyframes.map(kf => ({ ...kf, [id]: { x, y } }))
        : p.keyframes.map((kf, i) => i === activeKeyframe ? { ...kf, [id]: { x, y } } : kf),
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

  const hideInFrame = useCallback((items) => {
    updateKf(kf => {
      let next = { ...kf }
      const playerIds = items.filter(i => i.type === 'player').map(i => i.id)
      if (playerIds.length) {
        next._hiddenPlayerIds = [...new Set([...(kf._hiddenPlayerIds ?? []), ...playerIds])]
      }
      const typeToKey = {
        marker: '_markers', boss: '_bosses', text: '_texts',
        arrow: '_arrows', fieldEffect: '_fieldEffects', swirl: '_swirls',
      }
      for (const [type, key] of Object.entries(typeToKey)) {
        const ids = new Set(items.filter(i => i.type === type).map(i => i.id))
        if (!ids.size) continue
        next[key] = (kf[key] ?? []).map(obj => ids.has(obj.id) ? { ...obj, hidden: true } : obj)
      }
      return next
    })
  }, [updateKf])

  const setPlayerEffectStable = useCallback((id, effect) => {
    updateKf(kf => ({
      ...kf,
      _playerEffects: { ...(kf._playerEffects ?? {}), [id]: effect ?? null },
    }))
  }, [updateKf])

  const toggleEffectStopped = useCallback((id) => {
    updatePage(p => ({
      ...p,
      players: { ...p.players, [id]: { ...p.players[id], effectStopped: !p.players[id]?.effectStopped } },
    }))
  }, [updatePage])

  const setBossEffectStable = useCallback((id, effect) => {
    updateKf(kf => ({
      ...kf,
      _bosses: (kf._bosses ?? []).map(b => b.id === id ? { ...b, effect: effect ?? null } : b),
    }))
  }, [updateKf])

  const toggleBossEffectStopped = useCallback((id) => {
    updateKf(kf => ({
      ...kf,
      _bosses: (kf._bosses ?? []).map(b => b.id === id ? { ...b, effectStopped: !b.effectStopped } : b),
    }))
  }, [updateKf])

  const addKeyframe = useCallback(() => {
    updatePage(p => {
      const kfIdx = Math.min(activeKeyframe, p.keyframes.length - 1)
      const insertAt = kfIdx + 1
      const srcKf = p.keyframes[kfIdx] || {}
      const playerPositions = Object.fromEntries(
        Object.entries(srcKf).filter(([k]) => !k.startsWith('_'))
      )
      const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const newKf = {
        ...playerPositions,
        ...BLANK_KF_EXTRAS(),
        _hiddenPlayerIds: [...(srcKf._hiddenPlayerIds ?? [])],
        _playerEffects:   { ...(srcKf._playerEffects  ?? {}) },
        _bosses:        (srcKf._bosses        ?? []).filter(b  => !b.hidden).map(b => ({ ...b })),
        _markers:       (srcKf._markers       ?? []).filter(m  => !m.hidden).map(m => ({ ...m, id: uid() })),
        _texts:         (srcKf._texts         ?? []).filter(t  => t.persistent && !t.hidden).map(t => ({ ...t, id: uid(), textRoleTags: t.textRoleTags ? [...t.textRoleTags] : [] })),
        _fieldEffects:  (srcKf._fieldEffects  ?? []).filter(fe => fe.persistent && !fe.hidden).map(fe => ({ ...fe })),
      }
      const next = [...p.keyframes]
      next.splice(insertAt, 0, newKf)
      // Shift birthFrames for players born at or after the insertion point,
      // mirroring how removeKeyframe shifts them down when a frame is deleted.
      const updatedPlayers = Object.fromEntries(
        Object.entries(p.players).map(([id, pl]) => [
          id,
          (pl.birthFrame ?? 0) >= insertAt ? { ...pl, birthFrame: (pl.birthFrame ?? 0) + 1 } : pl,
        ])
      )
      return { ...p, players: updatedPlayers, keyframes: next }
    })
    setActiveKeyframe(prev => prev + 1)
  }, [updatePage, activeKeyframe])

  const duplicateKeyframe = useCallback(() => {
    updatePage(p => {
      const kfIdx = Math.min(activeKeyframe, p.keyframes.length - 1)
      const insertAt = kfIdx + 1
      const srcKf = p.keyframes[kfIdx] || {}
      const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const newKf = {
        ...srcKf,
        _hiddenPlayerIds: [...(srcKf._hiddenPlayerIds ?? [])],
        _texts:         (srcKf._texts        ?? []).map(t  => ({ ...t,  id: uid(), textRoleTags: t.textRoleTags ? [...t.textRoleTags] : [] })),
        _arrows:        (srcKf._arrows       ?? []).map(a  => ({ ...a,  id: uid() })),
        _swirls:        (srcKf._swirls       ?? []).map(s  => ({ ...s,  id: uid() })),
        _markers:       (srcKf._markers      ?? []).map(m  => ({ ...m,  id: uid() })),
        _bosses:        (srcKf._bosses       ?? []).map(b  => ({ ...b })),
        _fieldEffects:  (srcKf._fieldEffects ?? []).map(fe => ({ ...fe })),
        _playerEffects: { ...(srcKf._playerEffects ?? {}) },
      }
      const next = [...p.keyframes]
      next.splice(insertAt, 0, newKf)
      // Shift birthFrames for players born at or after the insertion point.
      const updatedPlayers = Object.fromEntries(
        Object.entries(p.players).map(([id, pl]) => [
          id,
          (pl.birthFrame ?? 0) >= insertAt ? { ...pl, birthFrame: (pl.birthFrame ?? 0) + 1 } : pl,
        ])
      )
      return { ...p, players: updatedPlayers, keyframes: next }
    })
    setActiveKeyframe(prev => prev + 1)
  }, [updatePage, activeKeyframe])


  const removeKeyframe = useCallback((index) => {
    if (keyframes.length <= 1) return
    updatePage(p => {
      const newKeyframes = p.keyframes.filter((_, i) => i !== index)

      // Players whose birthFrame == index were born in this exact frame — remove them entirely.
      // Players born after the deleted frame need their birthFrame shifted down by 1.
      const toRemove = new Set(
        Object.entries(p.players)
          .filter(([, pl]) => (pl.birthFrame ?? 0) === index)
          .map(([id]) => id)
      )
      const updatedPlayers = Object.fromEntries(
        Object.entries(p.players)
          .filter(([id]) => !toRemove.has(id))
          .map(([id, pl]) => [
            id,
            (pl.birthFrame ?? 0) > index ? { ...pl, birthFrame: pl.birthFrame - 1 } : pl,
          ])
      )

      // Strip removed players from every remaining keyframe
      const cleanedKeyframes = newKeyframes.map(kf => {
        if (toRemove.size === 0) return kf
        const next = { ...kf }
        toRemove.forEach(id => { delete next[id] })
        next._hiddenPlayerIds = (kf._hiddenPlayerIds ?? []).filter(id => !toRemove.has(id))
        next._playerEffects   = Object.fromEntries(
          Object.entries(kf._playerEffects ?? {}).filter(([id]) => !toRemove.has(id))
        )
        return next
      })

      return { ...p, players: updatedPlayers, keyframes: cleanedKeyframes }
    })
    setActiveKeyframe(prev => {
      if (index < prev) return prev - 1
      if (index === prev) return Math.max(0, prev - 1)
      return prev
    })
  }, [updatePage, keyframes.length])

  const reorderKeyframes = useCallback((fromIdx, toIdx) => {
    if (fromIdx === toIdx) return
    updatePage(p => {
      const next = [...p.keyframes]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return { ...p, keyframes: next }
    })
    setActiveKeyframe(prev => {
      if (prev === fromIdx) return toIdx
      if (fromIdx < toIdx && prev > fromIdx && prev <= toIdx) return prev - 1
      if (fromIdx > toIdx && prev >= toIdx && prev < fromIdx) return prev + 1
      return prev
    })
  }, [updatePage])

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

  const updateArrow = useCallback((id, updates) => {
    updateKf(kf => ({ ...kf, _arrows: (kf._arrows ?? []).map(a => a.id === id ? { ...a, ...updates } : a) }))
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

  const addText = useCallback((x, y, preset = 'small') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const TEXT_PRESETS = {
      small:  { text: 'TEXT', color: '#ffffff', fontSize: 14, bold: true,  fontFamily: 'sans-serif',         bgStyle: 'charcoal', textHighlight: 'triangle', textHighlightColor: '#ffffff' },
      header: { text: 'TEXT', color: '#ffffff', fontSize: 49, bold: false, fontFamily: 'Impact, sans-serif', bgStyle: 'grey-bar' },
    }
    const base = TEXT_PRESETS[preset] ?? TEXT_PRESETS.small
    updateKf(kf => ({
      ...kf,
      _texts: [...(kf._texts ?? []), { id, x, y, ...base, italic: false, textAnim: 'none', persistent: false }],
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

  const applyTextSegmentColor = useCallback((id, start, end, color) => {
    updateKf(kf => ({
      ...kf,
      _texts: (kf._texts ?? []).map(t => {
        if (t.id !== id) return t
        const chars = (t.text || '').split('')
        if (!chars.length) return t
        // Build per-character color map from existing segments
        const colorMap = chars.map((_, i) => {
          if (!t.segments) return null
          let pos = 0
          for (const seg of t.segments) {
            if (i >= pos && i < pos + seg.text.length) return seg.color ?? null
            pos += seg.text.length
          }
          return null
        })
        // Apply new color to selected range
        for (let i = start; i < Math.min(end, chars.length); i++) colorMap[i] = color
        // Rebuild segments by grouping consecutive same-color chars
        const newSegs = []
        let curColor = colorMap[0], curText = chars[0]
        for (let i = 1; i < chars.length; i++) {
          if (colorMap[i] === curColor) { curText += chars[i] }
          else { newSegs.push({ text: curText, color: curColor }); curColor = colorMap[i]; curText = chars[i] }
        }
        newSegs.push({ text: curText, color: curColor })
        return { ...t, segments: newSegs }
      })
    }))
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
    // Beam config (rotation/speed/length) must be consistent across all keyframes so the
    // share view always starts at the correct angle — apply globally, not just to current kf.
    const isGlobal = 'rotation' in updates || 'rotateSpeed' in updates || 'beamLength' in updates
    if (isGlobal) {
      updatePage(p => ({
        ...p,
        keyframes: p.keyframes.map(kf => ({
          ...kf,
          _fieldEffects: (kf._fieldEffects ?? []).map(fe => fe.id === id ? { ...fe, ...updates } : fe),
        })),
      }))
    } else {
      updateKf(kf => ({ ...kf, _fieldEffects: (kf._fieldEffects ?? []).map(fe => fe.id === id ? { ...fe, ...updates } : fe) }))
    }
  }, [updateKf, updatePage])

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

  const updatePlayerRotation = useCallback((id, rotation) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], rotation } } }))
  }, [updatePage])

  const updatePlayerSpec = useCallback((id, specKey) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], specKey } } }))
  }, [updatePage])

  const updatePlayerClass = useCallback((id, classKey) => {
    const cls = WOW_CLASSES.find(c => c.key === classKey) ?? ROLE_ICONS.find(r => r.key === classKey)
    if (!cls) return
    updatePage(p => ({
      ...p,
      players: { ...p.players, [id]: { ...p.players[id], classKey, specKey: null, color: cls.color } },
      keyframes: p.keyframes.map(kf => {
        if (!kf._classOverrides?.[id]) return kf
        const next = { ...kf._classOverrides }
        delete next[id]
        return { ...kf, _classOverrides: Object.keys(next).length ? next : undefined }
      }),
    }))
  }, [updatePage])

  const setPlayerSwap = useCallback((playerA, playerB, fromFrame) => {
    updatePage(p => {
      const filtered = (p.swaps ?? []).filter(
        s => s.playerA !== playerA && s.playerB !== playerA &&
             s.playerA !== playerB && s.playerB !== playerB
      )
      return { ...p, swaps: [...filtered, { playerA, playerB, fromFrame }] }
    })
  }, [updatePage])

  const removePlayerSwap = useCallback((playerId) => {
    updatePage(p => ({
      ...p,
      swaps: (p.swaps ?? []).filter(s => s.playerA !== playerId && s.playerB !== playerId)
    }))
  }, [updatePage])

  const setSwapToFrame = useCallback((playerId, toFrame) => {
    updatePage(p => ({
      ...p,
      swaps: (p.swaps ?? []).map(s => {
        if (s.playerA !== playerId && s.playerB !== playerId) return s
        if (toFrame == null) {
          const { toFrame: _removed, ...rest } = s
          return rest
        }
        return { ...s, toFrame }
      })
    }))
  }, [updatePage])

  const setPlayerClassForFrames = useCallback((id, classKey, specKey, frameIndices) => {
    const cls = WOW_CLASSES.find(c => c.key === classKey)
             ?? ROLE_ICONS.find(r => r.key === classKey)
             ?? ENEMY_TYPES.find(e => e.key === classKey)
    if (!cls) return
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map((kf, i) => {
        if (!frameIndices.includes(i)) return kf
        return {
          ...kf,
          _classOverrides: { ...(kf._classOverrides ?? {}), [id]: { classKey, specKey: specKey ?? null } },
        }
      }),
    }))
  }, [updatePage])

  const clearPlayerClassOverride = useCallback((id, frameIndices) => {
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map((kf, i) => {
        if (!frameIndices.includes(i)) return kf
        if (!kf._classOverrides?.[id]) return kf
        const next = { ...kf._classOverrides }
        delete next[id]
        return { ...kf, _classOverrides: Object.keys(next).length ? next : undefined }
      }),
    }))
  }, [updatePage])

  const updatePlayerLabelStyle = useCallback((id, labelStyle) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], labelStyle } } }))
  }, [updatePage])

  const updateBossLabelStyle = useCallback((id, labelStyle) => {
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map(kf => ({
        ...kf,
        _bosses: (kf._bosses ?? []).map(b => b.id === id ? { ...b, labelStyle } : b)
      }))
    }))
  }, [updatePage])

  const updatePlayerLabelFont = useCallback((id, labelFont) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], labelFont } } }))
  }, [updatePage])

  const updateBossLabelFont = useCallback((id, labelFont) => {
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map(kf => ({
        ...kf,
        _bosses: (kf._bosses ?? []).map(b => b.id === id ? { ...b, labelFont } : b)
      }))
    }))
  }, [updatePage])

  const updatePlayerLabelColor = useCallback((id, labelColor) => {
    updatePage(p => ({ ...p, players: { ...p.players, [id]: { ...p.players[id], labelColor } } }))
  }, [updatePage])

  const updateBossLabelColor = useCallback((id, labelColor) => {
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map(kf => ({
        ...kf,
        _bosses: (kf._bosses ?? []).map(b => b.id === id ? { ...b, labelColor } : b)
      }))
    }))
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
              ...(item.rotation    ? { rotation: item.rotation }       : {}),
              ...(item.canvasLabel ? { canvasLabel: item.canvasLabel }  : {}),
              ...(item.labelStyle && item.labelStyle !== 'plain'  ? { labelStyle: item.labelStyle }  : {}),
              ...(item.labelFont  && item.labelFont  !== 'cinzel' ? { labelFont:  item.labelFont  }  : {}),
              ...(item.labelColor  ? { labelColor:  item.labelColor  } : {}),
              ...(item.effectStopped ? { effectStopped: item.effectStopped } : {}),
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
      pastePlayer(clipboard, x, y)
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
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      updateKf(kf => ({
        ...kf,
        _bosses: [...(kf._bosses ?? []), {
          id: newId, type: clipboard.bossType, x, y,
          ...(clipboard.scale && clipboard.scale !== 1    ? { scale: clipboard.scale }               : {}),
          ...(clipboard.rotation                          ? { rotation: clipboard.rotation }          : {}),
          ...(clipboard.canvasLabel                       ? { canvasLabel: clipboard.canvasLabel }    : {}),
          ...(clipboard.labelStyle && clipboard.labelStyle !== 'plain'  ? { labelStyle: clipboard.labelStyle }  : {}),
          ...(clipboard.labelFont  && clipboard.labelFont  !== 'cinzel' ? { labelFont:  clipboard.labelFont  }  : {}),
          ...(clipboard.labelColor                        ? { labelColor:  clipboard.labelColor  }   : {}),
          ...(clipboard.effect                            ? { effect: clipboard.effect }              : {}),
          ...(clipboard.effectStopped                     ? { effectStopped: clipboard.effectStopped }: {}),
        }],
      }))
    } else if (clipboard.type === 'fieldEffect') {
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      updateKf(kf => ({ ...kf, _fieldEffects: [...(kf._fieldEffects ?? []),
        { id: newId, effect: clipboard.effect, x, y,
          ...(clipboard.color != null ? { color: clipboard.color } : {}),
          ...(clipboard.scale != null && clipboard.scale !== 1 ? { scale: clipboard.scale } : {}) }] }))
    }
  }, [clipboard, pastePlayer, updateKf, addMarker, addBoss, addFieldEffect, safeIdx, activeKeyframe]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyFromContextMenu = useCallback((ctxInfo) => {
    if (ctxInfo.type === 'player') {
      setClipboard({
        type: 'player', classKey: ctxInfo.classKey, specKey: ctxInfo.specKey ?? null,
        name: ctxInfo.name ?? '', scale: ctxInfo.scale ?? 1, rotation: ctxInfo.rotation ?? 0,
        effect: ctxInfo.effect ?? null, effectStopped: ctxInfo.effectStopped ?? false,
        canvasLabel: ctxInfo.label ?? '',
        labelStyle: ctxInfo.labelStyle ?? 'plain', labelFont: ctxInfo.labelFont ?? 'cinzel',
        labelColor: ctxInfo.labelColor ?? null,
        x: ctxInfo.canvasX ?? CANVAS_W/2, y: ctxInfo.canvasY ?? CANVAS_H/2,
      })
    } else if (ctxInfo.type === 'text') {
      if (ctxInfo.textEl) setClipboard({ type: 'text', ...ctxInfo.textEl })
    } else if (ctxInfo.type === 'multi') {
      setClipboard({ type: 'multi', items: ctxInfo.items })
    } else if (ctxInfo.type === 'marker') {
      setClipboard({ type: 'marker', markerType: ctxInfo.markerType,
                     scale: ctxInfo.scale ?? 1,
                     x: ctxInfo.canvasX ?? CANVAS_W/2, y: ctxInfo.canvasY ?? CANVAS_H/2 })
    } else if (ctxInfo.type === 'boss') {
      setClipboard({
        type: 'boss', bossType: ctxInfo.bossType,
        scale: ctxInfo.scale ?? 1, rotation: ctxInfo.rotation ?? 0,
        effect: ctxInfo.effect ?? null, effectStopped: ctxInfo.effectStopped ?? false,
        canvasLabel: ctxInfo.label ?? '',
        labelStyle: ctxInfo.labelStyle ?? 'plain', labelFont: ctxInfo.labelFont ?? 'cinzel',
        labelColor: ctxInfo.labelColor ?? null,
        x: ctxInfo.canvasX ?? CANVAS_W/2, y: ctxInfo.canvasY ?? CANVAS_H/2,
      })
    } else if (ctxInfo.type === 'field-effect') {
      setClipboard({ type: 'fieldEffect', effect: ctxInfo.effect,
                     color: ctxInfo.color ?? null, scale: ctxInfo.scale ?? 1,
                     x: ctxInfo.canvasX ?? CANVAS_W/2, y: ctxInfo.canvasY ?? CANVAS_H/2 })
    }
  }, [])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        const prev = undoStackRef.current.pop()
        if (prev) {
          isUndoingRef.current = true
          setPages(prev)
        }
        return
      }

      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        // Hovered object takes priority over selection-based copy
        const hov = hoveredCanvasObjectRef.current
        if (hov) { copyFromContextMenu(hov); return }
        const kf = keyframes[activeKeyframe] ?? {}
        if (selectedIds.size > 1) {
          // Multi-copy: all selected players with their current effects
          const items = [...selectedIds].flatMap(id => {
            const p = players[id]
            if (!p) return []
            const pos    = kf[id] ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 }
            const effect = kf._playerEffects?.[id] ?? null
            return [{ objType: 'player', classKey: p.classKey, specKey: p.specKey ?? null,
                      name: p.name, scale: p.scale ?? 1, rotation: p.rotation ?? 0,
                      effect, effectStopped: p.effectStopped ?? false, color: p.color,
                      canvasLabel: p.canvasLabel ?? '',
                      labelStyle: p.labelStyle ?? 'plain', labelFont: p.labelFont ?? 'cinzel',
                      labelColor: p.labelColor ?? null,
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
          setClipboard({
            type: 'player', classKey: p.classKey, specKey: p.specKey ?? null,
            name: p.name, scale: p.scale ?? 1, rotation: p.rotation ?? 0,
            effect, effectStopped: p.effectStopped ?? false,
            canvasLabel: p.canvasLabel ?? '',
            labelStyle: p.labelStyle ?? 'plain', labelFont: p.labelFont ?? 'cinzel',
            labelColor: p.labelColor ?? null,
            x: pos.x, y: pos.y,
          })
        } else if (selectedTextId) {
          const t = texts.find(txt => txt.id === selectedTextId)
          if (t) setClipboard({ type: 'text', ...t })
        }
        return
      }

      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        if (!clipboard) return
        const { x, y } = canvasCursorRef.current
        pasteAt(x, y)
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
    const speed = playbackSpeed

    const playable = pagesRef.current
      .map((p, idx) => {
        if (p.keyframes.length < 2) return null
        const segMs = p.keyframes.slice(1).map(kf => Math.max(100, (kf._duration ?? 2000) / speed))
        const pageMs = segMs.reduce((s, d) => s + d, 0)
        return { pageIdx: idx, segMs, pageMs }
      })
      .filter(Boolean)

    if (playable.length === 0) { setIsPlaying(false); return }
    const totalMs = playable.reduce((s, e) => s + e.pageMs, 0)
    const startOffsetMs = playStartOffsetRef.current
    let startTime = null

    function tick(ts) {
      if (!startTime) startTime = ts - startOffsetMs / speed
      const elapsed = ts - startTime

      let rem = Math.min(elapsed, totalMs)
      let pageIdx = playable[playable.length - 1].pageIdx
      let localT  = pagesRef.current[pageIdx].keyframes.length - 1

      for (const entry of playable) {
        if (rem <= entry.pageMs) {
          pageIdx = entry.pageIdx
          let acc = 0
          localT = 0
          for (let s = 0; s < entry.segMs.length; s++) {
            if (rem <= acc + entry.segMs[s]) {
              localT = s + (rem - acc) / entry.segMs[s]
              break
            }
            acc += entry.segMs[s]
            localT = s + 1
          }
          break
        }
        rem -= entry.pageMs
      }

      setActivePageIdx(pageIdx)
      setPlayT(localT)
      if (elapsed < totalMs) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        setIsPlaying(false)
        setPlayT(0)
      }
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [isPlaying, playbackSpeed])

  const handlePlay = useCallback(() => {
    const hasAnything = pagesRef.current.some(p => p.keyframes.length >= 2)
    if (!hasAnything) return
    // Compute raw-ms offset up to the current page + frame so playback starts there
    let offsetMs = 0
    for (let pi = 0; pi < pagesRef.current.length; pi++) {
      const p = pagesRef.current[pi]
      if (pi === safeIdx) {
        if (p.keyframes.length >= 2) {
          for (let ki = 1; ki <= Math.min(activeKeyframe, p.keyframes.length - 1); ki++) {
            offsetMs += (p.keyframes[ki]._duration ?? 2000)
          }
        }
        break
      }
      if (p.keyframes.length >= 2) {
        for (let ki = 1; ki < p.keyframes.length; ki++) {
          offsetMs += (p.keyframes[ki]._duration ?? 2000)
        }
      }
    }
    playStartOffsetRef.current = offsetMs
    setIsPlaying(true)
  }, [safeIdx, activeKeyframe])

  const handleStop = useCallback(() => {
    setIsPlaying(false); setPlayT(0)
    if (animRef.current) cancelAnimationFrame(animRef.current)
  }, [])

  // Compress a single map image to JPEG at the lowest quality that fits budgetBytes.
  const compressOneMap = useCallback((dataUrl, budgetBytes) => {
    if (!dataUrl) return Promise.resolve(null)
    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        canvas.getContext('2d').drawImage(img, 0, 0)
        for (const q of [0.72, 0.50, 0.30]) {
          const result = canvas.toDataURL('image/jpeg', q)
          if (result.length * 0.75 < budgetBytes) { resolve(result); return }
        }
        resolve(null) // still too large — omit
      }
      img.onerror = () => resolve(null)
      img.src = dataUrl
    })
  }, [])

  // Compress the maps array so the total payload stays under ~900 KB.
  // Budget is split evenly across however many maps are present.
  const compressMaps = useCallback(async (mapsArr) => {
    if (!mapsArr || mapsArr.length === 0) return []
    const budgetPer = Math.floor(900_000 / mapsArr.length)
    const results = await Promise.all(mapsArr.map(m => compressOneMap(m.url, budgetPer)))
    return mapsArr
      .map((m, i) => results[i] ? { ...m, url: results[i] } : null)
      .filter(Boolean)
  }, [compressOneMap])

  const handleShare = useCallback(async () => {
    setShareLoading(true)
    try {
      const id           = Math.random().toString(36).slice(2, 8)
      const compMaps     = await compressMaps(maps)
      await setDoc(doc(db, 'plans', id), {
        pages: pagesRef.current,
        maps: compMaps,
        bgImage: compMaps[0]?.url ?? null,
        createdAt: new Date().toISOString(),
      })
      const url = `${window.location.origin}${window.location.pathname}#plan=${id}`
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    } catch (e) {
      console.error('Share failed:', e)
      try {
        const compMaps   = await compressMaps(maps)
        const compressed = compressToEncodedURIComponent(JSON.stringify({ pages: pagesRef.current, maps: compMaps, bgImage: compMaps[0]?.url ?? null }))
        const url = `${window.location.origin}${window.location.pathname}#view=${compressed}`
        await navigator.clipboard.writeText(url)
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2500)
      } catch {}
    } finally {
      setShareLoading(false)
    }
  }, [maps, compressMaps])

  const handleShareClip = useCallback(async (startFrame, endFrame) => {
    const clipKfs = page.keyframes.slice(startFrame, endFrame + 1)
    // Adjust birthFrames so players born before the clip start appear from frame 0
    const clipPlayers = Object.fromEntries(
      Object.entries(page.players).map(([id, p]) => [
        id,
        { ...p, birthFrame: Math.max(0, (p.birthFrame ?? 0) - startFrame) },
      ])
    )
    const clipPage = { ...page, players: clipPlayers, keyframes: clipKfs }
    try {
      const id       = Math.random().toString(36).slice(2, 8)
      const compMaps = await compressMaps(maps)
      await setDoc(doc(db, 'plans', id), {
        pages: [clipPage],
        maps: compMaps,
        bgImage: compMaps[0]?.url ?? null,
        createdAt: new Date().toISOString(),
      })
      await navigator.clipboard.writeText(
        `${window.location.origin}${window.location.pathname}#plan=${id}`
      )
    } catch {
      try {
        const compMaps   = await compressMaps(maps)
        const compressed = compressToEncodedURIComponent(
          JSON.stringify({ pages: [clipPage], maps: compMaps, bgImage: compMaps[0]?.url ?? null })
        )
        await navigator.clipboard.writeText(
          `${window.location.origin}${window.location.pathname}#view=${compressed}`
        )
      } catch {}
    }
  }, [page, maps, compressMaps])

  const duplicateToFrames = useCallback((type, id, targetFrames) => {
    if (!targetFrames.length) return
    updatePage(p => ({
      ...p,
      keyframes: p.keyframes.map((kf, i) => {
        if (!targetFrames.includes(i)) return kf

        if (type === 'player') {
          const srcKf     = p.keyframes[activeKeyframe] ?? {}
          const srcPos    = srcKf[id] ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 }
          const srcEffect = srcKf._playerEffects?.[id] ?? null
          const updated   = { ...kf, [id]: { ...srcPos } }
          if (srcEffect) updated._playerEffects = { ...(kf._playerEffects ?? {}), [id]: srcEffect }
          return updated
        }

        const listKey = type === 'boss'        ? '_bosses'
                      : type === 'text'        ? '_texts'
                      : type === 'marker'      ? '_markers'
                      : type === 'fieldEffect' ? '_fieldEffects'
                      : null
        if (!listKey) return kf

        const srcObj = (p.keyframes[activeKeyframe] ?? {})[listKey]?.find(o => o.id === id)
        if (!srcObj) return kf

        const list   = kf[listKey] ?? []
        const exists = list.some(o => o.id === id)
        return {
          ...kf,
          [listKey]: exists
            ? list.map(o => o.id === id ? { ...srcObj } : o)
            : [...list, { ...srcObj }],
        }
      }),
    }))
  }, [updatePage, activeKeyframe])

  const handleCopyToAllPages = useCallback((type, id) => {
    if (pages.length <= 1) return
    const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

    setPages(prev => prev.map((p, pi) => {
      if (pi === safeIdx) return p   // skip source page

      if (type === 'player') {
        const player = players[id]
        if (!player || p.players[id]) return p   // skip if missing or already there
        const pos = keyframes[activeKeyframe]?.[id] ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 }
        return {
          ...p,
          players:   { ...p.players, [id]: { ...player, birthFrame: 0 } },
          keyframes: p.keyframes.map(kf => ({ ...kf, [id]: pos })),
        }
      }

      if (type === 'boss') {
        const boss = currentKf._bosses?.find(b => b.id === id)
        if (!boss) return p
        const newId = uid()
        return { ...p, keyframes: p.keyframes.map(kf => ({ ...kf, _bosses: [...(kf._bosses ?? []), { ...boss, id: newId }] })) }
      }

      if (type === 'marker') {
        const marker = currentKf._markers?.find(m => m.id === id)
        if (!marker) return p
        const newId = uid()
        return { ...p, keyframes: p.keyframes.map(kf => ({ ...kf, _markers: [...(kf._markers ?? []), { ...marker, id: newId }] })) }
      }

      if (type === 'field-effect') {
        const fe = currentKf._fieldEffects?.find(f => f.id === id)
        if (!fe) return p
        const newId = uid()
        return { ...p, keyframes: p.keyframes.map(kf => ({ ...kf, _fieldEffects: [...(kf._fieldEffects ?? []), { ...fe, id: newId }] })) }
      }

      return p
    }))
  }, [pages.length, safeIdx, players, keyframes, activeKeyframe, currentKf])

  const handleExportAddon = useCallback(async () => {
    try {
      const str = exportForAddon(pagesRef.current)
      await navigator.clipboard.writeText(str)
      setAddonExportCopied(true)
      setTimeout(() => setAddonExportCopied(false), 2500)
    } catch (e) {
      console.error('Addon export failed:', e)
    }
  }, [])

  // ── Display positions ────────────────────────────────────────────────────────

  const swirlAngle = isPlaying ? (playT * 120) % 360 : 0
  const currentFrame = isPlaying ? Math.round(playT) : activeKeyframe

  const displayKf       = keyframes[Math.min(currentFrame, keyframes.length - 1)] ?? {}
  const hiddenPlayerIds = new Set(displayKf._hiddenPlayerIds ?? [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleTexts    = useMemo(() => (displayKf._texts ?? []).filter(t => !t.hidden), [displayKf._texts])
  const visibleArrows   = (displayKf._arrows  ?? []).filter(a  => !a.hidden)
  const visibleSwirls   = (displayKf._swirls  ?? []).filter(s  => !s.hidden)
  const visibleMarkers  = (displayKf._markers ?? []).filter(m  => !m.hidden)

  // Bosses and field effects interpolate position between keyframes during playback
  const playFI = isPlaying ? Math.min(Math.floor(playT), keyframes.length - 2) : currentFrame
  const playFT = isPlaying ? playT - playFI : 0
  const kfA = keyframes[playFI] ?? {}, kfB = keyframes[playFI + 1] ?? kfA
  const lerpAngle = (a, b, t) => {
    const diff = ((b - a) % 360 + 540) % 360 - 180
    return (a + diff * t + 360) % 360
  }
  const lerpItems = (listA, listB) => {
    const mapB = Object.fromEntries((listB ?? []).map(o => [o.id, o]))
    // Past the Math.round threshold, non-position props (effect, scale, color…) come from kfB.
    const useKfBProps = currentFrame > playFI
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
        x:        o.x + (oB.x - o.x) * playFT,
        y:        o.y + (oB.y - o.y) * playFT,
        // Skip rotation lerp for spinning beams — rotateSpeed drives all rotation
        rotation: (o.rotateSpeed ?? 0) !== 0 ? (o.rotation ?? 0) : lerpAngle(o.rotation ?? 0, oB.rotation ?? 0, playFT),
      }
    })
    if (useKfBProps) {
      const inA = new Set((listA ?? []).map(o => o.id))
      return [...fromA, ...(listB ?? []).filter(o => !o.hidden && !inA.has(o.id))]
    }
    return fromA
  }
  const visibleBosses       = isPlaying ? lerpItems(kfA._bosses,       kfB._bosses)       : (displayKf._bosses       ?? []).filter(b  => !b.hidden)
  const visibleFieldEffects = isPlaying ? lerpItems(kfA._fieldEffects, kfB._fieldEffects) : (displayKf._fieldEffects ?? []).filter(fe => !fe.hidden)

  const visiblePlayers = Object.fromEntries(
    Object.entries(players)
      .filter(([id, p]) => (p.birthFrame ?? 0) <= currentFrame && !hiddenPlayerIds.has(id))
      .map(([id, p]) => [id, {
        ...p,
        effect: displayKf._playerEffects?.[id] ?? null,
      }])
  )

  const pageSwaps = page.swaps ?? []

  function applySwaps(positions, activeSwaps) {
    if (!activeSwaps.length) return positions
    const out = { ...positions }
    for (const s of activeSwaps) {
      if (out[s.playerA] && out[s.playerB]) {
        const tmp = out[s.playerA]
        out[s.playerA] = out[s.playerB]
        out[s.playerB] = tmp
      }
    }
    return out
  }

  let displayPositions
  if (!isPlaying) {
    const raw = keyframes[activeKeyframe] || {}
    const active = pageSwaps.filter(s => s.fromFrame <= activeKeyframe && (s.toFrame == null || s.toFrame > activeKeyframe))
    displayPositions = applySwaps(raw, active)
  } else {
    const frameIndex = Math.min(Math.floor(playT), keyframes.length - 2)
    const frameB = keyframes[frameIndex + 1] || keyframes[frameIndex] || {}
    const t = frameB._snap ? 0 : (playT - frameIndex)
    const frameA = keyframes[frameIndex] || {}
    const swapsA = pageSwaps.filter(s => s.fromFrame <= frameIndex && (s.toFrame == null || s.toFrame > frameIndex))
    const swapsB = pageSwaps.filter(s => s.fromFrame <= frameIndex + 1 && (s.toFrame == null || s.toFrame > frameIndex + 1))
    const rawA = {}, rawB = {}
    Object.keys(visiblePlayers).forEach(id => {
      rawA[id] = frameA[id] || { x: CANVAS_W / 2, y: CANVAS_H / 2 }
      rawB[id] = frameB[id] || rawA[id]
    })
    const posA = applySwaps(rawA, swapsA)
    const posB = applySwaps(rawB, swapsB)
    displayPositions = {}
    Object.keys(visiblePlayers).forEach(id => {
      const a = posA[id], b = posB[id] || a
      displayPositions[id] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    })
  }

  const handleBgUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    // Reset the input so the same file can be re-uploaded if needed
    e.target.value = ''
    const name = file.name.replace(/\.[^.]+$/, '') || 'Map'
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new window.Image()
      img.onload = () => {
        // Scale-to-fill (cover): scale until the image covers the full canvas,
        // then crop the overflow from the centre so nothing is stretched.
        const scale  = Math.max(CANVAS_W / img.width, CANVAS_H / img.height)
        const sw     = Math.ceil(img.width  * scale)
        const sh     = Math.ceil(img.height * scale)
        const ox     = Math.floor((sw - CANVAS_W) / 2)
        const oy     = Math.floor((sh - CANVAS_H) / 2)
        const c      = document.createElement('canvas')
        c.width      = CANVAS_W
        c.height     = CANVAS_H
        c.getContext('2d').drawImage(img, -ox, -oy, sw, sh)
        const url = c.toDataURL('image/jpeg', 0.80)
        const id  = makeMapId()
        setMaps(prev => [...prev, { id, name, url }])
        // Assign this map to the current frame
        updateKf(kf => ({ ...kf, _mapId: id }))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  const setFrameMap = useCallback((mapId) => {
    updateKf(kf => {
      const next = { ...kf }
      if (mapId) next._mapId = mapId
      else delete next._mapId
      return next
    })
  }, [updateKf])

  const deleteMap = useCallback((mapId) => {
    setMaps(prev => prev.filter(m => m.id !== mapId))
    // Clear _mapId references to the deleted map from all pages
    setPages(prev => prev.map(p => ({
      ...p,
      keyframes: p.keyframes.map(kf => {
        if (kf._mapId !== mapId) return kf
        const next = { ...kf }
        delete next._mapId
        return next
      }),
    })))
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="app-header">
        <button className="plan-picker-trigger" onClick={() => setShowPlanPicker(true)}
          title="Switch or create plans">
          <span className="plan-picker-trigger-icon" style={{ color: bossConfig.color }}>⚔</span>
          <span className="plan-picker-trigger-name" style={{ color: bossConfig.color }}>{bossConfig.label}</span>
        </button>
        {clipboard && (
          <span className="clipboard-hint">
            📋 {clipboard.type === 'multi' ? `${clipboard.items.length} items` : clipboard.type} copied — Ctrl+V to paste
          </span>
        )}
        <div className="header-right-actions" style={{ position: 'relative' }}>
          <label className="btn-secondary upload-btn">
            + Map
            <input type="file" accept="image/*" onChange={handleBgUpload} style={{ display: 'none' }} />
          </label>
          {maps.length > 0 && (
            <>
              <select
                className="btn-secondary"
                style={{ padding: '2px 6px', cursor: 'pointer' }}
                value={keyframes[activeKeyframe]?._mapId ?? ''}
                onChange={e => setFrameMap(e.target.value || null)}
                title="Map shown on this frame"
              >
                <option value="">Inherit / carry forward</option>
                {maps.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button className="btn-secondary" onClick={() => setShowMapsPanel(v => !v)}>
                Manage Maps ({maps.length})
              </button>
            </>
          )}
          {showMapsPanel && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 999,
              background: '#1a1208', border: '1px solid #5a3e10', borderRadius: 6,
              padding: '10px 12px', minWidth: 260, boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#c8a227', fontSize: 13 }}>Maps</div>
              {maps.map((m, i) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <img src={m.url} alt="" style={{ width: 60, height: 34, objectFit: 'cover', borderRadius: 3, border: '1px solid #444', flexShrink: 0 }} />
                  <input
                    style={{ flex: 1, background: '#111', border: '1px solid #444', borderRadius: 3, color: '#ddd', padding: '2px 6px', fontSize: 12 }}
                    value={m.name}
                    onChange={e => setMaps(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  />
                  <button
                    className="btn-danger"
                    style={{ padding: '2px 7px', fontSize: 11 }}
                    onClick={() => deleteMap(m.id)}
                  >✕</button>
                </div>
              ))}
              {maps.length === 0 && <div style={{ color: '#888', fontSize: 12 }}>No maps uploaded yet.</div>}
              <button className="btn-secondary" style={{ marginTop: 6, width: '100%', fontSize: 12 }} onClick={() => setShowMapsPanel(false)}>Close</button>
            </div>
          )}
          <button
            className="btn-danger"
            onClick={() => {
              if (!window.confirm('Reset this plan to a blank slate?')) return
              setPages([blankPage('Phase 1')])
              resetCanvasState()
              setMaps([])
            }}
          >
            🗑 Reset
          </button>
        </div>
      </header>

      {showPlanPicker && (
        <PlanPicker
          plans={plansStore.plans}
          activePlanId={plansStore.activePlanId}
          onSwitch={switchPlan}
          onCreate={createPlan}
          onDelete={deletePlan}
          onClose={() => setShowPlanPicker(false)}
        />
      )}

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
          bossConfig={bossConfig}
          onAddPlayer={addPlayer}
          selectedId={selectedId} players={players}
          onRemovePlayer={removePlayer}
          onUpdateName={updatePlayerName}
          onSetEffect={setPlayerEffectStable}
          onToggleEffectStopped={toggleEffectStopped}
          selectedTextId={selectedTextId}
          texts={texts}
          onUpdateText={updateTextEl}
          onAddMarker={addMarker}
          onAddBoss={addBoss}
          onAddFieldEffect={addFieldEffect}
          arrowStyle={arrowStyle}
          onArrowStyleChange={(updates) => setArrowStyle(prev => ({ ...prev, ...updates }))}
          snapEnabled={snapEnabled} onToggleSnap={() => setSnapEnabled(v => !v)}
          notes={page.notes ?? {}} onUpdateNotes={updateNotes}
        />
        <main className="canvas-area">
          <RaidCanvas
            width={CANVAS_W} height={CANVAS_H}
            cursorPosRef={canvasCursorRef}
            players={visiblePlayers} positions={displayPositions}
            arrows={visibleArrows} swirls={visibleSwirls} swirlAngle={swirlAngle}
            texts={visibleTexts} markers={visibleMarkers} bosses={visibleBosses}
            fieldEffects={visibleFieldEffects}
            onAddFieldEffect={addFieldEffect}
            onMoveFieldEffect={moveFieldEffect}
            onRemoveFieldEffect={removeFieldEffect}
            onUpdateFieldEffect={updateFieldEffect}
            keyframes={keyframes} activeKeyframe={activeKeyframe}
            bgImage={bgImage} tool={tool} setTool={setTool}
            isPlaying={isPlaying} selectedId={selectedId}
            selectedTextId={selectedTextId} selectedIds={selectedIds}
            arrowStyle={arrowStyle}
            onArrowStyleChange={(updates) => setArrowStyle(prev => ({ ...prev, ...updates }))}
            snapEnabled={snapEnabled} onToggleSnap={() => setSnapEnabled(v => !v)}
            clipboard={clipboard}
            onCopyObject={copyFromContextMenu}
            onPasteAt={pasteAt}
            onObjectHover={obj => { hoveredCanvasObjectRef.current = obj }}
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
            onUpdateArrow={updateArrow}
            onMoveSwirl={moveSwirl}
            onRemoveSwirl={removeSwirl}
            onUpdateText={updateTextEl}
            onApplyTextSegmentColor={applyTextSegmentColor}
            onMoveText={moveText}
            onRemoveText={removeText}
            onMoveMarker={moveMarker}
            onRemoveMarker={removeMarker}
            onAddBoss={addBoss}
            onMoveBoss={moveBoss}
            onRemoveBoss={removeBoss}
            onUpdatePlayerScale={updatePlayerScale}
            onUpdatePlayerRotation={updatePlayerRotation}
            onSetPlayerEffect={setPlayerEffectStable}
            onUpdatePlayerSpec={updatePlayerSpec}
            onUpdatePlayerClass={updatePlayerClass}
            onUpdatePlayerLabelStyle={updatePlayerLabelStyle}
            onUpdateBossLabelStyle={updateBossLabelStyle}
            onUpdatePlayerLabelColor={updatePlayerLabelColor}
            onUpdateBossLabelColor={updateBossLabelColor}
            onUpdatePlayerLabelFont={updatePlayerLabelFont}
            onUpdateBossLabelFont={updateBossLabelFont}
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
            onToggleEffectStopped={toggleEffectStopped}
            onSetBossEffect={setBossEffectStable}
            onToggleBossEffectStopped={toggleBossEffectStopped}
            onHideInFrame={hideInFrame}
            onCopyToAllPages={handleCopyToAllPages}
            onDuplicateToFrames={duplicateToFrames}
            swaps={pageSwaps}
            onSetPlayerSwap={setPlayerSwap}
            onRemovePlayerSwap={removePlayerSwap}
            onSetSwapToFrame={setSwapToFrame}
            onSetPlayerClassForFrames={setPlayerClassForFrames}
            onClearPlayerClassOverride={clearPlayerClassOverride}
            pageCount={pages.length}
          />
          {page.mode === 'sequence' ? (
            <Timeline
              keyframes={keyframes}
              activeKeyframe={activeKeyframe}
              onSelectKeyframe={setActiveKeyframe}
              onAddKeyframe={addKeyframe}
              onDuplicateKeyframe={duplicateKeyframe}
              onRemoveKeyframe={removeKeyframe}
              onReorderKeyframes={reorderKeyframes}
              isPlaying={isPlaying} playT={playT}
              onPlay={handlePlay} onStop={handleStop}
              onShare={handleShare} shareCopied={shareCopied} shareLoading={shareLoading}
              onExportAddon={handleExportAddon} addonExportCopied={addonExportCopied}
              onSwitchToDiagram={() => updatePageMode('diagram')}
              onUpdateDuration={updateFrameDuration}
              onToggleSnapFrame={toggleKeyframeSnap}
              playbackSpeed={playbackSpeed} onSetPlaybackSpeed={setPlaybackSpeed}
              onShareClip={handleShareClip}
            />
          ) : (
            <div className="diagram-mode-bar">
              <span className="diagram-mode-label">📷 Diagram</span>
              <span className="diagram-mode-hint">Single frame · token effects still animate</span>
              <div className="diagram-mode-actions">
                {keyframes.length > 1 && (
                  <span className="diagram-hidden-steps">
                    {keyframes.length - 1} step{keyframes.length > 2 ? 's' : ''} saved
                  </span>
                )}
                <button className="btn-secondary" onClick={handleShare} disabled={shareLoading}>
                  {shareLoading ? 'Saving…' : shareCopied ? '✓ Copied!' : '🔗 Share'}
                </button>
                <button className="btn-secondary" onClick={handleExportAddon}>
                  {addonExportCopied ? '✓ Copied!' : '🎮 Addon Export'}
                </button>
                <button className="btn-record" onClick={enterSequenceMode}>▶ Animate</button>
              </div>
            </div>
          )}
        </main>

        <aside className="private-notepad">
          <div className="private-notepad-header">
            <span>My Notes</span>
            <span className="private-badge">Private</span>
          </div>
          <textarea
            className="private-notepad-textarea"
            value={privateNote}
            onChange={e => handlePrivateNote(e.target.value)}
            placeholder={"Personal notes — only visible in the editor, never shared…"}
            spellCheck={false}
            style={{ fontFamily: "'Spectral', serif" }}
          />
        </aside>
      </div>
    </div>
  )
}
