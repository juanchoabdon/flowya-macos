import { SparkleIcon } from './AIOnboarding';

interface WeeklyPlanNudgeProps {
  onPlan: () => void;
}

export function WeeklyPlanNudge({ onPlan }: WeeklyPlanNudgeProps) {
  return (
    <button className="weekly-nudge" onClick={onPlan}>
      <div className="weekly-nudge-left">
        <span className="weekly-nudge-icon"><SparkleIcon size={16} /></span>
        <div className="weekly-nudge-text">
          <span className="weekly-nudge-title">Plan your week</span>
          <span className="weekly-nudge-desc">Set goals to stay focused and let AI help prioritize.</span>
        </div>
      </div>
      <span className="weekly-nudge-arrow">→</span>
    </button>
  );
}
