import { useState } from 'react';
import type { AIRenameResult, AIRenameSuggestion } from '../types';
import { SparkleIcon } from './AIOnboarding';

interface AIRenameModalProps {
  result: AIRenameResult | null;
  loading: boolean;
  error?: string | null;
  onAccept: (selected: AIRenameSuggestion[]) => Promise<void> | void;
  onDismiss: () => void;
}

export function AIRenameModal({
  result,
  loading,
  error,
  onAccept,
  onDismiss,
}: AIRenameModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  if (result && !initialized) {
    setSelected(new Set(result.suggestions.map(s => s.todoId)));
    setInitialized(true);
  }

  const toggleItem = (todoId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
  };

  const handleAccept = async () => {
    if (!result) return;
    setAccepting(true);
    const items = result.suggestions.filter(s => selected.has(s.todoId));
    await onAccept(items);
  };

  return (
    <div className="ai-rename-overlay" onClick={onDismiss}>
      <div className="ai-rename-modal" onClick={e => e.stopPropagation()}>
        <button className="ai-rec-close" onClick={onDismiss}>
          <CloseIcon />
        </button>

        {loading ? (
          <div className="ai-rec-loading">
            <div className="ai-rec-loading-icon">
              <SparkleIcon size={40} />
            </div>
            <h2 className="ai-rec-loading-title">Sharpening your task names...</h2>
            <p className="ai-rec-loading-subtitle">Making every task an actionable step</p>
            <div className="ai-rec-loading-bar">
              <div className="ai-rec-loading-bar-fill" />
            </div>
          </div>
        ) : error ? (
          <div className="ai-rec-error">
            <div className="ai-rec-error-icon">⚠️</div>
            <h2 className="ai-rec-error-title">Couldn't analyze tasks</h2>
            <p className="ai-rec-error-msg">{error}</p>
            <button className="ai-onboarding-btn primary ai-onboarding-btn-intro" onClick={onDismiss}>
              Close
            </button>
          </div>
        ) : result ? (
          <div className="ai-rec-content">
            <div className="ai-rec-header">
              <SparkleIcon size={24} />
              <h2 className="ai-rec-title">Sharper task names</h2>
            </div>

            <div className="ai-rec-scrollable">
              <p className="ai-rec-summary">{result.summary}</p>

              {result.suggestions.length === 0 ? (
                <div className="ai-rename-empty">
                  <p>All your task names are already clear and actionable. Nice work!</p>
                </div>
              ) : (
                <div className="ai-rename-list">
                  {result.suggestions.map((s: AIRenameSuggestion) => {
                    const isSelected = selected.has(s.todoId);
                    return (
                      <button
                        key={s.todoId}
                        className={`ai-rename-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleItem(s.todoId)}
                      >
                        <div className="ai-rename-check">
                          {isSelected ? <CheckIcon /> : <EmptyCheck />}
                        </div>
                        <div className="ai-rename-item-body">
                          <span className="ai-rename-old">{s.currentName}</span>
                          <span className="ai-rename-arrow">→</span>
                          <span className="ai-rename-new">{s.newName}</span>
                          <span className="ai-rename-reason">{s.rationale}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ai-rec-actions">
              <button className="ai-rec-btn dismiss" onClick={onDismiss} disabled={accepting}>
                Dismiss
              </button>
              {result.suggestions.length > 0 && (
                <button
                  className={`ai-rec-btn accept ${accepting ? 'accepting' : ''}`}
                  disabled={accepting || selected.size === 0}
                  onClick={handleAccept}
                >
                  {accepting ? (
                    <>
                      <span className="ai-rec-spinner" />
                      Applying...
                    </>
                  ) : (
                    `Rename ${selected.size} task${selected.size !== 1 ? 's' : ''}`
                  )}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="3" fill="#FFD54F" stroke="#FFD54F" strokeWidth="1.5"/>
      <path d="M4.5 8L7 10.5L11.5 5.5" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function EmptyCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
    </svg>
  );
}
