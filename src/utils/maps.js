let _nextId = 1
export function makeMapId() { return `map-${Date.now()}-${_nextId++}` }

// Migrate a plan object into the maps-array format.
// Works whether the plan is new (has maps[]), legacy (has bgImage only), or empty.
export function normalizeMaps(plan) {
  if (Array.isArray(plan?.maps) && plan.maps.length > 0) return plan.maps
  if (plan?.bgImage) return [{ id: makeMapId(), name: 'Map 1', url: plan.bgImage }]
  return []
}

// Carry-forward: walk backward from kfIdx to find the nearest keyframe with a _mapId
// that still exists in the maps array. Falls back to maps[0] (the plan default).
export function resolveMapUrl(maps, keyframes, kfIdx) {
  if (!maps || maps.length === 0) return null
  const idx = Math.min(kfIdx, (keyframes?.length ?? 1) - 1)
  for (let i = idx; i >= 0; i--) {
    const mid = keyframes[i]?._mapId
    if (mid) {
      const found = maps.find(m => m.id === mid)
      if (found) return found.url
    }
  }
  return maps[0]?.url ?? null
}
