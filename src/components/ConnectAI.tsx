import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Base URL of the hosted Flowya MCP service. Override with VITE_FLOWYA_MCP_URL.
const MCP_BASE = (import.meta.env.VITE_FLOWYA_MCP_URL as string) || 'https://flowya-mcp.vercel.app';
const MCP_ENDPOINT = `${MCP_BASE.replace(/\/+$/, '')}/mcp`;

interface McpToken {
  id: string;
  name: string;
  preview: string;
  created_at: string;
  last_used_at: string | null;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new Error('You must be signed in to manage AI connections.');
  return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
}

export function ConnectAI() {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${MCP_BASE.replace(/\/+$/, '')}/v1/tokens`, { headers: await authHeader() });
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
    void load();
  }, [load]);

  const createToken = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${MCP_BASE.replace(/\/+$/, '')}/v1/tokens`, {
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
        const res = await fetch(`${MCP_BASE.replace(/\/+$/, '')}/v1/tokens/${id}`, {
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

  return (
    <div className="settings-group">
      <div className="settings-label" style={{ cursor: 'default' }}>
        <span className="settings-label-text">Connect with AI</span>
      </div>
      <p style={{ fontSize: 12, opacity: 0.65, margin: '4px 0 10px' }}>
        Generate a token to let Cursor, Claude, or Cowork read and manage your Flowya tasks through the Flowya MCP.
      </p>

      <div className="connect-ai-endpoint" style={{ fontSize: 11, opacity: 0.7, marginBottom: 10 }}>
        <span>MCP URL:</span>{' '}
        <code>{MCP_ENDPOINT}</code>
        <button className="settings-btn" style={{ marginLeft: 8, padding: '2px 8px' }} onClick={() => copy('url', MCP_ENDPOINT)}>
          {copied === 'url' ? 'Copied' : 'Copy'}
        </button>
      </div>

      {newToken && (
        <div
          className="connect-ai-newtoken"
          style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 10, marginBottom: 10 }}
        >
          <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 6 }}>
            Copy this token now — it won't be shown again:
          </div>
          <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{newToken}</code>
          <div style={{ marginTop: 6 }}>
            <button className="settings-btn" style={{ padding: '2px 8px' }} onClick={() => copy('token', newToken)}>
              {copied === 'token' ? 'Copied' : 'Copy token'}
            </button>
            <button
              className="settings-btn"
              style={{ padding: '2px 8px', marginLeft: 6 }}
              onClick={() => setNewToken(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: '#FF6B7A', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {loading ? (
        <div style={{ fontSize: 12, opacity: 0.6 }}>Loading connections…</div>
      ) : (
        <div className="connect-ai-tokens">
          {tokens.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>No AI connections yet.</div>}
          {tokens.map((t) => (
            <div
              key={t.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}
            >
              <div style={{ fontSize: 12 }}>
                <span>{t.name}</span>{' '}
                <code style={{ opacity: 0.6 }}>{t.preview}</code>
              </div>
              <button className="settings-btn" style={{ padding: '2px 8px' }} onClick={() => revokeToken(t.id)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="settings-btn" style={{ marginTop: 8 }} disabled={creating} onClick={createToken}>
        {creating ? 'Generating…' : 'Generate token'}
      </button>
    </div>
  );
}
