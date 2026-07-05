import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useEntitlement } from '../hooks/useEntitlement';

// Base URL of the hosted Flowya MCP service. Override with VITE_FLOWYA_MCP_URL.
const MCP_BASE = ((import.meta.env.VITE_FLOWYA_MCP_URL as string) || 'https://flowya-mcp.vercel.app').replace(/\/+$/, '');
const MCP_ENDPOINT = `${MCP_BASE}/mcp`;
const UPGRADE_URL = 'https://flowya.io/upgrade';

interface McpToken {
  id: string;
  name: string;
  preview: string;
  created_at: string;
  last_used_at: string | null;
}

interface ConnectAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  onOpenMembership?: () => void;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new Error('You must be signed in to manage AI connections.');
  return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
}

export function ConnectAIModal({ isOpen, onClose, userId, onOpenMembership }: ConnectAIModalProps) {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { isPro, loading: entLoading, refresh: refreshEntitlement } = useEntitlement(userId);

  const openUpgrade = useCallback(() => {
    if (onOpenMembership) onOpenMembership();
    else window.windowApi?.openExternal(UPGRADE_URL);
  }, [onOpenMembership]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${MCP_BASE}/v1/tokens`, { headers: await authHeader() });
      if (!res.ok) throw new Error(`Could not load tokens (${res.status})`);
      const body = (await res.json()) as { tokens: McpToken[] };
      setTokens(body.tokens ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void refreshEntitlement();
    }
  }, [isOpen, refreshEntitlement]);

  useEffect(() => {
    // Only load MCP tokens once we know the user is entitled to use them.
    if (isOpen && isPro) void load();
  }, [isOpen, isPro, load]);

  const createToken = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${MCP_BASE}/v1/tokens`, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ name: 'AI client' }),
      });
      if (!res.ok) throw new Error(`Could not create token (${res.status})`);
      const body = (await res.json()) as { token: string };
      setNewToken(body.token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setCreating(false);
    }
  }, [load]);

  const revokeToken = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const res = await fetch(`${MCP_BASE}/v1/tokens/${id}`, {
          method: 'DELETE',
          headers: await authHeader(),
        });
        if (!res.ok) throw new Error(`Could not revoke token (${res.status})`);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to revoke token');
      }
    },
    [load],
  );

  const copy = useCallback((label: string, value: string) => {
    void navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="recurring-overlay" onClick={onClose}>
      <div className="recurring-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recurring-header">
          <h2>Connect with AI</h2>
          <button className="recurring-close" onClick={onClose}>✕</button>
        </div>

        <div className="recurring-content">
          {entLoading ? (
            <div style={{ fontSize: 12, opacity: 0.6 }}>Loading…</div>
          ) : !isPro ? (
            <div style={{ textAlign: 'center', padding: '10px 6px 4px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Connecting AI is a Pro feature</div>
              <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
                Upgrade to Flowya Pro to connect Claude, Cursor, ChatGPT and any MCP client so your AI can read and manage your tasks.
              </p>
              <button className="recurring-add-btn" style={{ marginTop: 12 }} onClick={openUpgrade}>
                Upgrade to Pro
              </button>
            </div>
          ) : (
          <>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
            Generate a token to let Cursor, Claude, or Cowork read and manage your Flowya tasks.
          </p>

          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>MCP URL:</span>
            <code style={{ background: 'rgba(127,127,127,0.15)', padding: '2px 6px', borderRadius: 4 }}>{MCP_ENDPOINT}</code>
            <button className="recurring-close" style={{ fontSize: 12, width: 'auto', padding: '2px 10px' }} onClick={() => copy('url', MCP_ENDPOINT)}>
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
          </div>

          {newToken && (
            <div style={{ background: 'rgba(127,127,127,0.12)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                Copy this token now — it won't be shown again:
              </div>
              <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{newToken}</code>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button className="recurring-close" style={{ fontSize: 12, width: 'auto', padding: '2px 10px' }} onClick={() => copy('token', newToken)}>
                  {copied === 'token' ? 'Copied' : 'Copy token'}
                </button>
                <button className="recurring-close" style={{ fontSize: 12, width: 'auto', padding: '2px 10px' }} onClick={() => setNewToken(null)}>
                  Done
                </button>
              </div>
            </div>
          )}

          {error && <div style={{ color: '#FF6B7A', fontSize: 12, marginBottom: 10 }}>{error}</div>}

          {loading ? (
            <div style={{ fontSize: 12, opacity: 0.6 }}>Loading connections…</div>
          ) : (
            <div>
              {tokens.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>No AI connections yet.</div>}
              {tokens.map((t) => (
                <div
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(127,127,127,0.12)' }}
                >
                  <div style={{ fontSize: 13 }}>
                    <span>{t.name}</span>{' '}
                    <code style={{ opacity: 0.55, fontSize: 12 }}>{t.preview}</code>
                  </div>
                  <button className="recurring-close" style={{ fontSize: 12, width: 'auto', padding: '2px 10px' }} onClick={() => revokeToken(t.id)}>
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            className="recurring-add-btn"
            style={{ marginTop: 14 }}
            disabled={creating}
            onClick={createToken}
          >
            {creating ? 'Generating…' : 'Generate token'}
          </button>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
