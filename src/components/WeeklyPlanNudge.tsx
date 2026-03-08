interface WeeklyPlanNudgeProps {
  onPlan: () => void;
}

export function WeeklyPlanNudge({ onPlan }: WeeklyPlanNudgeProps) {
  return (
    <button className="weekly-nudge" onClick={onPlan}>
      <div className="weekly-nudge-left">
        <TargetIcon />
        <div className="weekly-nudge-text">
          <span className="weekly-nudge-title">Plan your week</span>
          <span className="weekly-nudge-desc">Set goals to stay focused and let AI help prioritize.</span>
        </div>
      </div>
      <span className="weekly-nudge-arrow">→</span>
    </button>
  );
}

function TargetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" className="weekly-nudge-icon">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="7" r="1" fill="currentColor"/>
    </svg>
  );
}
