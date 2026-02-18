import { useState } from 'react';
import type { Space } from '../types';

interface AIOnboardingProps {
  spaces: Space[];
  onComplete: (roles: Record<string, string>, context: string) => void;
  onClose: () => void;
  initialRoles?: Record<string, string>;
  initialContext?: string;
  editMode?: boolean;
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

function getPresetsForSpace(spaceName: string): Record<string, string[]> {
  const name = spaceName.toLowerCase().trim();
  if (PERSONAL_KEYWORDS.some(kw => name.includes(kw))) {
    return PERSONAL_PRESETS;
  }
  return WORK_PRESETS;
}

export function AIOnboarding({ spaces, onComplete, onClose, initialRoles, initialContext, editMode }: AIOnboardingProps) {
  const buildInitialRoles = (): Record<string, string[]> => {
    if (!initialRoles) return {};
    const result: Record<string, string[]> = {};
    for (const [spaceId, rolesStr] of Object.entries(initialRoles)) {
      result[spaceId] = rolesStr.split(',').map(r => r.trim()).filter(Boolean);
    }
    return result;
  };

  const [step, setStep] = useState(editMode ? 1 : 0);
  const [roles, setRoles] = useState<Record<string, string[]>>(buildInitialRoles);
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [context, setContext] = useState(initialContext || '');
  const [currentSpaceIndex, setCurrentSpaceIndex] = useState(0);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const totalSteps = 3; // intro, roles, context
  const currentSpace = spaces[currentSpaceIndex];

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
    const scrollEl = document.querySelector('.ai-onboarding-step-scroll');
    if (scrollEl) scrollEl.scrollTop = 0;
  };

  const handleNextSpace = () => {
    if (currentSpaceIndex < spaces.length - 1) {
      setSlideDir('left');
      setAnimKey(k => k + 1);
      setCurrentSpaceIndex(prev => prev + 1);
      scrollToTop();
    } else {
      setStep(2);
    }
  };

  const handlePrevSpace = () => {
    if (currentSpaceIndex > 0) {
      setSlideDir('right');
      setAnimKey(k => k + 1);
      scrollToTop();
      setCurrentSpaceIndex(prev => prev - 1);
    } else {
      setStep(0);
    }
  };

  const handleFinish = () => {
    const rolesAsStrings: Record<string, string> = {};
    for (const [spaceId, roleList] of Object.entries(roles)) {
      rolesAsStrings[spaceId] = roleList.join(', ');
    }
    onComplete(rolesAsStrings, context);
  };

  const currentRoles = roles[currentSpace?.id] || [];
  const canProceedRole = currentRoles.length > 0;

  return (
    <div className="ai-onboarding-overlay" onClick={onClose}>
      <div className="ai-onboarding-modal" onClick={e => e.stopPropagation()}>
        <button className="ai-onboarding-close" onClick={onClose}>
          <CloseIcon />
        </button>

        {/* Progress dots */}
        <div className="ai-onboarding-progress">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`ai-progress-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            />
          ))}
        </div>

        {/* Step 0: Intro */}
        {step === 0 && (
          <div className="ai-onboarding-step">
            <div className="ai-onboarding-icon">
              <SparkleIcon size={48} />
            </div>
            <h2 className="ai-onboarding-title">AI Prioritization</h2>
            <p className="ai-onboarding-subtitle">
              Let's personalize your AI assistant. Tell me about your roles 
              so I can help you prioritize like a pro.
            </p>
            <p className="ai-onboarding-hint">
              This only takes a minute. You can always edit it later in Settings.
            </p>
            <button className="ai-onboarding-btn primary ai-onboarding-btn-intro" onClick={() => setStep(1)}>
              Let's go
            </button>
          </div>
        )}

        {/* Step 1: Roles per space */}
        {step === 1 && currentSpace && (
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
              <h2 className="ai-onboarding-title">What's your role here?</h2>
              <p className="ai-onboarding-subtitle">
                Pick one or more roles
              </p>

              <div className="ai-onboarding-step-scroll">
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

            <div className="ai-onboarding-nav">
              <button className="ai-onboarding-btn secondary" onClick={handlePrevSpace}>
                Back
              </button>
              <button
                className="ai-onboarding-btn primary"
                onClick={handleNextSpace}
                disabled={!canProceedRole}
              >
                {currentSpaceIndex < spaces.length - 1 ? 'Next space' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Context */}
        {step === 2 && (
          <div className="ai-onboarding-step">
            <div className="ai-onboarding-step-scroll">
              <div className="ai-onboarding-icon">
                <ContextIcon size={36} />
              </div>
              <h2 className="ai-onboarding-title">Any extra context?</h2>
              <p className="ai-onboarding-subtitle">
                Help the AI understand your situation better. This is optional but makes prioritization smarter.
              </p>

              <textarea
                className="ai-context-textarea"
                placeholder={"E.g., I run my own startup called Flowya but I also work full-time at Google as a PM. My startup workspace is for side-project tasks. I have two kids so my personal time is limited to evenings..."}
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

            <div className="ai-onboarding-nav">
              <button className="ai-onboarding-btn secondary" onClick={() => { setStep(1); setCurrentSpaceIndex(spaces.length - 1); }}>
                Back
              </button>
              <button className="ai-onboarding-btn primary" onClick={handleFinish}>
                {editMode ? 'Save Changes' : 'Done'}
              </button>
            </div>
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

export function SparkleIcon({ size = 16 }: { size?: number }) {
  const gradId = `aiGradModal_${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="ai-sparkle-svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD54F">
            <animate attributeName="stop-color" values="#FFD54F;#FF6B9D;#4FC3F7;#81C784;#FFD54F" dur="3s" repeatCount="indefinite"/>
          </stop>
          <stop offset="50%" stopColor="#FF6B9D">
            <animate attributeName="stop-color" values="#FF6B9D;#4FC3F7;#81C784;#FFD54F;#FF6B9D" dur="3s" repeatCount="indefinite"/>
          </stop>
          <stop offset="100%" stopColor="#4FC3F7">
            <animate attributeName="stop-color" values="#4FC3F7;#81C784;#FFD54F;#FF6B9D;#4FC3F7" dur="3s" repeatCount="indefinite"/>
          </stop>
        </linearGradient>
      </defs>
      <path d="M8 1L9.5 5.5L14 7L9.5 8.5L8 13L6.5 8.5L2 7L6.5 5.5L8 1Z" fill={`url(#${gradId})`} stroke={`url(#${gradId})`} strokeWidth="0.5" strokeLinejoin="round"/>
      <circle cx="13" cy="3" r="1.2" fill={`url(#${gradId})`} className="ai-sparkle-dot1"/>
      <circle cx="3" cy="12" r="1" fill={`url(#${gradId})`} className="ai-sparkle-dot2"/>
    </svg>
  );
}

function ContextIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 9h8M8 13h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
