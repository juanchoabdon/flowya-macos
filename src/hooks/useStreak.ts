import { useState, useCallback, useEffect } from 'react';

const STREAK_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY = 'flowya_streak';

interface StreakState {
  count: number;
  lastCompletedAt: string | null; // ISO timestamp
  bestToday: number;
  todayDate: string;
}

function getToday(): string {
  return new Date().toDateString();
}

function loadStreak(): StreakState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state: StreakState = JSON.parse(stored);
      // Reset bestToday if it's a new day
      if (state.todayDate !== getToday()) {
        return { count: 0, lastCompletedAt: null, bestToday: 0, todayDate: getToday() };
      }
      // Check if streak is still active (within 30 min window)
      if (state.lastCompletedAt) {
        const elapsed = Date.now() - new Date(state.lastCompletedAt).getTime();
        if (elapsed > STREAK_WINDOW_MS) {
          // Streak expired, keep bestToday
          return { ...state, count: 0, lastCompletedAt: null };
        }
      }
      return state;
    }
  } catch {
    // Ignore parse errors
  }
  return { count: 0, lastCompletedAt: null, bestToday: 0, todayDate: getToday() };
}

function saveStreak(state: StreakState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useStreak() {
  const [streak, setStreak] = useState<StreakState>(loadStreak);
  const [showFlame, setShowFlame] = useState(false);
  
  // Check if streak expired every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (streak.lastCompletedAt) {
        const elapsed = Date.now() - new Date(streak.lastCompletedAt).getTime();
        if (elapsed > STREAK_WINDOW_MS && streak.count > 0) {
          const newState = { ...streak, count: 0, lastCompletedAt: null };
          setStreak(newState);
          saveStreak(newState);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [streak]);
  
  // Record a task completion
  const recordCompletion = useCallback(() => {
    setStreak(prev => {
      const now = new Date();
      let newCount = 1;
      
      // Check if within streak window
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
      
      const newState: StreakState = {
        count: newCount,
        lastCompletedAt: now.toISOString(),
        bestToday,
        todayDate: today,
      };
      
      saveStreak(newState);
      return newState;
    });
    
    // Trigger flame animation
    setShowFlame(true);
    setTimeout(() => setShowFlame(false), 2000);
  }, []);
  
  // Get yesterday's best streak for daily summary
  const getYesterdayBestStreak = useCallback((): number => {
    try {
      const stored = localStorage.getItem('flowya_streak_yesterday');
      if (stored) {
        const data = JSON.parse(stored);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (data.date === yesterday.toDateString()) {
          return data.best;
        }
      }
    } catch {
      // Ignore
    }
    return 0;
  }, []);
  
  // Save today's best streak for tomorrow's summary (run at end of day or when streak updates)
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
