import { useEffect, useRef, useState } from 'react';
import { PlanningPanel } from './PlanningPanel';
import type { DailyPlanView, Space, Todo, WeeklyGoal } from '../types';

interface PlanningPopoverProps {
  weeklyGoals: WeeklyGoal[];
  dailyPlan: DailyPlanView;
  spaces: Space[];
  todos: Todo[];
  onOpenTask: (todoId: string) => void;
  showsPlannedWeekAhead?: boolean;
}

export function PlanningPopover({
  weeklyGoals,
  dailyPlan,
  spaces,
  todos,
  onOpenTask,
  showsPlannedWeekAhead = false,
}: PlanningPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hasToday = dailyPlan.items.length > 0;
  const hasWeek = weeklyGoals.length > 0;
  const hasContent = hasToday || hasWeek;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleOpenTask = (todoId: string) => {
    onOpenTask(todoId);
    setOpen(false);
  };

  return (
    <div className="planning-popover-root" ref={rootRef}>
      <button
        type="button"
        className={`planning-trigger ${open ? 'active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Today & this week"
        aria-label="Today and weekly plan"
        aria-expanded={open}
      >
        <TargetIcon />
        {hasContent && <span className="planning-trigger-dot" aria-hidden />}
      </button>

      {open && (
        <div className="planning-popover">
          <PlanningPanel
            weeklyGoals={weeklyGoals}
            dailyPlan={dailyPlan}
            spaces={spaces}
            todos={todos}
            onOpenTask={handleOpenTask}
            variant="popover"
            showsPlannedWeekAhead={showsPlannedWeekAhead}
          />
        </div>
      )}
    </div>
  );
}

function TargetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="7" r="1" fill="currentColor"/>
    </svg>
  );
}
