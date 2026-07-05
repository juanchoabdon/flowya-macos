import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useEntitlement, type Entitlement } from '../hooks/useEntitlement';

const MCP_BASE = ((import.meta.env.VITE_FLOWYA_MCP_URL as string) || 'https://flowya-mcp.vercel.app').replace(/\/+$/, '');

interface MembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
}

type Tone = 'pro' | 'free' | 'warn';
type Action = 'checkout' | 'manage' | 'none';

interface Resolved {
  title: string;
  sub: string;
  tone: Tone;
  action: Action;
  ctaLabel: string;
}

function fmt(d?: string | null): string {
  return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}
function isFuture(d?: string | null): boolean {
  return !!d && new Date(d).getTime() > Date.now();
}

/** Full lifecycle resolver — maps an entitlement (with date-awareness) to what
 *  the user should see and the single primary action they can take. */
function resolveMembership(ent: Entitlement | null): Resolved {
  if (!ent) {
    return { title: 'Free plan', sub: 'Upgrade to connect AI via MCP and use Flowya on mobile.', tone: 'free', action: 'checkout', ctaLabel: 'Upgrade to Pro' };
  }
  const hasSub = !!ent.stripe_subscription_id;
  switch (ent.status) {
    case 'lifetime':
      return { title: 'Flowya Pro — lifetime', sub: 'You have lifetime access. Thank you!', tone: 'pro', action: 'none', ctaLabel: '' };

    case 'active':
      if (ent.cancel_at_period_end) {
        return { title: `Flowya Pro${ent.plan ? ` · ${ent.plan}` : ''}`, sub: ent.current_period_end ? `Cancels on ${fmt(ent.current_period_end)} — won't renew.` : "Set to cancel — won't renew.", tone: 'warn', action: 'manage', ctaLabel: 'Reactivate subscription' };
      }
      if (ent.current_period_end && !isFuture(ent.current_period_end)) {
        return { title: 'Flowya Pro — expired', sub: `Your subscription lapsed on ${fmt(ent.current_period_end)}.`, tone: 'warn', action: 'checkout', ctaLabel: 'Renew Pro' };
      }
      return { title: `Flowya Pro${ent.plan ? ` · ${ent.plan}` : ''}`, sub: ent.current_period_end ? `Renews on ${fmt(ent.current_period_end)}.` : 'Your subscription is active.', tone: 'pro', action: 'manage', ctaLabel: 'Manage subscription' };

    case 'past_due':
      return { title: 'Flowya Pro — payment issue', sub: 'We couldn\'t charge your card. Update your payment method to keep Pro.', tone: 'warn', action: 'manage', ctaLabel: 'Update payment method' };

    case 'trialing':
      if (isFuture(ent.trial_end)) {
        return hasSub
          ? { title: 'Flowya Pro — trial', sub: `Your trial ends ${fmt(ent.trial_end)}.`, tone: 'pro', action: 'manage', ctaLabel: 'Manage subscription' }
          : { title: 'Flowya Pro — trial', sub: `Free until ${fmt(ent.trial_end)}. Subscribe to keep Pro after that.`, tone: 'pro', action: 'checkout', ctaLabel: 'Subscribe to keep Pro' };
      }
      return { title: 'Trial ended', sub: ent.trial_end ? `Your trial ended on ${fmt(ent.trial_end)}.` : 'Your trial has ended.', tone: 'free', action: 'checkout', ctaLabel: 'Upgrade to Pro' };

    case 'grandfathered':
      if (isFuture(ent.grandfather_until)) {
        return { title: 'Flowya Pro — free access', sub: `Included free until ${fmt(ent.grandfather_until)}. Subscribe now to keep Pro after that.`, tone: 'pro', action: 'checkout', ctaLabel: 'Subscribe to keep Pro' };
      }
      return { title: 'Free access ended', sub: ent.grandfather_until ? `Your free Pro access ended on ${fmt(ent.grandfather_until)}.` : 'Your free Pro access has ended.', tone: 'free', action: 'checkout', ctaLabel: 'Upgrade to Pro' };

    case 'canceled':
      return { title: 'Subscription canceled', sub: ent.current_period_end ? `Your access ended on ${fmt(ent.current_period_end)}.` : 'Your subscription was canceled.', tone: 'warn', action: 'checkout', ctaLabel: 'Renew Pro' };

    default:
      return { title: 'Free plan', sub: 'Upgrade to connect AI via MCP and use Flowya on mobile.', tone: 'free', action: 'checkout', ctaLabel: 'Upgrade to Pro' };
  }
}

const TONE: Record<Tone, { bg: string; border: string; dot: string }> = {
  pro: { bg: 'rgba(48, 209, 88, 0.10)', border: 'rgba(48, 209, 88, 0.3)', dot: '#30D158' },
  free: { bg: 'rgba(155, 109, 255, 0.10)', border: 'rgba(155, 109, 255, 0.28)', dot: '#9B6DFF' },
  warn: { bg: 'rgba(255, 159, 10, 0.10)', border: 'rgba(255, 159, 10, 0.32)', dot: '#FF9F0A' },
};

const PLANS: { id: 'monthly' | 'annual'; label: string; price: string; note?: string }[] = [
  { id: 'monthly', label: 'Monthly', price: '$4.99', note: 'per month' },
  { id: 'annual', label: 'Annual', price: '$39.99', note: 'per year · save 33%' },
];

const COMPARE: { feat: string; free: boolean; pro: boolean }[] = [
  { feat: 'Mac app — notch, spaces, kanban, hotkey', free: true, pro: true },
  { feat: 'Unlimited tasks & spaces', free: true, pro: true },
  { feat: 'Real-time sync across your devices', free: true, pro: true },
  { feat: 'Flowya on iPhone & mobile', free: false, pro: true },
  { feat: 'Connect your AI — Claude, Cursor, ChatGPT (MCP)', free: false, pro: true },
  { feat: 'Priority support', free: false, pro: true },
];

async function jwtHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new Error('You must be signed in.');
  return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
}

export function MembershipModal({ isOpen, onClose, userId }: MembershipModalProps) {
  const { entitlement, isPro, loading, refresh } = useEntitlement(userId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(async (plan: 'monthly' | 'annual') => {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch(`${MCP_BASE}/v1/billing/checkout`, {
        method: 'POST',
        headers: await jwtHeader(),
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (body.url) window.windowApi?.openExternal(body.url);
      else setError(body.error || 'Could not start checkout.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setBusy(null);
    }
  }, []);

  const openPortal = useCallback(async () => {
    setBusy('portal');
    setError(null);
    try {
      const res = await fetch(`${MCP_BASE}/v1/billing/portal`, { method: 'POST', headers: await jwtHeader() });
      const body = (await res.json()) as { url?: string; error?: string };
      if (body.url) window.windowApi?.openExternal(body.url);
      else setError(body.error || 'No subscription to manage yet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the billing portal.');
    } finally {
      setBusy(null);
    }
  }, []);

  if (!isOpen) return null;

  const info = resolveMembership(entitlement);
  const tone = TONE[info.tone];
  // Users on Stripe (any current/past sub) can always reach the portal for
  // invoices / payment method, even when the primary CTA is checkout.
  const hasStripeHistory = entitlement?.source === 'stripe' || !!entitlement?.stripe_subscription_id;

  return (
    <div className="recurring-overlay" onClick={onClose}>
      <div className="recurring-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recurring-header">
          <h2>Membership</h2>
          <button className="recurring-close" onClick={onClose}>✕</button>
        </div>

        <div className="recurring-content">
          {loading ? (
            <div style={{ fontSize: 12, opacity: 0.6 }}>Loading membership…</div>
          ) : (
            <>
              {/* Status banner */}
              <div style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: tone.dot, marginTop: 6, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{info.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{info.sub}</div>
                </div>
              </div>

              {/* Free vs Pro comparison for non-Pro */}
              {!isPro && (
                <div style={{ marginTop: 16, border: '1px solid rgba(127,127,127,0.18)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px', alignItems: 'center', padding: '9px 14px', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.5 }}>
                    <div>What you get</div>
                    <div style={{ textAlign: 'center' }}>Free</div>
                    <div style={{ textAlign: 'center', color: '#9B6DFF', fontWeight: 700 }}>Pro</div>
                  </div>
                  {COMPARE.map((r, i) => (
                    <div
                      key={r.feat}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px', alignItems: 'center', padding: '9px 14px', fontSize: 12.5, borderTop: i === 0 ? '1px solid rgba(127,127,127,0.14)' : '1px solid rgba(127,127,127,0.1)' }}
                    >
                      <div style={{ opacity: 0.85 }}>{r.feat}</div>
                      <div style={{ textAlign: 'center', color: r.free ? '#30D158' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{r.free ? '✓' : '—'}</div>
                      <div style={{ textAlign: 'center', color: r.pro ? '#30D158' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{r.pro ? '✓' : '—'}</div>
                    </div>
                  ))}
                </div>
              )}

              {error && <div style={{ color: '#FF6B7A', fontSize: 12, marginTop: 12 }}>{error}</div>}

              {/* Primary action */}
              {info.action === 'checkout' && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{info.ctaLabel}</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {PLANS.map((p) => (
                      <button
                        key={p.id}
                        className="recurring-add-btn"
                        style={{ flex: 1, flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 8px', opacity: busy && busy !== p.id ? 0.6 : 1 }}
                        disabled={!!busy}
                        onClick={() => startCheckout(p.id)}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{busy === p.id ? 'Opening…' : p.label}</span>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{p.price}</span>
                        {p.note && <span style={{ fontSize: 10, opacity: 0.7 }}>{p.note}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {info.action === 'manage' && (
                <button className="recurring-add-btn" style={{ marginTop: 18 }} disabled={!!busy} onClick={openPortal}>
                  {busy === 'portal' ? 'Opening…' : info.ctaLabel}
                </button>
              )}

              {/* Secondary: portal access for anyone with Stripe history when the
                  primary CTA is checkout (invoices, payment method). */}
              {info.action === 'checkout' && hasStripeHistory && (
                <button
                  className="recurring-close"
                  style={{ fontSize: 12, width: 'auto', padding: '4px 12px', marginTop: 12 }}
                  disabled={!!busy}
                  onClick={openPortal}
                >
                  {busy === 'portal' ? 'Opening…' : 'Billing history & invoices'}
                </button>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <button
                  className="recurring-close"
                  style={{ fontSize: 12, width: 'auto', padding: '2px 12px' }}
                  onClick={() => void refresh()}
                >
                  Refresh
                </button>
                <span style={{ fontSize: 11, opacity: 0.45 }}>
                  Billing by Stripe. Changes appear here in a few seconds.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
