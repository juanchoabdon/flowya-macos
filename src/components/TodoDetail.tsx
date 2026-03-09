import { useState, useRef, useEffect } from 'react';
import type { Todo, TaskStatus, Space, Priority, WeeklyGoal } from '../types';
import { RichTextEditor, RichTextEditorRef } from './RichTextEditor';
import { suggestTaskName } from '../lib/openai';
import * as analytics from '../lib/analytics';

interface TodoDetailProps {
  todo: Todo;
  onUpdate: (id: string, updates: { text?: string; description?: string | null; priority?: Priority; due_date?: string | null }) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onClose: () => void;
  space?: Space;
  spaces?: Space[];
  onChangeSpace?: (todoId: string, newSpaceId: string) => void;
  focusDescription?: boolean;
  aiRoles?: Record<string, string> | null;
  aiContext?: string | null;
  aiSetupComplete?: boolean;
  weeklyGoals?: WeeklyGoal[];
  onLinkGoal?: (goalId: string, todoId: string) => void;
  onUnlinkGoal?: (goalId: string, todoId: string) => void;
  onExecuteWithAgent?: (taskText: string, taskDescription?: string) => void;
  agentRunning?: boolean;
}

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3'];

// ETA options with date calculations
type ETAOption = { label: string; getValue: () => string | null };

const getETAOptions = (): ETAOption[] => {
  const now = new Date();
  
  const in1Hour = new Date(now);
  in1Hour.setHours(in1Hour.getHours() + 1);
  
  const in3Hours = new Date(now);
  in3Hours.setHours(in3Hours.getHours() + 3);
  
  // For "Today", use end of day (18:00/6PM) to avoid timezone issues
  // This gives a reasonable deadline that works across timezones
  const today = new Date();
  today.setHours(18, 0, 0, 0);
  // If it's already past 6PM, set to 11:59PM
  if (today <= now) {
    today.setHours(23, 59, 0, 0);
  }
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);
  
  const in3Days = new Date();
  in3Days.setDate(in3Days.getDate() + 3);
  in3Days.setHours(18, 0, 0, 0);
  
  // End of this week (Sunday at 6PM)
  const thisWeek = new Date();
  thisWeek.setDate(thisWeek.getDate() + (7 - thisWeek.getDay()));
  thisWeek.setHours(18, 0, 0, 0);
  
  // End of next week
  const nextWeek = new Date(thisWeek);
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  // Format with timezone offset preserved
  const formatDateTime = (d: Date) => d.toISOString();
  
  return [
    { label: 'None', getValue: () => null },
    { label: '1 hour', getValue: () => formatDateTime(in1Hour) },
    { label: '3 hours', getValue: () => formatDateTime(in3Hours) },
    { label: 'Today', getValue: () => formatDateTime(today) },
    { label: 'Tomorrow', getValue: () => formatDateTime(tomorrow) },
    { label: '3 days', getValue: () => formatDateTime(in3Days) },
    { label: 'This week', getValue: () => formatDateTime(thisWeek) },
    { label: 'Next week', getValue: () => formatDateTime(nextWeek) },
  ];
};

const parseDueDate = (dueDate: string): Date => {
  // Supabase TIMESTAMPTZ may return timestamps in various formats
  let dateStr = dueDate;
  
  // If it doesn't end with Z and doesn't have timezone offset, treat as UTC
  if (!dateStr.endsWith('Z') && !dateStr.match(/[+-]\d{2}:\d{2}$/) && !dateStr.match(/[+-]\d{2}$/)) {
    dateStr = dateStr + 'Z';
  }
  
  // Replace space with T if needed for ISO format
  dateStr = dateStr.replace(' ', 'T');
  
  return new Date(dateStr);
};

const formatDueDate = (dueDate: string | null): string => {
  if (!dueDate) return 'Set ETA';
  
  const now = new Date();
  const due = parseDueDate(dueDate);
  
  // Check if date is valid
  if (isNaN(due.getTime())) return 'Invalid date';
  
  // Check if same calendar day (in local timezone)
  const isToday = due.getDate() === now.getDate() && 
                  due.getMonth() === now.getMonth() && 
                  due.getFullYear() === now.getFullYear();
  
  // Check if tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = due.getDate() === tomorrow.getDate() && 
                     due.getMonth() === tomorrow.getMonth() && 
                     due.getFullYear() === tomorrow.getFullYear();
  
  const diffMs = due.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  
  if (diffMs < 0) {
    const absMins = Math.abs(Math.round(diffMs / (1000 * 60)));
    const absHours = Math.abs(Math.round(diffMs / (1000 * 60 * 60)));
    const absDays = Math.abs(Math.round(diffMs / (1000 * 60 * 60 * 24)));
    if (absMins < 60) return `${absMins}m late`;
    if (absHours < 24) return `${absHours}h late`;
    return `${absDays}d late`;
  }
  
  // Show relative time for short durations
  if (diffMins <= 59) return `${diffMins}m`;
  if (diffHours <= 3) return `${diffHours}h`;
  
  // For same day, show "Today"
  if (isToday) return 'Today';
  if (isTomorrow) return 'Tomorrow';
  
  // For longer durations, show days
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return `${diffDays}d`;
  
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getDueDateClass = (dueDate: string | null): string => {
  if (!dueDate) return '';
  
  const now = new Date();
  const due = parseDueDate(dueDate);
  
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (diffMs < 0) return 'overdue';
  if (diffHours <= 3) return 'due-soon';
  return '';
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  backlog: { label: 'Backlog', color: '#8E8E93', bg: 'rgba(142, 142, 147, 0.2)' },
  in_progress: { label: 'In Progress', color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.2)' },
  done: { label: 'Done', color: '#30D158', bg: 'rgba(48, 209, 88, 0.2)' },
};

export function TodoDetail({ todo, onUpdate, onStatusChange, onClose, space, spaces, onChangeSpace, focusDescription: _focusDescription, aiRoles, aiContext, aiSetupComplete, weeklyGoals, onLinkGoal, onUnlinkGoal, onExecuteWithAgent: _onExecuteWithAgent, agentRunning: _agentRunning }: TodoDetailProps) {
  const [title, setTitle] = useState(todo.text);
  const [description, setDescription] = useState(todo.description || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [customDay, setCustomDay] = useState(new Date().getDate());
  const [customMonth, setCustomMonth] = useState(new Date().getMonth());
  const [customHour, setCustomHour] = useState(18); // Default 6 PM
  const [aiSuggestion, setAISuggestion] = useState<string | null>(null);
  const [aiSuggestionLoading, setAISuggestionLoading] = useState(false);
  const [aiSuggestionDismissed, setAISuggestionDismissed] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('flowya_ai_suggestion_dismissed') || '[]');
      return (stored as string[]).includes(todo.id);
    } catch { return false; }
  });
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<RichTextEditorRef>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const dueDateRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);

  // Auto-focus description when opening todo detail
  useEffect(() => {
    // Small delay to ensure component is mounted
    const timer = setTimeout(() => {
      if (descriptionRef.current && todo.status !== 'done') {
        descriptionRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [todo.id, todo.status]); // Re-run when todo changes

  // Auto-open ETA selector when no due date is set
  useEffect(() => {
    if (todo.status !== 'done' && !todo.due_date) {
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        setDueDateOpen(true);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [todo.id]); // Run when opening any todo

  // Fetch AI name suggestion for tasks
  useEffect(() => {
    if (todo.text && todo.text.trim().length >= 3 && !aiSuggestionDismissed) {
      let cancelled = false;
      setAISuggestionLoading(true);
      const profile = aiSetupComplete && aiRoles ? { roles: aiRoles, context: aiContext || '' } : null;
      const currentSpace = space || spaces?.find(s => s.id === todo.space_id);
      const spaceRole = aiRoles && todo.space_id ? aiRoles[todo.space_id] : undefined;
      suggestTaskName(todo.text, profile, currentSpace?.name, spaceRole).then(suggestion => {
        if (!cancelled) {
          setAISuggestion(suggestion);
          setAISuggestionLoading(false);
        }
      }).catch(() => {
        if (!cancelled) setAISuggestionLoading(false);
      });
      return () => { cancelled = true; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id]);

  // Auto-resize textarea
  const autoResizeTextarea = () => {
    if (titleInputRef.current) {
      titleInputRef.current.style.height = 'auto';
      titleInputRef.current.style.height = `${titleInputRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      const input = titleInputRef.current;
      input.focus();
      // Auto-resize to fit content
      requestAnimationFrame(() => {
        input.setSelectionRange(0, 0);
        autoResizeTextarea();
      });
    }
  }, [isEditingTitle]);

  const handleSaveTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== todo.text) {
      onUpdate(todo.id, { text: trimmed });
    } else {
      setTitle(todo.text);
    }
    setIsEditingTitle(false);
  };

  const handleSaveDescription = () => {
    // Strip HTML tags to check if there's actual content
    const textContent = description.replace(/<[^>]*>/g, '').trim();
    const hasContent = textContent.length > 0;
    const newValue = hasContent ? description : null;
    
    if (newValue !== (todo.description || null)) {
      onUpdate(todo.id, { description: newValue });
    }
  };

  const handleClose = () => {
    // Save any pending changes before closing
    const trimmedTitle = title.trim();
    // Strip HTML tags to check if there's actual content
    const descTextContent = description.replace(/<[^>]*>/g, '').trim();
    const hasDescContent = descTextContent.length > 0;
    const newDescValue = hasDescContent ? description : null;
    
    const updates: { text?: string; description?: string | null } = {};
    
    if (trimmedTitle && trimmedTitle !== todo.text) {
      updates.text = trimmedTitle;
    }
    if (newDescValue !== (todo.description || null)) {
      updates.description = newDescValue;
    }
    
    if (Object.keys(updates).length > 0) {
      onUpdate(todo.id, updates);
    }
    
    onClose();
  };

  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (priorityOpen || statusOpen || dueDateOpen || spaceOpen) {
          setPriorityOpen(false);
          setStatusOpen(false);
          setDueDateOpen(false);
          setSpaceOpen(false);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, description, priorityOpen, statusOpen, dueDateOpen, spaceOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) {
        setPriorityOpen(false);
      }
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
      if (dueDateRef.current && !dueDateRef.current.contains(e.target as Node)) {
        setDueDateOpen(false);
      }
      if (spaceRef.current && !spaceRef.current.contains(e.target as Node)) {
        setSpaceOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentStatus = STATUS_CONFIG[todo.status];
  const etaOptions = getETAOptions();

  return (
    <div className="todo-detail-container">
      {/* Back button header */}
      <div className="todo-detail-header">
        <button 
          className="todo-detail-back" 
          type="button"
          onClick={handleClose}
        >
          <BackIcon />
        </button>
        
        <div className="todo-detail-header-right">
          {/* Space Selector - only in All view */}
          {space && spaces && onChangeSpace ? (
            <div className="custom-dropdown" ref={spaceRef}>
              <button
                type="button"
                className="custom-dropdown-trigger space-dropdown-trigger"
                onClick={() => setSpaceOpen(!spaceOpen)}
                style={{ 
                  backgroundColor: `${space.color}25`,
                  color: space.color,
                  borderColor: `${space.color}40`,
                }}
              >
                <span>{space.name}</span>
                <ChevronIcon />
              </button>
              {spaceOpen && (
                <div className="custom-dropdown-menu">
                  {spaces.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`custom-dropdown-item ${todo.space_id === s.id ? 'active' : ''}`}
                      onClick={() => {
                        onChangeSpace(todo.id, s.id);
                        setSpaceOpen(false);
                      }}
                    >
                      <span 
                        className="space-dot"
                        style={{ background: s.color }}
                      />
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : space ? (
            <span 
              className="space-label"
              style={{ 
                backgroundColor: `${space.color}25`,
                color: space.color,
                borderColor: `${space.color}40`,
              }}
            >
              {space.name}
            </span>
          ) : null}
          {/* Priority Dropdown */}
          <div className="custom-dropdown" ref={priorityRef}>
            <button
              type="button"
              className={`custom-dropdown-trigger ${todo.priority === 'P0' ? 'priority-p0' : ''}`}
              onClick={() => todo.status !== 'done' && setPriorityOpen(!priorityOpen)}
              disabled={todo.status === 'done'}
            >
              <span>{todo.priority || 'P1'}</span>
              <ChevronIcon />
            </button>
            {priorityOpen && (
              <div className="custom-dropdown-menu">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`custom-dropdown-item ${(todo.priority || 'P1') === p ? 'active' : ''}`}
                    onClick={() => {
                      analytics.trackSetPriority(todo.id, p, todo.priority || 'P1');
                      onUpdate(todo.id, { priority: p });
                      setPriorityOpen(false);
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status Dropdown */}
          <div className="custom-dropdown" ref={statusRef}>
            <button
              type="button"
              className="custom-dropdown-trigger status-trigger"
              onClick={() => setStatusOpen(!statusOpen)}
              style={{ 
                color: currentStatus.color,
                background: currentStatus.bg,
              }}
            >
              <span>{currentStatus.label}</span>
              <ChevronIcon />
            </button>
            {statusOpen && (
              <div className="custom-dropdown-menu">
                {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`custom-dropdown-item ${todo.status === status ? 'active' : ''}`}
                    onClick={() => {
                      onStatusChange(todo.id, status);
                      setStatusOpen(false);
                    }}
                    style={{ color: STATUS_CONFIG[status].color }}
                  >
                    <span 
                      className="status-dot" 
                      style={{ background: STATUS_CONFIG[status].color }}
                    />
                    {STATUS_CONFIG[status].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="todo-detail-content">
        {isEditingTitle ? (
          <textarea
            ref={titleInputRef}
            className="todo-detail-title-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              autoResizeTextarea();
            }}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveTitle();
              }
              if (e.key === 'Escape') {
                setTitle(todo.text);
                setIsEditingTitle(false);
              }
            }}
          />
        ) : (
          <h2 
            className="todo-detail-title"
            onClick={() => todo.status !== 'done' && setIsEditingTitle(true)}
          >
            {todo.text}
          </h2>
        )}

        {/* Due Date inline selector */}
        {todo.status !== 'done' && (
          <div className="due-date-field" ref={dueDateRef}>
            <button
              type="button"
              className={`due-date-btn ${todo.due_date ? getDueDateClass(todo.due_date) : ''}`}
              onClick={() => setDueDateOpen(!dueDateOpen)}
            >
              <CalendarIcon />
              <span>{formatDueDate(todo.due_date)}</span>
            </button>
            {dueDateOpen && (
              <div className="due-date-options">
                {etaOptions.map((option) => {
                  const isUrgent = ['1 hour', '3 hours', 'Today'].includes(option.label);
                  return (
                    <button
                      key={option.label}
                      type="button"
                      className={`due-date-option ${todo.due_date === option.getValue() ? 'active' : ''}`}
                      onClick={() => {
                        analytics.trackSetETA(todo.id, option.label, false);
                        const updates: { due_date?: string | null; priority?: Priority } = { 
                          due_date: option.getValue() 
                        };
                        // Auto-set P0 for urgent deadlines
                        if (isUrgent && option.getValue() !== null) {
                          updates.priority = 'P0';
                        }
                        onUpdate(todo.id, updates);
                        setDueDateOpen(false);
                        setShowCustomDate(false);
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
                
                {/* Custom date option */}
                {!showCustomDate ? (
                  <button
                    type="button"
                    className="due-date-option custom-date-trigger"
                    onClick={() => setShowCustomDate(true)}
                  >
                    Custom...
                  </button>
                ) : (
                  <div className="custom-date-picker">
                    <div className="custom-date-row">
                      <select 
                        value={customMonth} 
                        onChange={(e) => setCustomMonth(parseInt(e.target.value))}
                        className="custom-date-select"
                      >
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                          <option key={m} value={i}>{m}</option>
                        ))}
                      </select>
                      <select 
                        value={customDay} 
                        onChange={(e) => setCustomDay(parseInt(e.target.value))}
                        className="custom-date-select"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <select 
                        value={customHour} 
                        onChange={(e) => setCustomHour(parseInt(e.target.value))}
                        className="custom-date-select"
                      >
                        {Array.from({ length: 24 }, (_, i) => i).map(h => (
                          <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="custom-date-confirm"
                      onClick={() => {
                        const date = new Date();
                        date.setMonth(customMonth);
                        date.setDate(customDay);
                        date.setHours(customHour, 0, 0, 0);
                        // If date is in the past, assume next year
                        if (date < new Date()) {
                          date.setFullYear(date.getFullYear() + 1);
                        }
                        analytics.trackSetETA(todo.id, 'Custom', true);
                        onUpdate(todo.id, { due_date: date.toISOString() });
                        setDueDateOpen(false);
                        setShowCustomDate(false);
                      }}
                    >
                      Set
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* AI name suggestion chip */}
        {!aiSuggestionDismissed && (aiSuggestionLoading || aiSuggestion) && (
          <div
            className={`ai-suggestion-chip ${aiSuggestionLoading ? 'loading' : ''}`}
            onClick={() => {
              if (aiSuggestion && !aiSuggestionLoading) {
                setTitle(aiSuggestion);
                onUpdate(todo.id, { text: aiSuggestion });
                setAISuggestion(null);
                setAISuggestionDismissed(true);
                try {
                  const stored = JSON.parse(localStorage.getItem('flowya_ai_suggestion_dismissed') || '[]');
                  localStorage.setItem('flowya_ai_suggestion_dismissed', JSON.stringify([...new Set([...stored, todo.id])]));
                } catch { /* ignore */ }
              }
            }}
          >
            <span className="ai-suggestion-sparkle">✨</span>
            {aiSuggestionLoading ? (
              <span className="ai-suggestion-text">Thinking of a better name...</span>
            ) : (
              <>
                <span className="ai-suggestion-body">
                  <span className="ai-suggestion-text clickable">{aiSuggestion}</span>
                  <span className="ai-suggestion-apply">Tap to apply</span>
                </span>
                <button
                  className="ai-suggestion-dismiss"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAISuggestionDismissed(true);
                    try {
                      const stored = JSON.parse(localStorage.getItem('flowya_ai_suggestion_dismissed') || '[]');
                      localStorage.setItem('flowya_ai_suggestion_dismissed', JSON.stringify([...new Set([...stored, todo.id])]));
                    } catch { /* ignore */ }
                  }}
                >
                  ×
                </button>
              </>
            )}
          </div>
        )}

        {/* Weekly goal link */}
        {weeklyGoals && weeklyGoals.length > 0 && onLinkGoal && onUnlinkGoal && (() => {
          const spaceGoals = weeklyGoals.filter(g => g.space_id === todo.space_id);
          if (spaceGoals.length === 0) return null;

          const linkedGoal = spaceGoals.find(g =>
            (g.linked_todo_ids || []).includes(todo.id) ||
            g.linked_todo_id === todo.id
          );
          const availableGoals = spaceGoals.filter(g => g !== linkedGoal);

          return (
            <div className="goal-link-field">
              {linkedGoal ? (
                <div className="goal-link-chip linked">
                  <GoalIcon />
                  <span className="goal-link-text">{linkedGoal.goal_text}</span>
                  <button
                    className="goal-link-remove"
                    onClick={() => onUnlinkGoal(linkedGoal.id, todo.id)}
                    title="Unlink from goal"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="goal-link-picker-wrap">
                  <button
                    className="goal-link-chip unlinked"
                    onClick={() => setGoalPickerOpen(!goalPickerOpen)}
                  >
                    <GoalIcon />
                    <span className="goal-link-text">Link to weekly goal</span>
                    <ChevronIcon />
                  </button>
                  {goalPickerOpen && (
                    <div className="goal-link-dropdown">
                      {availableGoals.map(g => (
                        <button
                          key={g.id}
                          className="goal-link-option"
                          onClick={() => {
                            onLinkGoal(g.id, todo.id);
                            setGoalPickerOpen(false);
                          }}
                        >
                          <GoalIcon />
                          {g.goal_text}
                        </button>
                      ))}
                      {availableGoals.length === 0 && (
                        <div className="goal-link-option disabled">No goals available</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        <RichTextEditor
          ref={descriptionRef}
          content={description}
          onChange={setDescription}
          onBlur={handleSaveDescription}
          placeholder="Add notes, details, or anything else..."
          disabled={todo.status === 'done'}
        />
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M10 12L6 8L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="goal-link-icon">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1"/>
      <circle cx="6" cy="6" r="0.8" fill="currentColor"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="2.5" width="9" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 5H10.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 1.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 1.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function _AgentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L2 4V10L7 13L12 10V4L7 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
