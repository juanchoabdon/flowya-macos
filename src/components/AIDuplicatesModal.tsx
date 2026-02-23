import { useState } from 'react';
import type { AIDuplicatesResult, Todo, Space } from '../types';
import { SparkleIcon } from './AIOnboarding';

interface AIDuplicatesModalProps {
  result: AIDuplicatesResult | null;
  loading: boolean;
  error: string | null;
  todos: Todo[];
  spaces: Space[];
  onAccept: (removeTodoIds: string[]) => Promise<void> | void;
  onDismiss: () => void;
}

export function AIDuplicatesModal({
  result,
  loading,
  error,
  todos,
  spaces,
  onAccept,
  onDismiss,
}: AIDuplicatesModalProps) {
  const [accepting, setAccepting] = useState(false);

  const todoMap = Object.fromEntries(todos.map(t => [t.id, t]));
  const spaceMap = Object.fromEntries(spaces.map(s => [s.id, s]));

  const totalToRemove = result?.groups.reduce((n, g) => n + g.removeTodoIds.length, 0) || 0;
  const noDuplicates = result && result.groups.length === 0;

  return (
    <div className="ai-onboarding-overlay" onClick={onDismiss}>
      <div className="ai-onboarding-modal" onClick={e => e.stopPropagation()}>
        <button className="ai-onboarding-close" onClick={onDismiss}>
          <CloseIcon />
        </button>

        <div className="ai-onboarding-progress">
          <div className="ai-progress-dot active" />
        </div>

        <div className="ai-onboarding-step">
          {loading ? (
            <div className="ai-rec-loading">
              <div className="ai-rec-loading-icon">
                <SparkleIcon size={40} />
              </div>
              <h2 className="ai-rec-loading-title">Scanning for duplicates...</h2>
              <p className="ai-rec-loading-subtitle">
                Comparing tasks across spaces and languages
              </p>
              <div className="ai-rec-loading-bar">
                <div className="ai-rec-loading-bar-fill" />
              </div>
            </div>
          ) : error ? (
            <div className="ai-rec-error">
              <div className="ai-rec-error-icon">⚠️</div>
              <h2 className="ai-rec-error-title">Couldn't scan for duplicates</h2>
              <p className="ai-rec-error-msg">{error}</p>
              <button className="ai-onboarding-btn primary ai-onboarding-btn-intro" onClick={onDismiss}>
                Close
              </button>
            </div>
          ) : noDuplicates ? (
            <div className="ai-rec-loading">
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>✅</div>
              <h2 className="ai-rec-loading-title">No duplicates found</h2>
              <p className="ai-rec-loading-subtitle">{result.summary}</p>
              <button
                className="ai-onboarding-btn primary ai-onboarding-btn-intro"
                style={{ marginTop: '16px' }}
                onClick={onDismiss}
              >
                Nice!
              </button>
            </div>
          ) : result ? (
            <>
              <div className="ai-rec-header" style={{ padding: '0 0 4px' }}>
                <SparkleIcon size={20} />
                <h2 className="ai-rec-title" style={{ fontSize: '16px' }}>
                  {totalToRemove} duplicate{totalToRemove !== 1 ? 's' : ''} found
                </h2>
              </div>

              <div className="ai-onboarding-step-scroll" style={{ textAlign: 'left' }}>
                <p className="ai-rec-summary" style={{ marginBottom: '12px' }}>{result.summary}</p>

                <div className="dup-groups">
                  {result.groups.map((group, i) => {
                    const keepTodo = todoMap[group.keepTodoId];
                    const keepSpace = keepTodo ? spaceMap[keepTodo.space_id] : null;

                    return (
                      <div key={i} className="dup-group">
                        <div className="dup-keep">
                          <span className="dup-badge keep">Keep</span>
                          <span className="dup-task-name">{keepTodo?.text || group.keepTodoId}</span>
                          {keepSpace && (
                            <span className="dup-space" style={{ color: keepSpace.color }}>
                              {keepSpace.name}
                            </span>
                          )}
                        </div>
                        {group.removeTodoIds.map(id => {
                          const todo = todoMap[id];
                          const space = todo ? spaceMap[todo.space_id] : null;
                          return (
                            <div key={id} className="dup-remove">
                              <span className="dup-badge remove">Remove</span>
                              <span className="dup-task-name strikethrough">
                                {todo?.text || id}
                              </span>
                              {space && (
                                <span className="dup-space" style={{ color: space.color }}>
                                  {space.name}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        <p className="dup-reason">{group.reason}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="ai-onboarding-nav">
                <button className="ai-onboarding-btn secondary" onClick={onDismiss} disabled={accepting}>
                  Cancel
                </button>
                <button
                  className={`ai-onboarding-btn primary ${accepting ? 'accepting' : ''}`}
                  disabled={accepting}
                  onClick={async () => {
                    setAccepting(true);
                    const allRemoveIds = result.groups.flatMap(g => g.removeTodoIds);
                    await onAccept(allRemoveIds);
                  }}
                >
                  {accepting ? (
                    <>
                      <span className="ai-rec-spinner" />
                      Removing...
                    </>
                  ) : (
                    `Remove ${totalToRemove} duplicate${totalToRemove !== 1 ? 's' : ''}`
                  )}
                </button>
              </div>
            </>
          ) : null}
        </div>
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
