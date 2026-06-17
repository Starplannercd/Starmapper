import { useRef, useLayoutEffect, useState } from 'react'

const TEXT_COLORS = [
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

export default function TextToolbar({ textEl, onUpdate, onColorRange, onMove, anchorX, anchorY }) {
  const ref         = useRef(null)
  const textareaRef = useRef(null)
  const [style, setStyle] = useState({ position: 'fixed', opacity: 0, top: 0, left: 0, zIndex: 900 })

  useLayoutEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    let top  = anchorY - height - 12
    let left = anchorX - width / 2
    if (top < 8) top = anchorY + 28
    left = Math.max(8, Math.min(left, window.innerWidth  - width  - 8))
    top  = Math.max(8, Math.min(top,  window.innerHeight - height - 8))
    setStyle({ position: 'fixed', top, left, zIndex: 900, opacity: 1 })
    textareaRef.current?.focus()
    textareaRef.current?.select()
  }, [anchorX, anchorY, textEl.id])

  const handleKeyDown = (e) => {
    const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const dir = DIRS[e.key]
    if (dir) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      onMove?.(dir[0] * step, dir[1] * step)
    }
  }

  const fadeActive  = (textEl.textAnim ?? 'none') === 'fadeIn'
  const hasSegments = textEl.segments?.length > 0

  const handleColorClick = (c) => {
    const ta    = textareaRef.current
    const start = ta?.selectionStart ?? 0
    const end   = ta?.selectionEnd   ?? 0
    if (start !== end) {
      onColorRange?.(start, end, c)
    } else {
      onUpdate({ color: c, segments: undefined })
    }
  }

  return (
    <div ref={ref} className="text-toolbar" style={style} onMouseDown={e => e.stopPropagation()}>

      <div className="tt-row">
        <textarea
          ref={textareaRef}
          className="tt-textarea"
          value={textEl.text}
          placeholder="TEXT…"
          onChange={e => onUpdate({ text: e.target.value.toUpperCase(), segments: undefined })}
          onKeyDown={handleKeyDown}
          style={{ textTransform: 'uppercase' }}
        />
        <div className="tt-inline-controls">
          <div className="tt-control-row">
            <label className="tt-label">Size</label>
            <input type="number" className="tt-size-input"
              value={textEl.fontSize} min={8} max={96}
              onChange={e => onUpdate({ fontSize: Number(e.target.value) })}
            />
            <button
              className={`tt-btn ${textEl.bold ? 'active' : ''}`}
              onClick={() => onUpdate({ bold: !textEl.bold })}
              title="Bold"
            ><b>B</b></button>
            <button
              className={`tt-btn ${textEl.persistent ? 'active' : ''}`}
              title="Persist to new frames"
              onClick={() => onUpdate({ persistent: !textEl.persistent })}
            >📌</button>
          </div>
          <div className="tt-control-row">
            {FONT_OPTIONS.map(f => (
              <button key={f.key}
                className={`tt-font-btn ${(textEl.fontFamily ?? 'sans-serif') === f.family ? 'active' : ''}`}
                style={{ fontFamily: f.family }}
                onClick={() => onUpdate({ fontFamily: f.family })}
              >{f.label}</button>
            ))}
            <button
              className={`tt-btn ${fadeActive ? 'active' : ''}`}
              onClick={() => onUpdate({ textAnim: fadeActive ? 'none' : 'fadeIn' })}
              title="Fade In entrance"
            >◌ Fade</button>
            {textEl.textHighlight && textEl.textHighlight !== 'none' && (
              <button className="tt-btn"
                onClick={() => onUpdate({ textHighlight: 'none' })}
                title="Remove highlight effect"
              >✕ Effect</button>
            )}
          </div>
          <div className="tt-color-hint">
            {hasSegments
              ? <span>Mixed colors active</span>
              : <span>Select text then click color</span>}
            {hasSegments && (
              <button className="tt-clear-colors"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onUpdate({ segments: undefined })}>✕ Clear</button>
            )}
          </div>
          <div className="tt-color-row">
            {TEXT_COLORS.map(c => (
              <button key={c}
                className={`tt-swatch ${!hasSegments && textEl.color === c ? 'active' : ''}`}
                style={{ background: c }}
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleColorClick(c)}
                title={c}
              />
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
