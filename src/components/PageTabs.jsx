import { useState, useRef, useEffect } from 'react'

export default function PageTabs({ pages, activePageIdx, onSelect, onAdd, onRemove, onRename }) {
  const [editingIdx, setEditingIdx] = useState(null)
  const [draft, setDraft]           = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingIdx !== null && inputRef.current) inputRef.current.select()
  }, [editingIdx])

  const commitRename = (idx) => {
    const trimmed = draft.trim()
    if (trimmed) onRename(idx, trimmed)
    setEditingIdx(null)
  }

  return (
    <div className="page-tabs">
      {pages.map((page, idx) => (
        <div
          key={page.id}
          className={`page-tab ${activePageIdx === idx ? 'active' : ''}`}
          onClick={() => editingIdx !== idx && onSelect(idx)}
        >
          {editingIdx === idx ? (
            <input
              ref={inputRef}
              className="page-tab-input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => commitRename(idx)}
              onKeyDown={e => {
                if (e.key === 'Enter')  commitRename(idx)
                if (e.key === 'Escape') setEditingIdx(null)
                e.stopPropagation()
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="page-tab-title"
              onDoubleClick={e => {
                e.stopPropagation()
                setDraft(page.title)
                setEditingIdx(idx)
              }}
            >
              {page.title}
            </span>
          )}

          {pages.length > 1 && (
            <button
              className="page-tab-close"
              onClick={e => { e.stopPropagation(); onRemove(idx) }}
              title="Delete page"
            >×</button>
          )}
        </div>
      ))}

      <button className="page-tab-add" onClick={onAdd} title="Add page (copies Phase 1)">+</button>
    </div>
  )
}
