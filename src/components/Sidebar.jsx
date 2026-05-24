import { WOW_CLASSES, ROLE_ICONS, ENEMY_TYPES } from '../data/classes'
import { EFFECTS } from '../data/effects'
import { WORLD_MARKERS } from '../data/markers'

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

const TEXT_COLORS  = ['#ffffff', '#ffdd44', '#ff4444', '#44ddff', '#44ff88', '#ff88ff', '#ff8844', '#aaaaaa']
const ARROW_COLORS = ['#ff4444', '#ffdd44', '#44ddff', '#44ff88', '#ffffff', '#ff88ff', '#ff8844', '#aaaaaa']

const FONT_OPTIONS = [
  { key: 'default', label: 'Default', family: 'sans-serif' },
  { key: 'impact',  label: 'Impact',  family: 'Impact, sans-serif' },
]

const IMMERSEUS_ENTRY = { key: 'immerseus', label: 'Immerseus', color: '#3399ff', isEnemy: true, specs: [] }

export default function Sidebar({
  tool, setTool, onAddPlayer, selectedId, players,
  onRemovePlayer, onUpdateName, onSetEffect,
  selectedTextId, texts, onUpdateText,
  onAddMarker, onAddBoss,
  arrowStyle, onArrowStyleChange,
}) {
  const selectedPlayer = selectedId ? players[selectedId] : null
  const selectedText   = selectedTextId ? texts?.find(t => t.id === selectedTextId) : null
  const selectedClass  = selectedPlayer ? WOW_CLASSES.find(c => c.key === selectedPlayer.classKey) : null
  const selectedSpec   = selectedPlayer?.specKey
    ? selectedClass?.specs.find(s => s.key === selectedPlayer.specKey) : null

  const allEnemies = [
    ...ENEMY_TYPES,
    {
      ...IMMERSEUS_ENTRY,
      icon: undefined,
      draggable: true,
    },
  ]

  return (
    <aside className="sidebar">

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

      {/* ── Enemies ── */}
      <div className="sidebar-section">
        <div className="enemy-row">
          {ENEMY_TYPES.map(enemy => (
            <div key={enemy.key} className="enemy-item" draggable
              onDragStart={e => startDrag(e, enemy.key, null)}
              onClick={() => onAddPlayer(enemy.key, null)}
              title={enemy.label}
            >
              <div className="enemy-icon-wrap" style={{ borderColor: enemy.color }}>
                <img src={enemy.icon} alt={enemy.label} draggable={false} className="class-icon-img" />
              </div>
            </div>
          ))}
          {/* Immerseus */}
          <div className="enemy-item" draggable
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'copy'
              e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'boss', bossType: 'immerseus' }))
            }}
            onClick={() => onAddBoss('immerseus')}
            title="Immerseus"
          >
            <div className="enemy-icon-wrap" style={{ borderColor: '#3399ff', background: '#040c18' }}>
              <span style={{ fontSize: 18, lineHeight: '32px', display: 'block', textAlign: 'center' }}>◉</span>
            </div>
          </div>
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
              >
                <div className="icon-wrap" style={{ borderColor: cls.color, width: 42, height: 42 }}>
                  <img src={cls.icon} alt={cls.label} draggable={false} className="class-icon-img" />
                </div>
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
          <div className="effect-grid">
            {EFFECTS.map(eff => (
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

          <button className="btn-danger" style={{ marginTop: 6 }} onClick={() => onRemovePlayer(selectedPlayer.id)}>
            Remove Player
          </button>
        </div>
      )}

      {/* ── Selected text ── */}
      {selectedText && (
        <div className="sidebar-section selected-section">
          <h3>Selected Text</h3>

          <textarea
            className="text-content-input"
            value={selectedText.text}
            onChange={e => onUpdateText(selectedText.id, { text: e.target.value })}
            rows={2}
            placeholder="Enter text…"
          />

          <button
            className={`persist-btn ${selectedText.persistent ? 'active' : ''}`}
            onClick={() => onUpdateText(selectedText.id, { persistent: !selectedText.persistent })}
            title="When on, this text carries over to every new blank frame"
          >
            📌 {selectedText.persistent ? 'Persists to new frames' : 'Frame only'}
          </button>

          <div className="text-controls-row">
            <label className="text-ctrl-label">Size</label>
            <input
              type="number"
              className="text-size-input"
              value={selectedText.fontSize}
              min={8} max={96}
              onChange={e => onUpdateText(selectedText.id, { fontSize: Number(e.target.value) })}
            />
            <button
              className={`text-style-btn ${selectedText.bold ? 'active' : ''}`}
              onClick={() => onUpdateText(selectedText.id, { bold: !selectedText.bold })}
              title="Bold"
            ><b>B</b></button>
          </div>

          <p className="effect-picker-label">Font</p>
          <div className="text-font-row">
            {FONT_OPTIONS.map(f => (
              <button
                key={f.key}
                className={`text-font-btn ${(selectedText.fontFamily ?? 'sans-serif') === f.family ? 'active' : ''}`}
                style={{ fontFamily: f.family }}
                onClick={() => onUpdateText(selectedText.id, { fontFamily: f.family })}
                title={f.label}
              >{f.label}</button>
            ))}
          </div>

          <p className="effect-picker-label">Color</p>
          <div className="text-color-row">
            {TEXT_COLORS.map(c => (
              <button
                key={c}
                className={`text-color-swatch ${selectedText.color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => onUpdateText(selectedText.id, { color: c })}
                title={c}
              />
            ))}
          </div>

          <p className="effect-picker-label">Background</p>
          <div className="text-bg-grid">
            {[
              { key: 'none',         label: 'None',      preview: '—'  },
              { key: 'rounded',      label: 'Round',     preview: '▣'  },
              { key: 'black',        label: 'Black',     preview: '■'  },
              { key: 'charcoal',     label: 'Charcoal',  preview: '■'  },
              { key: 'dark-grey',    label: 'D.Grey',    preview: '■'  },
              { key: 'matte',        label: 'Matte',     preview: '■'  },
              { key: 'smoke',        label: 'Smoke',     preview: '▨'  },
              { key: 'glass',        label: 'Glass',     preview: '▥'  },
              { key: 'ghost',        label: 'Ghost',     preview: '░'  },
              { key: 'fog',          label: 'Fog',       preview: '▒'  },
              { key: 'white',        label: 'White',     preview: '□'  },
              { key: 'light-grey',   label: 'L.Grey',    preview: '▪'  },
              { key: 'silver',       label: 'Silver',    preview: '◻'  },
              { key: 'cream',        label: 'Cream',     preview: '▫'  },
              { key: 'outline',      label: 'Outline',   preview: '□'  },
              { key: 'outline-grey', label: 'Gr.Line',   preview: '□'  },
              { key: 'outline-dark', label: 'Dk.Line',   preview: '□'  },
              { key: 'grey-bar',     label: 'Gr.Bar',    preview: '▐'  },
              { key: 'white-bar',    label: 'Wh.Bar',    preview: '▐'  },
              { key: 'silver-bar',   label: 'Sv.Bar',    preview: '▐'  },
              { key: 'plate-grey',   label: 'Gr.Plate',  preview: '▬'  },
              { key: 'plate-white',  label: 'Wh.Plate',  preview: '▬'  },
              { key: 'double',       label: 'Double',    preview: '▣'  },
              { key: 'inset',        label: 'Inset',     preview: '▣'  },
              { key: 'deep',         label: 'Deep',      preview: '■'  },
              { key: 'pill',         label: 'Pill',      preview: '⬭'  },
              { key: 'pill-grey',    label: 'Gr.Pill',   preview: '⬭'  },
              { key: 'nameplate',    label: 'Nameplate', preview: '▭'  },
              { key: 'caption',      label: 'Caption',   preview: '▬'  },
            ].map(bg => (
              <button
                key={bg.key}
                className={`text-bg-btn ${(selectedText.bgStyle ?? 'none') === bg.key ? 'active' : ''}`}
                onClick={() => onUpdateText(selectedText.id, { bgStyle: bg.key })}
                title={bg.label}
              >
                <span className="text-bg-preview">{bg.preview}</span>
                <span className="text-bg-label">{bg.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <p>Players: {Object.keys(players).length}</p>
        <p className="hint">Middle-click or Delete to remove</p>
      </div>
    </aside>
  )
}
