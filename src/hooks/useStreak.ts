import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const STREAK_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const TABLE = 'user_streaks';

interface StreakState {
  count: number;
  lastCompletedAt: string | null;
  bestToday: number;
  todayDate: string;
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isStreakExpired(lastCompletedAt: string | null): boolean {
  if (!lastCompletedAt) return true;
  return Date.now() - new Date(lastCompletedAt).getTime() > STREAK_WINDOW_MS;
}

export function useStreak(userId?: string) {
  const [streak, setStreak] = useState<StreakState>({
    count: 0,
    lastCompletedAt: null,
    bestToday: 0,
    todayDate: getToday(),
  });
  const [showFlame, setShowFlame] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Load from Supabase on mount / userId change
  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('[Streak] Failed to load:', error);
        return;
      }

      if (data) {
        applyRow(data);
      }
    };

    load();
  }, [userId]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;

    channelRef.current?.unsubscribe();

    const channel = supabase
      .channel(`user_streaks_${userId.substring(0, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            applyRow(payload.new as any);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [userId]);

  const applyRow = useCallback((row: any) => {
    const today = getToday();
    const lastAt = row.last_completed_at || null;
    const expired = isStreakExpired(lastAt);

    setStreak({
      count: expired ? 0 : (row.streak_count ?? 0),
      lastCompletedAt: lastAt,
      bestToday: row.today_date === today ? (row.best_today ?? 0) : 0,
      todayDate: today,
    });
  }, []);

  // Expiry checker every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (streak.lastCompletedAt && streak.count > 0) {
        if (isStreakExpired(streak.lastCompletedAt)) {
          setStreak(prev => ({ ...prev, count: 0, lastCompletedAt: null }));
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [streak.lastCompletedAt, streak.count]);

  // Optimistic local update — the actual DB write is handled by the
  // fn_update_streak_on_done Postgres trigger so that completions from
  // the MCP (or any other client) also count. The Realtime subscription
  // above will reconcile state if the trigger's result differs.
  const recordCompletion = useCallback(() => {
    const now = new Date();

    setStreak(prev => {
      let newCount = 1;
      if (prev.lastCompletedAt) {
        const elapsed = now.getTime() - new Date(prev.lastCompletedAt).getTime();
        if (elapsed <= STREAK_WINDOW_MS) {
          newCount = prev.count + 1;
        }
      }
      const today = getToday();
      const bestToday = today === prev.todayDate
        ? Math.max(prev.bestToday, newCount)
        : newCount;

      return { count: newCount, lastCompletedAt: now.toISOString(), bestToday, todayDate: today };
    });

    setShowFlame(true);
    setTimeout(() => setShowFlame(false), 2000);
  }, []);

  const getYesterdayBestStreak = useCallback((): number => {
    try {
      const stored = localStorage.getItem('flowya_streak_yesterday');
      if (stored) {
        const data = JSON.parse(stored);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        if (data.date === yStr) {
          return data.best;
        }
      }
    } catch {
      // Ignore
    }
    return 0;
  }, []);

  // Cache best today for yesterday's summary
  useEffect(() => {
    if (streak.bestToday > 0) {
      localStorage.setItem('flowya_streak_yesterday', JSON.stringify({
        date: getToday(),
        best: streak.bestToday,
      }));
    }
  }, [streak.bestToday]);

  return {
    count: streak.count,
    bestToday: streak.bestToday,
    isActive: streak.count >= 2,
    showFlame,
    recordCompletion,
    getYesterdayBestStreak,
  };
}
