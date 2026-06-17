import { useRef } from 'react'
import { WOW_CLASSES, ROLE_ICONS, ENEMY_TYPES } from '../data/classes'
import { EFFECT_GROUPS } from '../data/effects'
import { WORLD_MARKERS } from '../data/markers'
import { TEXT_ANIMS } from '../data/textEffects'
import { BOSS_CONFIGS } from '../data/bossConfigs'

function startDrag(e, classKey, specKey) {
  const imgEl = e.currentTarget.querySelector('img')
  if (imgEl) e.dataTransfer.setDragImage(imgEl, 16, 16)
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'player', classKey, specKey: specKey ?? null }))
}

function startDragMarker(e, key) {
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'marker', key }))
}

const TEXT_COLORS  = ['#ffffff', '#ffdd44', '#ff4444', '#44ddff', '#44ff88', '#ff88ff', '#ff8844', '#aaaaaa', '#C79C6E']
const ARROW_COLORS = [
  '#ffffff', '#dddddd', '#aaaaaa', '#666666',
  '#fff0a0', '#ffdd44', '#ffaa22', '#ff7700',
  '#ff4444', '#ff1166', '#ff44ff', '#cc44ff',
  '#8844ff', '#4466ff', '#44aaff', '#44ddff',
  '#44ff88', '#88ff44', '#00cc44', '#44bb00',
  '#C79C6E',
]

const FONT_OPTIONS = [
  { key: 'default', label: 'Default', family: 'sans-serif' },
  { key: 'impact',  label: 'Impact',  family: 'Impact, sans-serif' },
]

const NOTE_ROLES = [
  { key: 'tank',   label: 'Tank',   color: '#3a7ee0' },
  { key: 'healer', label: 'Healer', color: '#22b872' },
  { key: 'dps',    label: 'DPS',    color: '#cc3333' },
]

function PhaseNotes({ notes, onUpdateNotes }) {
  const taRefs = useRef({})

  const insertBullet = (key) => {
    const ta = taRefs.current[key]
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const val   = ta.value
    const insert = start === 0 || val[start - 1] === '\n' ? '• ' : '\n• '
    const newVal = val.slice(0, start) + insert + val.slice(end)
    onUpdateNotes?.(key, newVal)
    const newPos = start + insert.length
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(newPos, newPos) })
  }

  return NOTE_ROLES.map(({ key, label, color }) => (
    <div key={key} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <button
          onClick={() => insertBullet(key)}
          title="Insert bullet point"
          style={{
            background: 'none', border: `1px solid ${color}55`, borderRadius: 3,
            color, cursor: 'pointer', fontSize: 11, lineHeight: 1,
            padding: '1px 5px', opacity: 0.85,
          }}
        >• insert</button>
      </div>
      <textarea
        ref={el => taRefs.current[key] = el}
        value={notes?.[key] ?? ''}
        onChange={e => onUpdateNotes?.(key, e.target.value)}
        placeholder={`${label} notes…`}
        rows={6}
        style={{
          width: '100%', resize: 'vertical',
          background: '#111', color: '#ccc',
          border: '1px solid #2a2a3a', borderRadius: 3,
          padding: '6px 8px', fontSize: 11,
          fontFamily: 'inherit', outline: 'none',
          lineHeight: 1.5, boxSizing: 'border-box',
        }}
      />
    </div>
  ))
}

const GATEWAY_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -80 128 148" width="128" height="148">
  <defs>
    <radialGradient id="pg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#6a0ab8" stop-opacity="0.95"/>
      <stop offset="50%" stop-color="#3a006e" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#0f0028" stop-opacity="0.98"/>
    </radialGradient>
  </defs>
  <circle r="35" fill="url(#pg)"/>
  <path d="M-28,-18 Q0,-38 28,-18 Q0,2 -28,-18Z" fill="rgba(170,60,255,0.45)"/>
  <path d="M-20,12 Q0,-8 20,12 Q0,32 -20,12Z" fill="rgba(130,20,210,0.35)"/>
  <circle r="35" fill="none" stroke="#7a1acc" stroke-width="2.5" opacity="0.9"/>
  <circle r="42" fill="none" stroke="#1a0a28" stroke-width="14"/>
  <circle r="42" fill="none" stroke="#2c1848" stroke-width="1.2" opacity="0.7"/>
  <circle r="50" fill="none" stroke="#3a2255" stroke-width="1" opacity="0.5"/>
  ${Array.from({length:14},(_,i)=>{const a=(i/14)*Math.PI*2-Math.PI/2;const x=Math.cos(a)*42;const y=Math.sin(a)*42;return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#8c1adf" opacity="0.85"/>`}).join('')}
  <line x1="-5" y1="-51" x2="-19" y2="-73" stroke="#1e1030" stroke-width="8" stroke-linecap="round"/>
  <line x1="5" y1="-51" x2="19" y2="-73" stroke="#1e1030" stroke-width="8" stroke-linecap="round"/>
  <ellipse cx="0" cy="-51" rx="11" ry="9" fill="#120a1e" stroke="#381255" stroke-width="1.5"/>
  <circle cx="-4" cy="-53" r="2.5" fill="#9b1aeb" opacity="0.9"/>
  <circle cx="4" cy="-53" r="2.5" fill="#9b1aeb" opacity="0.9"/>
  <rect x="-61" y="50" width="122" height="9" rx="2" fill="#0e0818" stroke="#2e1848" stroke-width="1"/>
  <rect x="-55" y="59" width="110" height="6" rx="2" fill="#0a0612" stroke="#241235" stroke-width="1"/>
  <rect x="-61" y="34" width="16" height="16" rx="1" fill="#0e0818" stroke="#2e1848" stroke-width="1"/>
  <rect x="45" y="34" width="16" height="16" rx="1" fill="#0e0818" stroke="#2e1848" stroke-width="1"/>
</svg>`)}`

const TOTEM_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -30 60 65" width="60" height="65">
  <!-- post -->
  <rect x="-7" y="-22" width="14" height="52" fill="#c09850" rx="1"/>
  <rect x="-5" y="-22" width="3" height="52" fill="#e0c080" opacity="0.4"/>
  <!-- blue band -->
  <rect x="-9" y="-5" width="18" height="8" rx="1" fill="#3296ff" opacity="0.90"/>
  <!-- wings -->
  <polygon points="-7,-12 -27,-10 -23,4 -7,6" fill="#a87030"/>
  <polygon points="7,-12 27,-10 23,4 7,6" fill="#a87030"/>
</svg>`)}`

const BANNER_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -80 90 128" width="90" height="128">
  <line x1="0" y1="-60" x2="0" y2="38" stroke="#502e0e" stroke-width="6" stroke-linecap="round"/>
  <polygon points="0,-80 -5,-67 5,-67" fill="#9a8a76" stroke="#504030" stroke-width="1"/>
  <line x1="-1" y1="-60" x2="43" y2="-60" stroke="#462a0c" stroke-width="5" stroke-linecap="round"/>
  <polygon points="2,-58 44,-56 44,-4 2,-4" fill="#af0e0e" stroke="#640505" stroke-width="1"/>
  <polygon points="23,-44 25,-39 27,-36 29,-39 33,-43 34,-40 31,-33 35,-30.5 33,-27 32,-23 36,-20 33,-14 31,-12 26,-16.5 23,-15 20,-16.5 15,-12 13,-14 10,-20 14,-23 13,-27 11,-30.5 15,-33 12,-40 13,-43 17,-39 19,-36 21,-39" fill="#100303"/>
  <rect x="-4" y="-47" width="8" height="6" rx="1" fill="#5f5850" stroke="#9a8e7a" stroke-width="0.8"/>
  <rect x="-4" y="-23" width="8" height="6" rx="1" fill="#5f5850" stroke="#9a8e7a" stroke-width="0.8"/>
  <rect x="-4" y="5" width="8" height="6" rx="1" fill="#5f5850" stroke="#9a8e7a" stroke-width="0.8"/>
  <rect x="-4" y="30" width="8" height="6" rx="1" fill="#5f5850" stroke="#9a8e7a" stroke-width="0.8"/>
</svg>`)}`

const GAME_OBJECTS = [
  { key: 'warlock_gateway', label: 'Gateway', color: '#aa33ff', img: GATEWAY_SVG },
  { key: 'horde_banner',    label: 'Banner',  color: '#cc2222', img: BANNER_SVG  },
  { key: 'totem',           label: 'Totem',   color: '#4aa0ff', img: TOTEM_SVG   },
]

export default function Sidebar({
  tool, setTool, bossConfig, onAddPlayer, selectedId, players,
  onRemovePlayer, onUpdateName, onSetEffect, onToggleEffectStopped,
  selectedTextId, texts, onUpdateText,
  onAddMarker, onAddBoss, onAddFieldEffect,
  arrowStyle, onArrowStyleChange,
  snapEnabled, onToggleSnap,
  notes, onUpdateNotes,
}) {
  const selectedPlayer = selectedId ? players[selectedId] : null
  const selectedText   = selectedTextId ? texts?.find(t => t.id === selectedTextId) : null
  const selectedClass  = selectedPlayer ? WOW_CLASSES.find(c => c.key === selectedPlayer.classKey) : null
  const selectedSpec   = selectedPlayer?.specKey
    ? selectedClass?.specs.find(s => s.key === selectedPlayer.specKey) : null


  return (
    <aside className="sidebar">

      {/* ── Snap toggle ── */}
      <div className="sidebar-section">
        <button
          className={`snap-btn ${snapEnabled ? 'snap-on' : 'snap-off'}`}
          onClick={onToggleSnap}
          title="Toggle alignment snapping (S key)"
        >
          <span className="snap-icon">⊕</span>
          <span className="snap-text">Snap</span>
          <span className="snap-pill">{snapEnabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* ── Arrow Style (shown when arrow tool active) ── */}
      {tool === 'arrow' && (
        <div className="sidebar-section">
          <h3>Arrow Style</h3>
          <p className="effect-picker-label">Color</p>
          <div className="text-color-row">
            {ARROW_COLORS.map(c => (
              <button key={c}
                className={`text-color-swatch ${arrowStyle.color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => onArrowStyleChange({ color: c })}
                title={c}
              />
            ))}
          </div>
          <p className="effect-picker-label">Width</p>
          <div className="arrow-style-row">
            {[['Thin', 1.5], ['Normal', 2.5], ['Thick', 4.5]].map(([label, w]) => (
              <button key={label}
                className={`arrow-style-btn ${arrowStyle.strokeWidth === w ? 'active' : ''}`}
                onClick={() => onArrowStyleChange({ strokeWidth: w })}
              >{label}</button>
            ))}
          </div>
          <p className="effect-picker-label">Line</p>
          <div className="arrow-style-row">
            <button
              className={`arrow-style-btn ${!arrowStyle.dash ? 'active' : ''}`}
              onClick={() => onArrowStyleChange({ dash: false })}
            >Solid</button>
            <button
              className={`arrow-style-btn ${arrowStyle.dash ? 'active' : ''}`}
              onClick={() => onArrowStyleChange({ dash: true })}
            >Dashed</button>
          </div>
          <p className="effect-picker-label">Heads</p>
          <div className="arrow-style-row">
            <button
              className={`arrow-style-btn ${!arrowStyle.twoHeaded ? 'active' : ''}`}
              onClick={() => onArrowStyleChange({ twoHeaded: false })}
            >→ One</button>
            <button
              className={`arrow-style-btn ${arrowStyle.twoHeaded ? 'active' : ''}`}
              onClick={() => onArrowStyleChange({ twoHeaded: true })}
            >↔ Two</button>
          </div>
        </div>
      )}

      {/* ── Generic Roles ── */}
      <div className="sidebar-section">
        <div className="role-row">
          {ROLE_ICONS.map(role => (
            <div key={role.key} className="role-item" draggable
              onDragStart={e => startDrag(e, role.key, null)}
              onClick={() => onAddPlayer(role.key, null)}
              title={role.label}
            >
              <div className="role-icon-wrap" style={{ borderColor: role.color, background: '#111' }}>
                <img src={role.icon} alt={role.label} draggable={false} className="class-icon-img" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Enemies (boss-specific) ── */}
      <div className="sidebar-section">
        <div className="enemy-row">
          {(bossConfig?.enemyTypeKeys ?? []).map(key => {
            const enemy = ENEMY_TYPES.find(e => e.key === key)
            if (!enemy) return null
            return (
              <div key={enemy.key} className="enemy-item" draggable
                onDragStart={e => startDrag(e, enemy.key, null)}
                onClick={() => onAddPlayer(enemy.key, null)}
                title={enemy.label}
              >
                <div className="enemy-icon-wrap" style={{ borderColor: enemy.color }}>
                  <img src={enemy.icon} alt={enemy.label} draggable={false} className="class-icon-img" />
                </div>
              </div>
            )
          })}
          {(bossConfig?.bossSidebarItems ?? []).map(bp => (
            <div key={bp.bossType} className="enemy-item boss-sidebar-item" draggable
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'boss', bossType: bp.bossType }))
              }}
              onClick={() => onAddBoss(bp.bossType)}
              title={bp.label}
            >
              <div className="enemy-icon-wrap" style={{
                borderColor: bp.color,
                borderWidth: 2,
                background: '#1a1a1a',
                overflow: 'hidden',
                padding: 0,
                borderRadius: bp.circular ? '50%' : undefined,
                boxShadow: `0 0 6px 1px ${bp.color}66, inset 0 0 8px rgba(0,0,0,0.4)`,
              }}>
                <img src={bp.img} alt={bp.label} draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', filter: 'brightness(1.15) contrast(1.05)' }} />
              </div>
              <span className="boss-sidebar-label" style={{ color: bp.color }}>{bp.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Game Objects (always visible) ── */}
      <div className="sidebar-section">
        <div className="enemy-row">
          {GAME_OBJECTS.map(obj => (
            <div key={obj.key} className="enemy-item boss-sidebar-item" draggable
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'field-effect', effect: obj.key }))
              }}
              onClick={() => onAddFieldEffect?.(obj.key)}
              title={obj.label}
            >
              <div className="enemy-icon-wrap" style={{
                borderColor: obj.color,
                borderWidth: 2,
                background: '#0c0018',
                overflow: 'hidden',
                padding: 0,
                boxShadow: `0 0 6px 1px ${obj.color}66`,
              }}>
                <img src={obj.img} alt={obj.label} draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              </div>
              <span className="boss-sidebar-label" style={{ color: obj.color }}>{obj.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── World Markers ── */}
      <div className="sidebar-section">
        <div className="marker-grid">
          {WORLD_MARKERS.map(m => (
            <div key={m.key} className="marker-btn" draggable
              onDragStart={e => startDragMarker(e, m.key)}
              onClick={() => onAddMarker(m.key)}
              title={m.label}
            >
              <img src={m.icon} alt={m.label} draggable={false} className="marker-icon-img" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Class Icons ── */}
      <div className="sidebar-section">
        <div className="class-list">
          {WOW_CLASSES.map(cls => (
            <div key={cls.key} className="class-group">
              <div className="class-row" draggable
                onDragStart={e => startDrag(e, cls.key, null)}
                onClick={() => onAddPlayer(cls.key, null)}
                title={`Add ${cls.label}`}
                style={{ borderLeft: `3px solid ${cls.color}` }}
              >
                <div className="class-row-bar" style={{ background: `${cls.color}18` }} />
                <div className="icon-wrap" style={{ borderColor: cls.color, background: `${cls.color}30`, width: 30, height: 30, flexShrink: 0, position: 'relative', zIndex: 1 }}>
                  <img src={cls.icon} alt={cls.label} draggable={false} className="class-icon-img" />
                </div>
                <span className="class-row-name" style={{ color: cls.color }}>{cls.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Selected player ── */}
      {selectedPlayer && (
        <div className="sidebar-section selected-section">
          <h3>Selected Player</h3>
          <div className="selected-row">
            <div className="icon-wrap small" style={{ borderColor: selectedClass?.color }}>
              <img src={selectedSpec?.icon ?? selectedClass?.icon} alt="" className="class-icon-img" />
            </div>
            <input
              value={selectedPlayer.name}
              onChange={e => onUpdateName(selectedPlayer.id, e.target.value)}
              className="name-input" placeholder="Player name"
            />
          </div>

          <p className="effect-picker-label">Animation Effect</p>
          {EFFECT_GROUPS.map(group => (
            <div key={group.label}>
              <p className="effect-group-label">{group.label}</p>
              <div className="effect-grid">
                {group.effects.map(eff => (
                  <button
                    key={eff.key}
                    className={`effect-btn ${selectedPlayer.effect === eff.key ? 'active' : ''}`}
                    onClick={() => onSetEffect(selectedPlayer.id, selectedPlayer.effect === eff.key ? null : eff.key)}
                    title={eff.desc}
                  >
                    <span className="effect-emoji">{eff.emoji}</span>
                    <span className="effect-label-text">{eff.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {selectedPlayer.effect && (
            <button
              className={`persist-btn ${selectedPlayer.effectStopped ? 'active' : ''}`}
              style={{ marginTop: 6 }}
              onClick={() => onToggleEffectStopped(selectedPlayer.id)}
              title="Freeze the effect at its starting frame — no animation"
            >
              {selectedPlayer.effectStopped ? '▶ Animate' : '⏸ Freeze Effect'}
            </button>
          )}

          <button className="btn-danger" style={{ marginTop: 6 }} onClick={() => onRemovePlayer(selectedPlayer.id)}>
            Remove Player
          </button>
        </div>
      )}


      {/* ── Notepad ── */}
      <div className="sidebar-section">
        <h3>Notepad</h3>
        <PhaseNotes notes={notes} onUpdateNotes={onUpdateNotes} />
      </div>

      <div className="sidebar-footer">
        <p>Players: {Object.keys(players).length}</p>
        <p className="hint">Middle-click or Delete to remove</p>
      </div>
    </aside>
  )
}
