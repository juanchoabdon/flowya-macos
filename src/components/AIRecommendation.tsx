import { useState } from 'react';
import type { AIAnalysisResult, AIRecommendation as AIRec, Todo, Space } from '../types';
import { SparkleIcon } from './AIOnboarding';

interface AIRecommendationProps {
  result: AIAnalysisResult | null;
  loading: boolean;
  error?: string | null;
  todos: Todo[];
  spaces: Space[];
  scope: 'all' | string;
  onAccept: () => Promise<void> | void;
  onDismiss: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: '#FF5252',
  P1: '#FF9800',
  P2: '#4FC3F7',
  P3: '#81C784',
};

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays <= 6) {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getPriorityLabel(p: string): string {
  switch (p) {
    case 'P0': return 'Critical';
    case 'P1': return 'High';
    case 'P2': return 'Medium';
    case 'P3': return 'Low';
    default: return p;
  }
}

export function AIRecommendation({
  result,
  loading,
  error,
  todos,
  spaces,
  scope,
  onAccept,
  onDismiss,
}: AIRecommendationProps) {
  const [accepting, setAccepting] = useState(false);
  const spaceMap = Object.fromEntries(spaces.map(s => [s.id, s]));
  const todoMap = Object.fromEntries(todos.map(t => [t.id, t]));

  const scopeLabel = scope === 'all'
    ? 'All spaces'
    : spaceMap[scope]?.name || 'Current space';

  const keepRecs = result?.recommendations.filter(r => r.action === 'keep') || [];
  const archiveRecs = result?.recommendations.filter(r => r.action === 'archive') || [];

  return (
    <div className="ai-rec-overlay" onClick={onDismiss}>
      <div className="ai-rec-modal" onClick={e => e.stopPropagation()}>
        <button className="ai-rec-close" onClick={onDismiss}>
          <CloseIcon />
        </button>

        {loading ? (
          <div className="ai-rec-loading">
            <div className="ai-rec-loading-icon">
              <SparkleIcon size={40} />
            </div>
            <h2 className="ai-rec-loading-title">Analyzing your tasks...</h2>
            <p className="ai-rec-loading-subtitle">
              Thinking like a {scopeLabel.toLowerCase() === 'all spaces' ? 'productivity expert' : `pro in ${scopeLabel}`}
            </p>
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
              <h2 className="ai-rec-title">Here's your game plan</h2>
            </div>
            <p className="ai-rec-scope">Analyzing: {scopeLabel}</p>

            <div className="ai-rec-scrollable">
              <p className="ai-rec-summary">{result.summary}</p>

              {/* Prioritized tasks */}
              <div className="ai-rec-list">
                {keepRecs.map((rec: AIRec) => {
                  const todo = todoMap[rec.todoId];
                  if (!todo) return null;
                  const space = spaceMap[todo.space_id];
                  const priorityChanged = todo.priority !== rec.newPriority;
                  const etaChanged = rec.newDueDate && rec.newDueDate !== todo.due_date;
                  return (
                    <div key={rec.todoId} className="ai-rec-item">
                      <div className="ai-rec-rank">{rec.rank}</div>
                      <div className="ai-rec-item-body">
                        <div className="ai-rec-item-header">
                          <span className="ai-rec-item-text">{todo.text}</span>
                          {scope === 'all' && space && (
                            <span className="ai-rec-item-space" style={{ color: space.color }}>
                              {space.name}
                            </span>
                          )}
                        </div>
                        <div className="ai-rec-item-meta">
                          <span
                            className="ai-rec-priority"
                            style={{ background: PRIORITY_COLORS[rec.newPriority] + '22', color: PRIORITY_COLORS[rec.newPriority] }}
                          >
                            {rec.newPriority} {getPriorityLabel(rec.newPriority)}
                            {priorityChanged && (
                              <span className="ai-rec-priority-change"> (was {todo.priority})</span>
                            )}
                          </span>
                          {etaChanged && (
                            <span className="ai-rec-eta">
                              📅 {formatShortDate(rec.newDueDate!)}
                            </span>
                          )}
                        </div>
                        <p className="ai-rec-rationale">{rec.rationale}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Archive suggestions */}
              {archiveRecs.length > 0 && (
                <div className="ai-rec-archive-section">
                  <h3 className="ai-rec-archive-title">Suggested to archive</h3>
                  <p className="ai-rec-archive-hint">These tasks seem stale or already done</p>
                  {archiveRecs.map((rec: AIRec) => {
                    const todo = todoMap[rec.todoId];
                    if (!todo) return null;
                    return (
                      <div key={rec.todoId} className="ai-rec-archive-item">
                        <span className="ai-rec-archive-text">{todo.text}</span>
                        <span className="ai-rec-archive-reason">{rec.rationale}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions - fixed at bottom */}
            <div className="ai-rec-actions">
              <button className="ai-rec-btn dismiss" onClick={onDismiss} disabled={accepting}>
                Dismiss
              </button>
              <button
                className={`ai-rec-btn accept ${accepting ? 'accepting' : ''}`}
                disabled={accepting}
                onClick={async () => {
                  setAccepting(true);
                  await onAccept();
                }}
              >
                {accepting ? (
                  <>
                    <span className="ai-rec-spinner" />
                    Applying...
                  </>
                ) : (
                  'Accept & Apply'
                )}
              </button>
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
