const STRIP_KEYS = new Set(['_swirls', '_fieldEffects', '_bosses', '_playerEffects'])

export function exportForAddon(pages) {
  const stripped = pages.map(page => ({
    title: page.title ?? '',
    notes: page.notes ?? {},
    players: Object.fromEntries(
      Object.entries(page.players ?? {}).map(([id, p]) => [id, {
        classKey: p.classKey,
        specKey:  p.specKey ?? null,
        name:     p.name ?? '',
        scale:    p.scale ?? 1,
        color:    p.color ?? '#ffffff',
        birthFrame: p.birthFrame ?? 0,
      }])
    ),
    keyframes: (page.keyframes ?? []).map(kf => {
      const out = {}
      for (const [k, v] of Object.entries(kf)) {
        if (!STRIP_KEYS.has(k)) out[k] = v
      }
      return out
    }),
  }))

  const payload = { v: 1, cw: 1024, ch: 584, pages: stripped }
  const json    = JSON.stringify(payload)

  // UTF-8 safe base64
  const bytes = new TextEncoder().encode(json)
  let binary  = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
