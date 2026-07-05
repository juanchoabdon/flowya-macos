import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type EntitlementStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'grandfathered'
  | 'lifetime';

export interface Entitlement {
  status: EntitlementStatus;
  plan: 'monthly' | 'annual' | null;
  source: 'stripe' | 'apple' | 'grandfather' | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  grandfather_until: string | null;
  cancel_at_period_end: boolean;
}

/**
 * Reads the signed-in user's Pro entitlement (RLS: read-own-row) plus the
 * authoritative is_pro() check, and keeps it live via a Realtime subscription
 * so the app reflects Stripe changes (upgrade / cancel) within seconds.
 */
export function useEntitlement(userId?: string | null) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setEntitlement(null);
      setIsPro(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: row }, { data: pro }] = await Promise.all([
      supabase
        .from('entitlements')
        .select('status,plan,source,stripe_subscription_id,current_period_end,trial_end,grandfather_until,cancel_at_period_end')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase.rpc('is_pro'),
    ]);
    setEntitlement((row as Entitlement) ?? null);
    setIsPro(pro === true);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: unlock/lock instantly when the webhook updates the row.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`entitlements:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entitlements', filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { entitlement, isPro, loading, refresh };
}
