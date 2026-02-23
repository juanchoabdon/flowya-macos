import { useState } from 'react';
import type { WeeklyGoal, Space, Todo } from '../types';

interface WeeklyFocusBannerProps {
  goals: WeeklyGoal[];
  spaces: Space[];
  todos: Todo[];
  isAllView: boolean;
  selectedSpaceId: string | null;
  onOpenGoal: (todoId: string) => void;
  onEdit: () => void;
}

export function WeeklyFocusBanner({
  goals,
  spaces,
  todos,
  isAllView,
  selectedSpaceId,
  onOpenGoal,
  onEdit,
}: WeeklyFocusBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const filteredGoals = isAllView || !selectedSpaceId
    ? goals
    : goals.filter(g => g.space_id === selectedSpaceId);

  if (filteredGoals.length === 0) return null;

  const spaceMap = Object.fromEntries(spaces.map(s => [s.id, s]));
  const todoMap = Object.fromEntries(todos.map(t => [t.id, t]));
  const completed = filteredGoals.filter(g => g.completed).length;
  const total = filteredGoals.length;

  return (
    <div className="weekly-banner">
      <button className="weekly-banner-toggle" onClick={() => setExpanded(!expanded)}>
        <div className="weekly-banner-left">
          <TargetIcon />
          <span className="weekly-banner-label">Week Focus</span>
          <span className="weekly-banner-progress">
            {completed}/{total}
          </span>
        </div>
        <div className="weekly-banner-right">
          <div className="weekly-banner-bar">
            <div
              className="weekly-banner-bar-fill"
              style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            />
          </div>
          <button
            className="weekly-banner-edit"
            onClick={e => { e.stopPropagation(); onEdit(); }}
            title="Edit weekly goals"
          >
            <EditIcon />
          </button>
          <ChevronIcon expanded={expanded} />
        </div>
      </button>

      {expanded && (
        <div className="weekly-banner-goals">
          {filteredGoals.map(g => {
            const space = spaceMap[g.space_id];
            const linkedTodos = (g.linked_todo_ids || [])
              .map(id => todoMap[id])
              .filter(Boolean);
            const fallbackTodo = !linkedTodos.length && g.linked_todo_id ? todoMap[g.linked_todo_id] : null;
            if (fallbackTodo) linkedTodos.push(fallbackTodo);
            const isDone = g.completed;

            return (
              <div key={g.id} className={`weekly-banner-goal ${isDone ? 'done' : ''}`}>
                <div className={`weekly-banner-check ${isDone ? 'checked' : ''}`}>
                  {isDone ? '✓' : '○'}
                </div>
                <div className="weekly-banner-goal-body">
                  <span className={`weekly-banner-goal-text ${isDone ? 'completed' : ''}`}>
                    {g.goal_text}
                  </span>
                  {linkedTodos.map(todo => (
                    <span
                      key={todo.id}
                      className="weekly-banner-task-name clickable"
                      onClick={() => onOpenGoal(todo.id)}
                    >
                      → {todo.text}
                    </span>
                  ))}
                </div>
                {isAllView && space && (
                  <div className="weekly-banner-space-dot" style={{ background: space.color }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TargetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="weekly-banner-icon">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="7" r="1" fill="currentColor"/>
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M7.5 2L10 4.5L4.5 10H2V7.5L7.5 2Z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      className="weekly-banner-chevron"
      style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    >
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
