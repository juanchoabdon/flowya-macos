import { SparkleIcon } from './AIOnboarding';

interface AIHubModalProps {
  onPrioritize: () => void;
  onRename: () => void;
  onClose: () => void;
}

export function AIHubModal({ onPrioritize, onRename, onClose }: AIHubModalProps) {
  return (
    <div className="ai-hub-overlay" onClick={onClose}>
      <div className="ai-hub-modal" onClick={e => e.stopPropagation()}>
        <button className="ai-hub-close" onClick={onClose}>
          <CloseIcon />
        </button>

        <div className="ai-hub-header">
          <SparkleIcon size={32} />
          <h2 className="ai-hub-title">AI Boost</h2>
          <p className="ai-hub-subtitle">What would you like to improve?</p>
        </div>

        <div className="ai-hub-cards">
          <button className="ai-hub-card" onClick={onPrioritize}>
            <div className="ai-hub-card-icon">
              <PrioritizeIcon />
            </div>
            <div className="ai-hub-card-body">
              <span className="ai-hub-card-title">Prioritize tasks</span>
              <span className="ai-hub-card-desc">Reorder, reprioritize, and clean up done tasks</span>
            </div>
            <ChevronRight />
          </button>

          <button className="ai-hub-card" onClick={onRename}>
            <div className="ai-hub-card-icon">
              <RenameIcon />
            </div>
            <div className="ai-hub-card-body">
              <span className="ai-hub-card-title">Sharpen task names</span>
              <span className="ai-hub-card-desc">Rewrite vague tasks into concrete actions</span>
            </div>
            <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function PrioritizeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 5H17M3 10H13M3 15H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="16" cy="12" r="2" fill="#FFD54F" opacity="0.8"/>
      <circle cx="12" cy="16" r="1.5" fill="#FF6B9D" opacity="0.6"/>
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M11.5 3.5L16.5 8.5L7.5 17.5H2.5V12.5L11.5 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.5 5.5L14.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ai-hub-chevron">
      <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
