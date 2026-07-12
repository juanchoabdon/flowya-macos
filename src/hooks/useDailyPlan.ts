import { useState, useEffect, useCallback } from 'react';
import type { DailyPlanView } from '../types';
import { getDailyPlan, getLocalDateString, supabase } from '../lib/supabase';

interface UseDailyPlanReturn {
  view: DailyPlanView;
  loading: boolean;
  planDate: string;
  refetch: () => Promise<void>;
}

export function useDailyPlan(userId: string | undefined): UseDailyPlanReturn {
  const planDate = getLocalDateString();
  const [view, setView] = useState<DailyPlanView>({ plan: null, items: [] });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await getDailyPlan(userId, planDate);
      setView(result);
    } catch (err) {
      console.error('[DailyPlan] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, planDate]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Realtime: refresh when plan rows change (create/update via MCP or another client)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`daily-plans-user-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_plans', filter: `user_id=eq.${userId}` },
        () => { void refetch(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, refetch]);

  // Realtime: refresh when items for the active plan change
  useEffect(() => {
    if (!userId || !view.plan?.id) return;

    const channel = supabase
      .channel(`daily-plan-items-${view.plan.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_plan_items', filter: `daily_plan_id=eq.${view.plan.id}` },
        () => { void refetch(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, view.plan?.id, refetch]);

  return { view, loading, planDate, refetch };
}
