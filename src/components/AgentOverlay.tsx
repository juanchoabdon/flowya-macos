import { useState } from 'react';
import type { AgentStatusType } from '../types';
import type { AgentAction } from '../hooks/useAgent';

interface AgentOverlayProps {
  status: AgentStatusType;
  message: string;
  thinking: string | null;
  screenshot: string | null;
  actions: AgentAction[];
  iteration: number;
  maxIterations: number;
  isRunning: boolean;
  onStop: () => void;
  onDismiss: () => void;
}

export function AgentOverlay({
  status,
  message,
  thinking,
  screenshot,
  actions,
  iteration,
  maxIterations,
  isRunning,
  onStop,
  onDismiss,
}: AgentOverlayProps) {
  const [showScreenshot, setShowScreenshot] = useState(false);

  if (status === 'idle') return null;

  const progressPct = maxIterations > 0 ? (iteration / maxIterations) * 100 : 0;
  const isDone = status === 'completed' || status === 'error' || status === 'cancelled';

  return (
    <div className="agent-overlay">
      <div className="agent-overlay-header">
        <div className="agent-overlay-title">
          <AgentLogoIcon />
          <span className={`agent-status-dot ${status}`} />
          <span>
            {status === 'starting' && 'Starting Agent...'}
            {status === 'running' && 'Agent Working'}
            {status === 'completed' && 'Agent Done'}
            {status === 'error' && 'Agent Error'}
            {status === 'cancelled' && 'Agent Stopped'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isRunning && (
            <button className="agent-stop-btn" onClick={onStop}>
              Stop
            </button>
          )}
          {isDone && (
            <button className="agent-dismiss-btn" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      </div>

      {message && <div className="agent-overlay-message">{message}</div>}

      {thinking && <div className="agent-overlay-thinking">{thinking}</div>}

      {isRunning && (
        <div className="agent-overlay-progress">
          <div className="agent-progress-bar">
            <div
              className="agent-progress-fill"
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
          <span>
            {iteration}/{maxIterations}
          </span>
        </div>
      )}

      {actions.length > 0 && (
        <div className="agent-overlay-actions">
          {actions.slice(-5).map((a, i) => (
            <div key={i} className="agent-action-item">
              {a.name}
              {a.coordinate && ` (${a.coordinate[0]}, ${a.coordinate[1]})`}
              {a.text && ` "${a.text.slice(0, 40)}${a.text.length > 40 ? '...' : ''}"`}
            </div>
          ))}
        </div>
      )}

      {screenshot && (
        <div
          className="agent-overlay-screenshot"
          onClick={() => setShowScreenshot(!showScreenshot)}
          style={{ cursor: 'pointer' }}
        >
          {showScreenshot && (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="Agent screenshot"
            />
          )}
          {!showScreenshot && (
            <div
              style={{
                padding: '6px 10px',
                fontSize: 10,
                color: 'rgba(255,255,255,0.35)',
                textAlign: 'center',
              }}
            >
              Tap to show screenshot
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AgentConfirmDialogProps {
  taskText: string;
  onConfirm: (apiKey: string) => void;
  onCancel: () => void;
}

export function AgentConfirmDialog({
  taskText,
  onConfirm,
  onCancel,
}: AgentConfirmDialogProps) {
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('flowya_anthropic_key') || '';
  });

  const handleConfirm = () => {
    if (!apiKey.trim()) return;
    localStorage.setItem('flowya_anthropic_key', apiKey.trim());
    onConfirm(apiKey.trim());
  };

  return (
    <div className="agent-confirm-overlay" onClick={onCancel}>
      <div className="agent-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="agent-confirm-title">Execute with Agent</div>
        <div className="agent-confirm-text">
          Claude will take control of your desktop to complete this task:
          <br />
          <strong style={{ color: '#fff' }}>{taskText}</strong>
        </div>
        <div className="agent-confirm-warning">
          The agent will take screenshots and control your mouse/keyboard. Make sure no
          sensitive information is visible. Press <strong>Cmd+Shift+Esc</strong> to
          emergency stop at any time.
        </div>
        <input
          className="agent-api-key-input"
          type="password"
          placeholder="Anthropic API Key (sk-ant-...)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          autoFocus
        />
        <div className="agent-confirm-buttons">
          <button className="agent-confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="agent-confirm-start"
            onClick={handleConfirm}
            disabled={!apiKey.trim()}
          >
            Start Agent
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentLogoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1L2 4V10L7 13L12 10V4L7 1Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
