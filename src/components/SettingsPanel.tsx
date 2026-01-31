import type { Settings } from '../types';

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (updates: Partial<Omit<Settings, 'id'>>) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, onUpdate, onClose }: SettingsPanelProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="icon-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        
        <div className="settings-content">
          <div className="settings-group">
            <label className="settings-label">
              <span className="settings-label-text">Always on Top</span>
              <Toggle
                active={settings.always_on_top}
                onChange={(value) => onUpdate({ always_on_top: value })}
              />
            </label>
            
            <label className="settings-label">
              <span className="settings-label-text">Show on All Spaces</span>
              <Toggle
                active={settings.visible_on_all_workspaces}
                onChange={(value) => onUpdate({ visible_on_all_workspaces: value })}
              />
            </label>
          </div>
          
          <div className="settings-group">
            <div className="slider-container">
              <div className="slider-label">
                <span className="settings-label-text">Window Opacity</span>
                <span className="slider-value">{Math.round(settings.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                className="slider"
                min="0.3"
                max="1"
                step="0.05"
                value={settings.opacity}
                onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })}
              />
            </div>
          </div>
          
          <div className="shortcut-hint">
            <kbd className="kbd">⌘</kbd> + <kbd className="kbd">⇧</kbd> + <kbd className="kbd">Space</kbd>
            <span style={{ marginLeft: 8 }}>to toggle window</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Toggle component
interface ToggleProps {
  active: boolean;
  onChange: (value: boolean) => void;
}

function Toggle({ active, onChange }: ToggleProps) {
  return (
    <div
      className={`toggle ${active ? 'active' : ''}`}
      onClick={() => onChange(!active)}
    >
      <div className="toggle-knob" />
    </div>
  );
}

// Close icon
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 3L11 11M11 3L3 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
