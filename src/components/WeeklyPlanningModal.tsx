import { useState, useRef, useEffect } from 'react';
import type { Space, WeeklyGoal, AIWeeklyPlanResult, AIWeeklyPlanMapping, Todo } from '../types';
import { SparkleIcon } from './AIOnboarding';

interface WeeklyPlanningModalProps {
  spaces: Space[];
  lastWeekGoals: WeeklyGoal[];
  currentWeekGoals: WeeklyGoal[];
  todos: Todo[];
  result: AIWeeklyPlanResult | null;
  loading: boolean;
  error: string | null;
  isFirstTime: boolean;
  initialSpaceId?: string;
  onPlan: (objectives: Array<{ spaceId: string; spaceName: string; goals: string[] }>) => void;
  onAccept: () => Promise<void> | void;
  onDismiss: () => void;
  onSnooze?: () => void;
}

type Step = 'intro' | 'review' | 'goals' | 'results';

const PRIORITY_COLORS: Record<string, string> = {
  P0: '#FF5252',
  P1: '#FF9800',
  P2: '#4FC3F7',
  P3: '#81C784',
};

const WORK_PLACEHOLDERS = [
  'e.g., Kick off planning Q2',
  'e.g., Ship payments feature',
  'e.g., Close deal with Acme',
  'e.g., Prepare investor deck',
  'e.g., Team 1:1s and feedback',
];

const WORK_PLACEHOLDERS_ES = [
  'e.g., Kick off de planning Q2',
  'e.g., Cerrar deal con Acme',
  'e.g., Terminar el feature de pagos',
  'e.g., Preparar deck para inversionistas',
  'e.g., Hacer 1:1s con el team',
];

const PERSONAL_PLACEHOLDERS = [
  'e.g., Start running 3x a week',
  'e.g., Read 50 pages of my book',
  'e.g., Plan weekend trip',
  'e.g., Clean and organize apartment',
  'e.g., Call mom and catch up',
];

const PERSONAL_PLACEHOLDERS_ES = [
  'e.g., Empezar a correr 3x por semana',
  'e.g., Leer 50 páginas de mi libro',
  'e.g., Planear trip de fin de semana',
  'e.g., Limpiar y organizar el depa',
  'e.g., Llamar a mamá',
];

function getWeekLabel(): string {
  const now = new Date();
  const day = now.getDay();
  // On Sunday, plan for NEXT week (tomorrow's Monday)
  const monday = new Date(now);
  if (day === 0) {
    monday.setDate(now.getDate() + 1);
  } else {
    monday.setDate(now.getDate() - day + 1);
  }
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const lang = navigator.language?.startsWith('es') ? 'es' : 'en';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const monStr = monday.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', opts);
  const sunStr = sunday.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', opts);
  return `${monStr} – ${sunStr}`;
}

function getPlaceholder(index: number, spaceName: string, uncompletedGoals?: string[]): string {
  if (uncompletedGoals && uncompletedGoals[index]) {
    return uncompletedGoals[index];
  }
  const lang = navigator.language?.startsWith('es') ? 'es' : 'en';
  const isPersonal = spaceName.toLowerCase() === 'personal';
  const placeholders = isPersonal
    ? (lang === 'es' ? PERSONAL_PLACEHOLDERS_ES : PERSONAL_PLACEHOLDERS)
    : (lang === 'es' ? WORK_PLACEHOLDERS_ES : WORK_PLACEHOLDERS);
  return placeholders[index] || placeholders[0];
}

interface MappingGroup {
  goalPosition: number;
  goalText: string;
  spaceId: string;
  mappings: AIWeeklyPlanMapping[];
}

function groupMappingsByGoal(mappings: AIWeeklyPlanMapping[]): MappingGroup[] {
  const groups: MappingGroup[] = [];
  const seen = new Map<string, MappingGroup>();

  for (const m of mappings) {
    const key = `${m.spaceId}::${m.goalPosition}`;
    const existing = seen.get(key);
    if (existing) {
      existing.mappings.push(m);
    } else {
      const group: MappingGroup = {
        goalPosition: m.goalPosition,
        goalText: m.goalText,
        spaceId: m.spaceId,
        mappings: [m],
      };
      seen.set(key, group);
      groups.push(group);
    }
  }

  return groups;
}

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

function getStepIndex(step: Step, hasLastWeek: boolean, isFirstTime: boolean): number {
  if (step === 'intro') return 0;
  const offset = isFirstTime ? 1 : 0;
  if (step === 'review') return offset;
  if (step === 'goals') return offset + (hasLastWeek ? 1 : 0);
  return offset + (hasLastWeek ? 2 : 1);
}

function getTotalSteps(hasLastWeek: boolean, isFirstTime: boolean): number {
  return (isFirstTime ? 1 : 0) + (hasLastWeek ? 1 : 0) + 2;
}

export function WeeklyPlanningModal({
  spaces,
  lastWeekGoals,
  currentWeekGoals,
  todos,
  result,
  loading,
  error,
  isFirstTime,
  initialSpaceId,
  onPlan,
  onAccept,
  onDismiss,
  onSnooze,
}: WeeklyPlanningModalProps) {
  const lastWeekHadProgress = lastWeekGoals.length > 0 && lastWeekGoals.some(g => g.completed);
  const hasLastWeek = lastWeekHadProgress;
  const hasCurrentWeek = currentWeekGoals.length > 0;
  const [step, setStep] = useState<Step>(
    initialSpaceId ? 'goals' : isFirstTime ? 'intro' : hasLastWeek && !hasCurrentWeek ? 'review' : 'goals'
  );
  const [currentSpaceIndex, setCurrentSpaceIndex] = useState(() => {
    if (initialSpaceId) {
      const idx = spaces.findIndex(s => s.id === initialSpaceId);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });
  const [goalsMap, setGoalsMap] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const space of spaces) {
      // Pre-fill from current week goals if editing
      const existing = currentWeekGoals
        .filter(g => g.space_id === space.id)
        .sort((a, b) => a.position - b.position)
        .map(g => g.goal_text);
      if (existing.length > 0) {
        const filled = [...existing];
        while (filled.length < 5) filled.push('');
        map[space.id] = filled.slice(0, 5);
      } else {
        map[space.id] = ['', '', '', '', ''];
      }
    }
    return map;
  });
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const currentSpace = spaces[currentSpaceIndex];
  const todoMap = Object.fromEntries(todos.map(t => [t.id, t]));

  const uncompletedBySpace: Record<string, string[]> = {};
  for (const space of spaces) {
    uncompletedBySpace[space.id] = lastWeekGoals
      .filter(g => g.space_id === space.id && !g.completed)
      .map(g => g.goal_text);
  }

  useEffect(() => {
    if (step === 'goals' && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [step, currentSpaceIndex]);

  useEffect(() => {
    if (hasCurrentWeek || !hasLastWeek) return;
    const prefill: Record<string, string[]> = {};
    for (const space of spaces) {
      const spaceGoals = lastWeekGoals
        .filter(g => g.space_id === space.id && !g.completed)
        .map(g => g.goal_text);
      const filled = [...spaceGoals];
      while (filled.length < 5) filled.push('');
      prefill[space.id] = filled.slice(0, 5);
    }
    setGoalsMap(prev => {
      const merged = { ...prev };
      for (const [sid, goals] of Object.entries(prefill)) {
        if (goals.some(g => g.length > 0)) {
          merged[sid] = goals;
        }
      }
      return merged;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoalChange = (spaceId: string, index: number, value: string) => {
    setGoalsMap(prev => {
      const arr = [...(prev[spaceId] || ['', '', '', '', ''])];
      arr[index] = value;
      return { ...prev, [spaceId]: arr };
    });
  };

  const scrollToTop = () => {
    const el = document.querySelector('.ai-onboarding-step-scroll');
    if (el) el.scrollTop = 0;
  };

  const handleNextSpace = () => {
    if (currentSpaceIndex < spaces.length - 1) {
      setSlideDir('left');
      setAnimKey(k => k + 1);
      setCurrentSpaceIndex(i => i + 1);
      scrollToTop();
    } else {
      handleSubmitGoals();
    }
  };

  const handlePrevSpace = () => {
    if (currentSpaceIndex > 0) {
      setSlideDir('right');
      setAnimKey(k => k + 1);
      setCurrentSpaceIndex(i => i - 1);
      scrollToTop();
    } else if (hasLastWeek) {
      setStep('review');
    } else if (isFirstTime) {
      setStep('intro');
    }
  };

  const handleSubmitGoals = () => {
    const objectives = spaces
      .map(space => ({
        spaceId: space.id,
        spaceName: space.name,
        goals: (goalsMap[space.id] || []).filter(g => g.trim().length > 0),
      }))
      .filter(o => o.goals.length > 0);

    if (objectives.length === 0) return;
    setStep('results');
    onPlan(objectives);
  };

  const currentGoals = goalsMap[currentSpace?.id] || ['', '', '', '', ''];
  const anyGoalsFilled = Object.values(goalsMap).some(arr => arr.some(g => g.trim().length > 0));

  const lastWeekBySpace = spaces.map(s => ({
    space: s,
    goals: lastWeekGoals.filter(g => g.space_id === s.id),
  })).filter(x => x.goals.length > 0);
  const lastWeekCompleted = lastWeekGoals.filter(g => g.completed).length;
  const lastWeekTotal = lastWeekGoals.length;

  const totalSteps = getTotalSteps(hasLastWeek, isFirstTime);
  const currentStepIndex = getStepIndex(step, hasLastWeek, isFirstTime);

  return (
    <div className="ai-onboarding-overlay" onClick={onDismiss}>
      <div className="ai-onboarding-modal" onClick={e => e.stopPropagation()}>
        <button className="ai-onboarding-close" onClick={onDismiss}>
          <CloseIcon />
        </button>

        {/* Progress dots */}
        <div className="ai-onboarding-progress">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`ai-progress-dot ${i === currentStepIndex ? 'active' : ''} ${i < currentStepIndex ? 'done' : ''}`}
            />
          ))}
        </div>

        {/* STEP: Intro (first time only) */}
        {step === 'intro' && (
          <div className="ai-onboarding-step">
            <div className="ai-onboarding-icon">
              <SparkleIcon size={32} />
            </div>
            <h2 className="ai-onboarding-title">Weekly Planning</h2>
            <p className="ai-onboarding-subtitle">
              Set your weekly goals and let AI turn them into actionable tasks.
            </p>
            <p className="ai-onboarding-hint">
              Week of {getWeekLabel()} · ~2 min
            </p>
            <button
              className="ai-onboarding-btn primary ai-onboarding-btn-intro"
              onClick={() => setStep(hasLastWeek ? 'review' : 'goals')}
            >
              Let's plan
            </button>
            {onSnooze && (
              <button className="weekly-planning-snooze" onClick={onSnooze}>
                Remind me later
              </button>
            )}
          </div>
        )}

        {/* STEP: Last Week Review */}
        {step === 'review' && (
          <div className="ai-onboarding-step">
            <h2 className="ai-onboarding-title" style={{ fontSize: '16px', marginBottom: '2px' }}>Last week</h2>
            <p className="ai-onboarding-subtitle" style={{ marginBottom: '8px' }}>
              {lastWeekCompleted}/{lastWeekTotal} goals completed
            </p>

            <div className="weekly-review-progress" style={{ marginBottom: '8px' }}>
              <div className="weekly-review-bar">
                <div
                  className="weekly-review-bar-fill"
                  style={{ width: `${lastWeekTotal > 0 ? (lastWeekCompleted / lastWeekTotal) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="ai-onboarding-step-scroll">
              <div className="weekly-review-list">
                {lastWeekBySpace.map(({ space, goals }) => (
                  <div key={space.id} className="weekly-review-space">
                    <div className="weekly-review-space-header">
                      <div className="weekly-space-dot" style={{ background: space.color }} />
                      <span>{space.name}</span>
                    </div>
                    {goals.map(g => (
                      <div key={g.id} className={`weekly-review-goal ${g.completed ? 'completed' : ''}`}>
                        <div className={`weekly-review-check ${g.completed ? 'done' : ''}`}>
                          {g.completed ? '✓' : '○'}
                        </div>
                        <span>{g.goal_text}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="ai-onboarding-nav">
              <button className="ai-onboarding-btn primary" onClick={() => { setStep('goals'); setCurrentSpaceIndex(0); }}>
                Plan this week
              </button>
            </div>
            {onSnooze && (
              <button className="weekly-planning-snooze" onClick={onSnooze}>
                Remind me later
              </button>
            )}
          </div>
        )}

        {/* STEP: Goals Input per Space */}
        {step === 'goals' && currentSpace && (
          <div className="ai-onboarding-step">
            <div
              key={animKey}
              className={`ai-space-slide ${slideDir === 'left' ? 'slide-in-left' : slideDir === 'right' ? 'slide-in-right' : ''}`}
            >
              <div className="ai-onboarding-space-header">
                <div className="ai-onboarding-space-dot" style={{ background: currentSpace.color }} />
                <span className="ai-onboarding-space-name">{currentSpace.name}</span>
                <span className="ai-onboarding-space-counter">
                  {currentSpaceIndex + 1} / {spaces.length}
                </span>
              </div>
              <h2 className="ai-onboarding-title" style={{ fontSize: '16px' }}>
                What do you want to achieve?
              </h2>
              <p className="ai-onboarding-subtitle">
                Week of {getWeekLabel()}
              </p>

              <div className="ai-onboarding-step-scroll">
                <div className="weekly-goals-inputs">
                  {currentGoals.map((goal, i) => (
                    <div key={i} className="weekly-goal-row">
                      <span className="weekly-goal-number">{i + 1}</span>
                      <input
                        ref={el => { inputRefs.current[i] = el; }}
                        type="text"
                        className="weekly-goal-input"
                        placeholder={getPlaceholder(i, currentSpace.name, uncompletedBySpace[currentSpace.id])}
                        value={goal}
                        onChange={e => handleGoalChange(currentSpace.id, i, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && i < 4) {
                            inputRefs.current[i + 1]?.focus();
                          } else if (e.key === 'Enter' && i === 4) {
                            handleNextSpace();
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="ai-onboarding-nav">
              <button className="ai-onboarding-btn secondary" onClick={handlePrevSpace}>
                Back
              </button>
              <button
                className="ai-onboarding-btn primary"
                onClick={handleNextSpace}
                disabled={!anyGoalsFilled && currentSpaceIndex === spaces.length - 1}
              >
                {currentSpaceIndex < spaces.length - 1 ? 'Next space' : 'Plan my week'}
              </button>
            </div>
            {onSnooze && (
              <button className="weekly-planning-snooze" onClick={onSnooze}>
                Remind me later
              </button>
            )}
          </div>
        )}

        {/* STEP: Results */}
        {step === 'results' && (
          <div className="ai-onboarding-step">
            {loading ? (
              <div className="ai-rec-loading">
                <div className="ai-rec-loading-icon">
                  <SparkleIcon size={40} />
                </div>
                <h2 className="ai-rec-loading-title">Planning your week...</h2>
                <p className="ai-rec-loading-subtitle">
                  Mapping objectives to concrete tasks
                </p>
                <div className="ai-rec-loading-bar">
                  <div className="ai-rec-loading-bar-fill" />
                </div>
              </div>
            ) : error ? (
              <div className="ai-rec-error">
                <div className="ai-rec-error-icon">⚠️</div>
                <h2 className="ai-rec-error-title">Couldn't plan your week</h2>
                <p className="ai-rec-error-msg">{error}</p>
                <button className="ai-onboarding-btn primary ai-onboarding-btn-intro" onClick={onDismiss}>
                  Close
                </button>
              </div>
            ) : result ? (
              <>
                <div className="ai-rec-header" style={{ padding: '0 0 4px' }}>
                  <SparkleIcon size={20} />
                  <h2 className="ai-rec-title" style={{ fontSize: '16px' }}>Your weekly plan</h2>
                </div>

                <div className="ai-onboarding-step-scroll" style={{ textAlign: 'left' }}>
                  <p className="ai-rec-summary" style={{ marginBottom: '12px' }}>{result.summary}</p>

                  <div className="weekly-mappings">
                    {groupMappingsByGoal(result.mappings).map((group) => {
                      const space = spaces.find(s => s.id === group.spaceId);
                      return (
                        <div key={`${group.spaceId}-${group.goalPosition}`} className="weekly-mapping-item">
                          <div className="weekly-mapping-objective">
                            <div className="weekly-mapping-num">{group.goalPosition}</div>
                            <div className="weekly-mapping-obj-body">
                              <span className="weekly-mapping-obj-text">{group.goalText}</span>
                              {space && (
                                <span className="weekly-mapping-space" style={{ color: space.color }}>
                                  {space.name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="weekly-mapping-arrow">→</div>
                          <div className="weekly-mapping-tasks">
                            {group.mappings.map((m, j) => {
                              const existingTodo = m.todoId ? todoMap[m.todoId] : null;
                              return (
                                <div key={j} className="weekly-mapping-task">
                                  <span className={`weekly-mapping-badge ${m.action === 'create_new' ? 'new' : 'existing'}`}>
                                    {m.action === 'create_new' ? 'New task' : 'Existing task'}
                                  </span>
                                  <span className="weekly-mapping-task-name">
                                    {m.action === 'create_new' ? m.newTaskName : existingTodo?.text || m.newTaskName}
                                  </span>
                                  <div className="weekly-mapping-meta">
                                    <span
                                      className="weekly-mapping-priority"
                                      style={{ background: PRIORITY_COLORS[m.newPriority] + '22', color: PRIORITY_COLORS[m.newPriority] }}
                                    >
                                      {m.newPriority}
                                    </span>
                                    {m.newDueDate && (
                                      <span className="weekly-mapping-eta">
                                        {formatShortDate(m.newDueDate)}
                                      </span>
                                    )}
                                  </div>
                                  <p className="weekly-mapping-rationale">{m.rationale}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {result.reprioritizations.length > 0 && (
                    <div className="weekly-repri-section">
                      <h3 className="weekly-repri-title">Other adjustments</h3>
                      {result.reprioritizations.slice(0, 5).map(r => {
                        const todo = todoMap[r.todoId];
                        if (!todo) return null;
                        return (
                          <div key={r.todoId} className="weekly-repri-item">
                            <span className="weekly-repri-text">{todo.text}</span>
                            <span
                              className="weekly-mapping-priority"
                              style={{ background: PRIORITY_COLORS[r.newPriority] + '22', color: PRIORITY_COLORS[r.newPriority] }}
                            >
                              {r.newPriority}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="ai-onboarding-nav">
                  <button className="ai-onboarding-btn secondary" onClick={onDismiss} disabled={accepting}>
                    Dismiss
                  </button>
                  <button
                    className={`ai-onboarding-btn primary ${accepting ? 'accepting' : ''}`}
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
              </>
            ) : null}
          </div>
        )}
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
