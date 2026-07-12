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

  // Realtime: refresh when plan or items change (e.g. from MCP)
  useEffect(() => {
    if (!userId || !view.plan?.id) return;

    const channel = supabase
      .channel(`daily-plan-${view.plan.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_plans', filter: `id=eq.${view.plan.id}` },
        () => { void refetch(); },
      )
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
