import { useMemo, useState } from 'react';
import type { DailyPlanBucket, DailyPlanItem, DailyPlanView, Space, Todo, WeeklyGoal } from '../types';

interface PlanningPanelProps {
  weeklyGoals: WeeklyGoal[];
  dailyPlan: DailyPlanView;
  spaces: Space[];
  todos: Todo[];
  onOpenTask: (todoId: string) => void;
  variant?: 'inline' | 'popover';
  showsPlannedWeekAhead?: boolean;
}

const BUCKET_LABELS: Record<DailyPlanBucket, string> = {
  deadline: 'Deadlines',
  active: 'Active work',
  follow_up: 'Follow-ups',
  habit: 'Habits',
};

const BUCKET_ORDER: DailyPlanBucket[] = ['deadline', 'active', 'follow_up', 'habit'];

function formatPlanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function statusLabel(status: string | undefined): string {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'draft') return 'Draft';
  if (status === 'closed') return 'Closed';
  return '';
}

function groupByBucket(items: DailyPlanItem[]) {
  const groups: Record<DailyPlanBucket, DailyPlanItem[]> = {
    deadline: [],
    active: [],
    follow_up: [],
    habit: [],
  };
  for (const item of items) {
    groups[item.bucket]?.push(item);
  }
  for (const bucket of BUCKET_ORDER) {
    groups[bucket].sort((a, b) => a.position - b.position);
  }
  return groups;
}

/** Read-only week + today planning surface. Empty states stay empty — no nudge to fill. */
export function PlanningPanel({
  weeklyGoals,
  dailyPlan,
  spaces,
  todos,
  onOpenTask,
  variant = 'inline',
  showsPlannedWeekAhead = false,
}: PlanningPanelProps) {
  const [weekExpanded, setWeekExpanded] = useState(true);
  const [todayExpanded, setTodayExpanded] = useState(true);

  const spaceMap = useMemo(() => Object.fromEntries(spaces.map(s => [s.id, s])), [spaces]);
  const todoMap = useMemo(() => Object.fromEntries(todos.map(t => [t.id, t])), [todos]);
  const bucketGroups = useMemo(() => groupByBucket(dailyPlan.items), [dailyPlan.items]);

  const weekCompleted = weeklyGoals.filter(g => g.completed).length;
  const weekTotal = weeklyGoals.length;

  return (
    <div className={`planning-panel ${variant === 'popover' ? 'planning-panel-popover' : ''}`}>
      {/* Today */}
      <section className="planning-section">
        <button
          type="button"
          className="planning-section-toggle"
          onClick={() => setTodayExpanded(v => !v)}
        >
          <div className="planning-section-left">
            <CalendarIcon />
            <span className="planning-section-title">Today</span>
            {dailyPlan.plan && (
              <span className={`planning-status planning-status-${dailyPlan.plan.status}`}>
                {statusLabel(dailyPlan.plan.status)}
              </span>
            )}
          </div>
          <Chevron expanded={todayExpanded} />
        </button>

        {todayExpanded && (
          <div className="planning-section-body">
            {dailyPlan.plan?.summary && (
              <p className="planning-summary">{dailyPlan.plan.summary}</p>
            )}

            {!dailyPlan.plan || dailyPlan.items.length === 0 ? (
              <p className="planning-empty">
                {dailyPlan.plan
                  ? `No tasks in ${formatPlanDate(dailyPlan.plan.plan_date)}'s plan`
                  : 'No plan for today'}
              </p>
            ) : (
              BUCKET_ORDER.map(bucket => {
                const items = bucketGroups[bucket];
                if (items.length === 0) return null;
                return (
                  <div key={bucket} className="planning-bucket">
                    <div className="planning-bucket-label">{BUCKET_LABELS[bucket]}</div>
                    {items.map(item => {
                      const task = todoMap[item.task_id] ?? item.task;
                      const space = task ? spaceMap[task.space_id] : undefined;
                      const isDone = task?.status === 'done';

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`planning-task-row ${isDone ? 'done' : ''} ${item.missing ? 'missing' : ''}`}
                          onClick={() => task && onOpenTask(task.id)}
                          disabled={!task}
                        >
                          <span className={`planning-task-check ${isDone ? 'checked' : ''}`}>
                            {isDone ? '✓' : '○'}
                          </span>
                          <span className={`planning-task-text ${isDone ? 'completed' : ''}`}>
                            {item.missing ? '(removed task)' : task?.text}
                          </span>
                          {task && (
                            <span className={`planning-task-priority ${task.priority}`}>
                              {task.priority}
                            </span>
                          )}
                          {space && (
                            <span
                              className="planning-task-space-dot"
                              style={{ background: space.color }}
                              title={space.name}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {/* Week */}
      <section className="planning-section">
        <button
          type="button"
          className="planning-section-toggle"
          onClick={() => setWeekExpanded(v => !v)}
        >
          <div className="planning-section-left">
            <TargetIcon />
            <span className="planning-section-title">
              {showsPlannedWeekAhead ? 'Next week' : 'This week'}
            </span>
            {weekTotal > 0 && (
              <span className="planning-progress">{weekCompleted}/{weekTotal}</span>
            )}
          </div>
          <Chevron expanded={weekExpanded} />
        </button>

        {weekExpanded && (
          <div className="planning-section-body">
            {weekTotal === 0 ? (
              <p className="planning-empty">No weekly goals</p>
            ) : (
              weeklyGoals.map(goal => {
                const space = spaceMap[goal.space_id];
                const linkedIds = goal.linked_todo_ids?.length
                  ? goal.linked_todo_ids
                  : (goal.linked_todo_id ? [goal.linked_todo_id] : []);
                const linkedTodos = linkedIds.map(id => todoMap[id]).filter(Boolean);

                return (
                  <div key={goal.id} className={`planning-goal-row ${goal.completed ? 'done' : ''}`}>
                    <span className={`planning-task-check ${goal.completed ? 'checked' : ''}`}>
                      {goal.completed ? '✓' : '○'}
                    </span>
                    <div className="planning-goal-body">
                      <span className={`planning-goal-text ${goal.completed ? 'completed' : ''}`}>
                        {goal.goal_text}
                      </span>
                      {linkedTodos.map(todo => (
                        <button
                          key={todo.id}
                          type="button"
                          className={`planning-linked-task ${todo.status === 'done' ? 'done' : ''}`}
                          onClick={() => onOpenTask(todo.id)}
                        >
                          → {todo.text}
                        </button>
                      ))}
                    </div>
                    {space && (
                      <span
                        className="planning-task-space-dot"
                        style={{ background: space.color }}
                        title={space.name}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="planning-icon">
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M1.5 5.5H12.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M4.5 1V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M9.5 1V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="planning-icon">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="7" r="1" fill="currentColor"/>
    </svg>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      className="planning-chevron"
      style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
