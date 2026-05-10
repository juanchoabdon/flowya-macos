import { SparkleIcon } from './AIOnboarding';

interface AIHubModalProps {
  onPrioritize: () => void;
  onRename: () => void;
  onDuplicates: () => void;
  onClose: () => void;
}

export function AIHubModal({ onPrioritize, onRename: _onRename, onDuplicates, onClose }: AIHubModalProps) {
  return (
    <div className="ai-hub-overlay" onClick={onClose}>
      <div className="ai-hub-modal" onClick={e => e.stopPropagation()}>
        <button className="ai-hub-close" onClick={onClose}>
          <CloseIcon />
        </button>

        <div className="ai-hub-header">
          <SparkleIcon size={24} />
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

          <button className="ai-hub-card" onClick={onDuplicates}>
            <div className="ai-hub-card-icon">
              <DuplicatesIcon />
            </div>
            <div className="ai-hub-card-body">
              <span className="ai-hub-card-title">Remove duplicates</span>
              <span className="ai-hub-card-desc">Find and merge duplicate tasks across spaces</span>
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

function DuplicatesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
      <path d="M6 8L8 10L12 6" stroke="#FF5252" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
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
