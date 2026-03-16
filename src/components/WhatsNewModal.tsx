import { useState, useEffect } from 'react';
import { getChangelogs, type Changelog } from '../lib/supabase';

// Use the app version from package.json (injected by Vite)
const APP_VERSION = __APP_VERSION__;
const STORAGE_KEY = 'flowya_seen_version';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Fallback changelog data (used when offline or DB unavailable)
const FALLBACK_CHANGELOG = [
  {
    version: '1.0.37',
    date: 'Feb 2026',
    changes: [
      'AI Boost Hub — new entry point for all AI features',
      'Sharpen Task Names — AI rewrites vague tasks into clear actions',
      'Inline AI suggestions when opening any task',
      'AI now considers your roles and context for smarter suggestions',
      'P0 and overdue tasks auto-sort to the top',
      'Confirmation modal when dragging tasks above P0',
      'Smart ETA rescheduling for overdue tasks during AI prioritization',
    ]
  },
  {
    version: '1.0.36',
    date: 'Feb 2026',
    changes: [
      'AI Prioritization — your personal productivity coach',
      'Smart AI onboarding with role-based personalization',
      'One-click Apply to re-prioritize and auto-archive done tasks',
      'Edit your AI profile anytime from Settings',
    ]
  },
  {
    version: '1.0.22',
    date: 'Feb 2026',
    changes: [
      'Added ETA/deadlines with visual urgency indicators',
      'Priority system (P0-P3) with smart positioning',
      'Rich text editor for task descriptions',
      'What\'s New & Tips panel',
    ]
  },
];

// Tips & Tricks data
const TRICKS = [
  {
    title: 'Keyboard Shortcuts',
    items: [
      { key: '⌘+⇧+Space', desc: 'Toggle Flowya visibility' },
      { key: '⌘+1', desc: 'Switch to All spaces' },
      { key: '⌘+2-9', desc: 'Switch to workspace by order' },
      { key: '⌘+Z', desc: 'Undo archived task (within 5 seconds)' },
      { key: 'Enter', desc: 'Save task while editing' },
      { key: 'Escape', desc: 'Cancel editing / Close modals' },
    ]
  },
  {
    title: 'Pro Tips',
    items: [
      { key: 'AI Boost', desc: 'Click the wave icon to prioritize or sharpen task names with AI' },
      { key: 'P0 Priority', desc: 'Tasks with 1hr/3hr/Today ETA auto-become P0' },
      { key: 'Links in descriptions', desc: 'Paste URLs, they become clickable links' },
      { key: 'Double-click link', desc: 'Opens link in browser' },
    ]
  },
  {
    title: '🤫 Secret',
    items: [
      { key: '⌘+⇧+D', desc: 'Check your progress for today' },
    ]
  }
];

export function WhatsNewModal({ isOpen, onClose }: WhatsNewModalProps) {
  const [activeTab, setActiveTab] = useState<'whats-new' | 'tricks'>('whats-new');
  const [changelogs, setChangelogs] = useState<Changelog[] | typeof FALLBACK_CHANGELOG>(FALLBACK_CHANGELOG);
  const [loading, setLoading] = useState(true);

  // Load changelogs from database
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getChangelogs()
        .then((data) => {
          if (data.length > 0) {
            setChangelogs(data);
          }
        })
        .finally(() => setLoading(false));
      
      // Mark as seen when opened
      localStorage.setItem(STORAGE_KEY, APP_VERSION);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="whats-new-overlay" onClick={onClose}>
      <div className="whats-new-modal" onClick={e => e.stopPropagation()}>
        <div className="whats-new-header">
          <div className="whats-new-tabs">
            <button
              className={`whats-new-tab ${activeTab === 'whats-new' ? 'active' : ''}`}
              onClick={() => setActiveTab('whats-new')}
            >
              What's New
            </button>
            <button
              className={`whats-new-tab ${activeTab === 'tricks' ? 'active' : ''}`}
              onClick={() => setActiveTab('tricks')}
            >
              Tips & Tricks
            </button>
          </div>
          <button className="whats-new-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="whats-new-content">
          {activeTab === 'whats-new' ? (
            <div className="changelog">
              {loading ? (
                <div className="changelog-loading">Loading...</div>
              ) : (
                changelogs.map((release) => (
                  <div key={release.version} className="changelog-release">
                    <div className="changelog-version">
                      <span className="version-number">v{release.version}</span>
                      <span className="version-date">{release.date}</span>
                    </div>
                    <ul className="changelog-list">
                      {release.changes.map((change, i) => (
                        <li key={i}>{change}</li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="tricks">
              {TRICKS.map((section) => (
                <div key={section.title} className="tricks-section">
                  <h3 className="tricks-title">{section.title}</h3>
                  <div className="tricks-list">
                    {section.items.map((item) => (
                      <div key={item.key} className="trick-item">
                        <kbd className="trick-key">{item.key}</kbd>
                        <span className="trick-desc">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="whats-new-footer">
          <span className="version-label">Flowya v{APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}

// Hook to check if there are unseen updates
export function useHasUnseenUpdates(): [boolean, () => void] {
  const [hasUnseen, setHasUnseen] = useState(() => {
    const seenVersion = localStorage.getItem(STORAGE_KEY);
    return seenVersion !== APP_VERSION;
  });

  const markAsSeen = () => {
    localStorage.setItem(STORAGE_KEY, APP_VERSION);
    setHasUnseen(false);
  };

  return [hasUnseen, markAsSeen];
}

export { APP_VERSION };
