import { useState } from 'react';
import type { RecurringTask, Space } from '../types';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

interface RecurringTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  recurringTasks: RecurringTask[];
  spaces: Space[];
  onCreate: (task: { space_id: string; text: string; days: number[] }) => Promise<RecurringTask | null>;
  onUpdate: (id: string, updates: Partial<Pick<RecurringTask, 'text' | 'space_id' | 'days' | 'enabled'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function getDaySummary(days: number[]): string {
  const sorted = [...days].sort();
  if (sorted.length === 7) return 'Every day';
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return 'Weekdays';
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return 'Weekends';
  return sorted.map(d => DAY_NAMES[d]).join(', ');
}

export function RecurringTasksModal({
  isOpen,
  onClose,
  recurringTasks,
  spaces,
  onCreate,
  onUpdate,
  onDelete,
}: RecurringTasksModalProps) {
  const [newText, setNewText] = useState('');
  const [newSpaceId, setNewSpaceId] = useState(spaces[0]?.id || '');
  const [newDays, setNewDays] = useState<number[]>(WEEKDAYS);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!isOpen) return null;

  const toggleDay = (day: number) => {
    setNewDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handlePreset = (preset: 'weekdays' | 'everyday') => {
    setNewDays(preset === 'weekdays' ? [...WEEKDAYS] : [...ALL_DAYS]);
  };

  const handleAdd = async () => {
    if (!newText.trim() || newDays.length === 0 || !newSpaceId) return;
    setAdding(true);
    await onCreate({ space_id: newSpaceId, text: newText.trim(), days: newDays });
    setNewText('');
    setNewDays([...WEEKDAYS]);
    setAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  const getSpaceForTask = (spaceId: string) => spaces.find(s => s.id === spaceId);

  return (
    <div className="recurring-overlay" onClick={onClose}>
      <div className="recurring-modal" onClick={e => e.stopPropagation()}>
        <div className="recurring-header">
          <h2>Daily Tasks</h2>
          <button className="recurring-close" onClick={onClose}>✕</button>
        </div>

        <div className="recurring-content">
          {recurringTasks.length === 0 && (
            <div className="recurring-empty">
              <span className="recurring-empty-icon">🔄</span>
              <p>No recurring tasks yet.</p>
              <p className="recurring-empty-sub">
                Add tasks that auto-create every day — like standups, exercise, or reviews.
              </p>
            </div>
          )}

          {recurringTasks.map(rt => {
            const space = getSpaceForTask(rt.space_id);
            return (
              <div key={rt.id} className={`recurring-item ${!rt.enabled ? 'disabled' : ''}`}>
                <div className="recurring-item-left">
                  <span
                    className="recurring-item-dot"
                    style={{ background: space?.color || '#888' }}
                  />
                  <div className="recurring-item-info">
                    <span className="recurring-item-text">{rt.text}</span>
                    <span className="recurring-item-schedule">
                      {getDaySummary(rt.days)}
                      {space && <> · {space.name}</>}
                    </span>
                  </div>
                </div>
                <div className="recurring-item-actions">
                  <button
                    className={`recurring-toggle ${rt.enabled ? 'on' : 'off'}`}
                    onClick={() => onUpdate(rt.id, { enabled: !rt.enabled })}
                    title={rt.enabled ? 'Disable' : 'Enable'}
                  >
                    <span className="recurring-toggle-track">
                      <span className="recurring-toggle-thumb" />
                    </span>
                  </button>
                  {confirmDeleteId === rt.id ? (
                    <button
                      className="recurring-delete confirming"
                      onClick={() => { onDelete(rt.id); setConfirmDeleteId(null); }}
                    >
                      Sure?
                    </button>
                  ) : (
                    <button
                      className="recurring-delete"
                      onClick={() => setConfirmDeleteId(rt.id)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="recurring-add-section">
            <div className="recurring-add-row">
              <input
                className="recurring-add-input"
                type="text"
                placeholder="New daily task..."
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              <select
                className="recurring-add-space"
                value={newSpaceId}
                onChange={e => setNewSpaceId(e.target.value)}
              >
                {spaces.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="recurring-days-row">
              <div className="recurring-days-chips">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    className={`recurring-day-chip ${newDays.includes(i) ? 'active' : ''}`}
                    onClick={() => toggleDay(i)}
                  >
                    {label}
                  </button>
                ))}
                <span className="recurring-presets-divider">|</span>
                <button
                  className={`recurring-preset ${newDays.length === 5 && newDays.every((d, idx) => d === idx + 1) ? 'active' : ''}`}
                  onClick={() => handlePreset('weekdays')}
                >
                  Wk
                </button>
                <button
                  className={`recurring-preset ${newDays.length === 7 ? 'active' : ''}`}
                  onClick={() => handlePreset('everyday')}
                >
                  All
                </button>
              </div>
            </div>

            <button
              className="recurring-add-btn"
              onClick={handleAdd}
              disabled={!newText.trim() || newDays.length === 0 || adding}
            >
              {adding ? 'Adding...' : 'Add Daily Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
