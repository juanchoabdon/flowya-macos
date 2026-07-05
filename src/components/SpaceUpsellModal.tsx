import { FREE_SPACE_LIMIT } from '../lib/limits';

interface SpaceUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

const PRO_VALUE: string[] = [
  'Unlimited spaces to separate every front',
  'Connect your AI — Claude, Cursor, ChatGPT (MCP)',
  'Flowya on iPhone & mobile',
  'Priority support',
];

/** Shown the moment a free user hits the space limit. Sells Pro in context
 *  (its real hook is the MCP/AI connection) and hands off to the full
 *  Membership modal for checkout. */
export function SpaceUpsellModal({ isOpen, onClose, onUpgrade }: SpaceUpsellModalProps) {
  if (!isOpen) return null;

  return (
    <div className="recurring-overlay" onClick={onClose}>
      <div className="recurring-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="recurring-header">
          <h2>Unlock unlimited spaces</h2>
          <button className="recurring-close" onClick={onClose}>✕</button>
        </div>

        <div className="recurring-content">
          <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.8 }}>
            Free includes {FREE_SPACE_LIMIT} spaces to keep your fronts separate.
            Go Pro to organize your whole life — and connect your AI to Flowya.
          </div>

          <div style={{ marginTop: 16, border: '1px solid rgba(127,127,127,0.18)', borderRadius: 10, overflow: 'hidden' }}>
            {PRO_VALUE.map((feat, i) => (
              <div
                key={feat}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', fontSize: 13, borderTop: i === 0 ? 'none' : '1px solid rgba(127,127,127,0.1)' }}
              >
                <span style={{ color: '#9B6DFF', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span style={{ opacity: 0.9 }}>{feat}</span>
              </div>
            ))}
          </div>

          <button className="recurring-add-btn" style={{ marginTop: 18 }} onClick={onUpgrade}>
            Upgrade to Pro
          </button>

          <button
            className="recurring-close"
            style={{ fontSize: 12, width: 'auto', padding: '4px 12px', marginTop: 10 }}
            onClick={onClose}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
