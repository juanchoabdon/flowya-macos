import { useState, useEffect } from 'react';
import type { Space, Todo } from '../types';
import { SPACE_COLORS } from '../types';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaces: Space[];
  onCreateSpace: (name: string) => Promise<Space | null>;
  onDeleteSpace: (id: string) => Promise<boolean>;
  onSaveAIProfile: (roles: Record<string, string>, context: string) => Promise<void>;
  onCreateTodo: (text: string, spaceId?: string) => Promise<Todo | null>;
}

const WORK_PRESETS: Record<string, string[]> = {
  'Tech Leadership': ['CEO', 'Founder', 'Co-Founder', 'CTO', 'VP of Product', 'VP of Engineering', 'Engineering Manager', 'Director of Product', 'Tech Lead'],
  'Product': ['Product Manager', 'Product Designer', 'Lead Product Designer', 'UX Researcher', 'Product Analyst'],
  'Engineering': ['Software Engineer', 'Senior Engineer', 'Staff Engineer', 'Data Engineer', 'Frontend Dev', 'Full Stack Dev'],
};

const PERSONAL_PRESETS: Record<string, string[]> = {
  'Personal': ['Dad', 'Mom', 'Future Dad', 'Future Mom', 'Husband', 'Wife', 'Living My Best Life', 'Student', 'Freelancer', 'Entrepreneur', 'Side Project'],
};

const PERSONAL_KEYWORDS = ['personal', 'home', 'family', 'life', 'casa', 'hogar', 'familia', 'personal life'];

const SPACE_SUGGESTIONS = ['Work', 'Personal', 'Side Project', 'Health', 'Learning', 'Finance'];

function getPresetsForSpace(spaceName: string): Record<string, string[]> {
  const name = spaceName.toLowerCase().trim();
  if (PERSONAL_KEYWORDS.some(kw => name.includes(kw))) return PERSONAL_PRESETS;
  return WORK_PRESETS;
}

const TOTAL_STEPS = 5; // Welcome, Spaces, Roles, Context, First Task

export function OnboardingModal({
  isOpen,
  onClose,
  spaces,
  onCreateSpace,
  onDeleteSpace,
  onSaveAIProfile,
  onCreateTodo,
}: OnboardingModalProps) {
  const [step, setStep] = useState(0);

  // Spaces step
  const [createdSpaceNames, setCreatedSpaceNames] = useState<string[]>([]);
  const [customSpaceName, setCustomSpaceName] = useState('');
  const [creatingSpace, setCreatingSpace] = useState(false);

  // Roles step
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [currentSpaceIndex, setCurrentSpaceIndex] = useState(0);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [animKey, setAnimKey] = useState(0);

  // Context step
  const [context, setContext] = useState('');

  // Task step
  const [taskText, setTaskText] = useState('');
  const [taskSpaceId, setTaskSpaceId] = useState('');
  const [taskCreated, setTaskCreated] = useState(false);
  const [saving, setSaving] = useState(false);

  // Set default task space when spaces become available
  useEffect(() => {
    if (spaces.length > 0 && !taskSpaceId) {
      setTaskSpaceId(spaces[0].id);
    }
  }, [spaces, taskSpaceId]);

  if (!isOpen) return null;

  const currentSpace = spaces[currentSpaceIndex];
  const currentRoles = currentSpace ? (roles[currentSpace.id] || []) : [];
  const canProceedRole = currentRoles.length > 0;

  // -- Spaces step handlers --
  const handleToggleSuggestedSpace = async (name: string) => {
    if (creatingSpace) return;
    const existing = spaces.find(s => s.name === name);
    if (existing) {
      setCreatingSpace(true);
      await onDeleteSpace(existing.id);
      setCreatedSpaceNames(prev => prev.filter(n => n !== name));
      setCreatingSpace(false);
    } else {
      setCreatingSpace(true);
      const space = await onCreateSpace(name);
      if (space) {
        setCreatedSpaceNames(prev => [...prev, name]);
        if (!taskSpaceId) setTaskSpaceId(space.id);
      }
      setCreatingSpace(false);
    }
  };

  const handleAddCustomSpace = async () => {
    const name = customSpaceName.trim();
    if (!name || createdSpaceNames.includes(name) || creatingSpace) return;
    setCreatingSpace(true);
    const space = await onCreateSpace(name);
    if (space) {
      setCreatedSpaceNames(prev => [...prev, name]);
      if (!taskSpaceId) setTaskSpaceId(space.id);
    }
    setCustomSpaceName('');
    setCreatingSpace(false);
  };

  // -- Roles step handlers --
  const handleToggleRole = (spaceId: string, role: string) => {
    setRoles(prev => {
      const current = prev[spaceId] || [];
      if (current.includes(role)) {
        return { ...prev, [spaceId]: current.filter(r => r !== role) };
      }
      return { ...prev, [spaceId]: [...current, role] };
    });
  };

  const handleCustomRole = (spaceId: string, value: string) => {
    setCustomInputs(prev => ({ ...prev, [spaceId]: value }));
  };

  const handleAddCustomRole = (spaceId: string) => {
    const value = (customInputs[spaceId] || '').trim();
    if (value && !(roles[spaceId] || []).includes(value)) {
      setRoles(prev => ({ ...prev, [spaceId]: [...(prev[spaceId] || []), value] }));
      setCustomInputs(prev => ({ ...prev, [spaceId]: '' }));
    }
  };

  const scrollToTop = () => {
    const scrollEl = document.querySelector('.onboarding-step-scroll');
    if (scrollEl) scrollEl.scrollTop = 0;
  };

  const handleNextSpace = () => {
    if (currentSpaceIndex < spaces.length - 1) {
      setSlideDir('left');
      setAnimKey(k => k + 1);
      setCurrentSpaceIndex(prev => prev + 1);
      scrollToTop();
    } else {
      setStep(3);
    }
  };

  const handlePrevSpace = () => {
    if (currentSpaceIndex > 0) {
      setSlideDir('right');
      setAnimKey(k => k + 1);
      scrollToTop();
      setCurrentSpaceIndex(prev => prev - 1);
    } else {
      setStep(1);
    }
  };

  // -- Context step handlers --
  const handleSaveProfile = async () => {
    setSaving(true);
    const rolesAsStrings: Record<string, string> = {};
    for (const [spaceId, roleList] of Object.entries(roles)) {
      rolesAsStrings[spaceId] = roleList.join(', ');
    }
    await onSaveAIProfile(rolesAsStrings, context);
    setSaving(false);
    setStep(4);
  };

  // -- Task step handlers --
  const handleCreateTask = async () => {
    if (!taskText.trim()) return;
    setSaving(true);
    await onCreateTodo(taskText.trim(), taskSpaceId);
    setSaving(false);
    setTaskCreated(true);
  };

  const handleTaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateTask();
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal" onClick={e => e.stopPropagation()}>
        {/* Progress dots */}
        <div className="onboarding-progress">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`onboarding-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="onboarding-step">
            <img src="./icon.png" alt="Flowya" className="onboarding-logo" />
            <h2 className="onboarding-title">Welcome to Flowya</h2>
            <p className="onboarding-subtitle">
              Your floating productivity companion. Let's set things up so the AI
              can help you prioritize what matters most.
            </p>
            <p className="onboarding-hint">
              This only takes a minute.
            </p>
            <button className="onboarding-btn primary" onClick={() => setStep(1)}>
              Get Started
            </button>
          </div>
        )}

        {/* Step 1: Create Spaces */}
        {step === 1 && (
          <div className="onboarding-step">
            <h2 className="onboarding-title">Create your spaces</h2>
            <p className="onboarding-subtitle">
              Spaces help you organize tasks by area of your life. Pick a few or create your own.
            </p>

            <div className="onboarding-step-scroll">
              <div className="onboarding-space-suggestions">
                {SPACE_SUGGESTIONS.map((name, i) => {
                  const isCreated = spaces.some(s => s.name === name);
                  return (
                    <button
                      key={name}
                      className={`onboarding-space-chip ${isCreated ? 'created' : ''}`}
                      onClick={() => handleToggleSuggestedSpace(name)}
                      disabled={creatingSpace}
                    >
                      <span
                        className="onboarding-space-chip-dot"
                        style={{ background: SPACE_COLORS[i % SPACE_COLORS.length] }}
                      />
                      {name}
                      {isCreated && <span className="onboarding-space-check">&#10003;</span>}
                    </button>
                  );
                })}
              </div>

              <div className="onboarding-space-custom">
                <input
                  type="text"
                  placeholder="Or type a custom space..."
                  value={customSpaceName}
                  onChange={e => setCustomSpaceName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCustomSpace(); }}
                  className="onboarding-space-input"
                />
                {customSpaceName.trim() && (
                  <button
                    className="onboarding-space-add-btn"
                    onClick={handleAddCustomSpace}
                    disabled={creatingSpace}
                  >
                    Add
                  </button>
                )}
              </div>

              {spaces.length > 0 && (
                <div className="onboarding-spaces-created">
                  <span className="onboarding-spaces-label">Your spaces:</span>
                  <div className="onboarding-spaces-list">
                    {spaces.map(s => (
                      <span key={s.id} className="onboarding-spaces-tag">
                        <span className="onboarding-spaces-tag-dot" style={{ background: s.color }} />
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="onboarding-nav">
              <button className="onboarding-btn secondary" onClick={() => setStep(0)}>
                Back
              </button>
              <button
                className="onboarding-btn primary"
                onClick={() => { setCurrentSpaceIndex(0); setStep(2); }}
                disabled={spaces.length === 0}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Roles per space */}
        {step === 2 && currentSpace && (
          <div className="onboarding-step">
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
              <h2 className="onboarding-title">What's your role here?</h2>
              <p className="onboarding-subtitle">Pick one or more roles</p>

              <div className="onboarding-step-scroll">
                <div className="ai-role-categories">
                  {Object.entries(getPresetsForSpace(currentSpace.name)).map(([category, presets]) => (
                    <div key={category} className="ai-role-category">
                      <span className="ai-role-category-label">{category}</span>
                      <div className="ai-role-chips">
                        {presets.map(role => (
                          <button
                            key={role}
                            className={`ai-role-chip ${currentRoles.includes(role) ? 'selected' : ''}`}
                            onClick={() => handleToggleRole(currentSpace.id, role)}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="ai-role-custom">
                  <input
                    type="text"
                    placeholder="Or type a custom role..."
                    value={customInputs[currentSpace.id] || ''}
                    onChange={(e) => handleCustomRole(currentSpace.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomRole(currentSpace.id); }}
                    className="ai-role-custom-input"
                  />
                </div>

                {currentRoles.length > 0 && (
                  <div className="ai-role-selected">
                    Selected: <strong>{currentRoles.join(', ')}</strong>
                  </div>
                )}
              </div>
            </div>

            <div className="onboarding-nav">
              <button className="onboarding-btn secondary" onClick={handlePrevSpace}>
                Back
              </button>
              <button
                className="onboarding-btn primary"
                onClick={handleNextSpace}
                disabled={!canProceedRole}
              >
                {currentSpaceIndex < spaces.length - 1 ? 'Next space' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Context */}
        {step === 3 && (
          <div className="onboarding-step">
            <div className="onboarding-step-scroll">
              <h2 className="onboarding-title">Any extra context?</h2>
              <p className="onboarding-subtitle">
                Help the AI understand your situation better. This is optional.
              </p>

              <textarea
                className="ai-context-textarea"
                placeholder="E.g., I run my own startup but also work full-time at Google as a PM. I have two kids so my personal time is limited to evenings..."
                value={context}
                onChange={(e) => {
                  setContext(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                rows={3}
              />

              <div className="ai-onboarding-summary">
                <span className="ai-summary-label">Your roles:</span>
                {Object.entries(roles).map(([spaceId, roleList]) => {
                  if (roleList.length === 0) return null;
                  const space = spaces.find(s => s.id === spaceId);
                  return (
                    <div key={spaceId} className="ai-summary-role">
                      <div className="ai-summary-dot" style={{ background: space?.color || '#ccc' }} />
                      <span>{space?.name}: <strong>{roleList.join(', ')}</strong></span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="onboarding-nav">
              <button className="onboarding-btn secondary" onClick={() => { setStep(2); setCurrentSpaceIndex(spaces.length - 1); }}>
                Back
              </button>
              <button className="onboarding-btn primary" onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Saving...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Create first task */}
        {step === 4 && (
          <div className="onboarding-step">
            {!taskCreated ? (
              <>
                <div className="onboarding-task-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <h2 className="onboarding-title">Create your first task</h2>
                <p className="onboarding-subtitle">
                  What's the first thing you need to get done?
                </p>

                <div className="onboarding-task-form">
                  <input
                    type="text"
                    className="onboarding-task-input"
                    placeholder="e.g., Review Q1 roadmap"
                    value={taskText}
                    onChange={e => setTaskText(e.target.value)}
                    onKeyDown={handleTaskKeyDown}
                    autoFocus
                  />
                  {spaces.length > 1 && (
                    <select
                      className="onboarding-task-space"
                      value={taskSpaceId}
                      onChange={e => setTaskSpaceId(e.target.value)}
                    >
                      {spaces.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="onboarding-nav">
                  <button className="onboarding-btn secondary" onClick={onClose}>
                    Skip
                  </button>
                  <button
                    className="onboarding-btn primary"
                    onClick={handleCreateTask}
                    disabled={!taskText.trim() || saving}
                  >
                    {saving ? 'Creating...' : 'Create Task'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="onboarding-success-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h2 className="onboarding-title">You're all set!</h2>
                <p className="onboarding-subtitle">
                  Your first task is ready. Start adding more and let the AI
                  help you stay on top of everything.
                </p>
                <button className="onboarding-btn primary" onClick={onClose}>
                  Let's go
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
