import { useState } from 'react'
import { BOSS_CONFIGS } from '../data/bossConfigs'

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function PlanPicker({ plans, activePlanId, onSwitch, onCreate, onDelete, onClose }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [newBoss, setNewBoss]   = useState(BOSS_CONFIGS[0].key)

  const handleCreate = () => {
    const name = newName.trim() || (BOSS_CONFIGS.find(b => b.key === newBoss)?.label ?? 'Boss')
    onCreate(name, newBoss)
    setCreating(false)
    setNewName('')
    setNewBoss(BOSS_CONFIGS[0].key)
  }

  return (
    <div className="plan-picker-overlay" onClick={onClose}>
      <div className="plan-picker" onClick={e => e.stopPropagation()}>

        <div className="plan-picker-header">
          <span>Plans</span>
          <button className="plan-picker-close" onClick={onClose}>×</button>
        </div>

        <div className="plan-picker-list">
          {plans.map(plan => {
            const boss = BOSS_CONFIGS.find(b => b.key === plan.bossKey) ?? BOSS_CONFIGS[0]
            const isActive = plan.id === activePlanId
            return (
              <div
                key={plan.id}
                className={`plan-item ${isActive ? 'active' : ''}`}
                onClick={() => onSwitch(plan.id)}
              >
                <div className="plan-item-boss-icon" style={{ borderColor: boss.color }}>
                  {boss.icon
                    ? <img src={boss.icon} alt={boss.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <span style={{ fontSize: 18 }}>⚔️</span>}
                </div>
                <div className="plan-item-info">
                  <div className="plan-item-name" style={{ color: boss.color }}>{boss.label}</div>
                  <div className="plan-item-meta">{formatDate(plan.updatedAt)}</div>
                </div>
                {isActive && <span className="plan-item-active-badge">Active</span>}
                {!isActive && (
                  <button
                    className="plan-item-delete"
                    onClick={e => { e.stopPropagation(); if (window.confirm('Delete this plan?')) onDelete(plan.id) }}
                    title="Delete plan"
                  >🗑</button>
                )}
              </div>
            )
          })}
        </div>

        {creating ? (
          <div className="plan-picker-create">
            <div className="plan-create-boss-grid">
              {BOSS_CONFIGS.map(boss => (
                <button
                  key={boss.key}
                  className={`plan-boss-btn ${newBoss === boss.key ? 'active' : ''}`}
                  onClick={() => setNewBoss(boss.key)}
                  style={{ '--boss-color': boss.color }}
                >
                  <div className="plan-boss-icon" style={{ borderColor: boss.color }}>
                    {boss.icon
                      ? <img src={boss.icon} alt={boss.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <span>⚔️</span>}
                  </div>
                  <span className="plan-boss-label" style={{ color: boss.color }}>{boss.label}</span>
                </button>
              ))}
            </div>
            <input
              className="plan-name-input"
              placeholder="Plan name (optional)…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
              autoFocus
            />
            <div className="plan-create-actions">
              <button className="plan-create-confirm" onClick={handleCreate}>Create</button>
              <button className="plan-create-cancel" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="plan-new-btn" onClick={() => setCreating(true)}>+ New Plan</button>
        )}

      </div>
    </div>
  )
}
