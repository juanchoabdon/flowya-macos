import { useState, useEffect, useCallback } from 'react';
import type { WeeklyGoal, Todo } from '../types';
import { getWeeklyGoals, getLastWeekGoals, getMonday, updateWeeklyGoalCompletion } from '../lib/supabase';

interface UseWeeklyGoalsReturn {
  goals: WeeklyGoal[];
  lastWeekGoals: WeeklyGoal[];
  loading: boolean;
  hasGoalsThisWeek: boolean;
  progress: { completed: number; total: number };
  refetch: () => Promise<void>;
  syncCompletion: (todos: Todo[]) => void;
}

export function useWeeklyGoals(userId: string | undefined): UseWeeklyGoalsReturn {
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [lastWeekGoals, setLastWeekGoals] = useState<WeeklyGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const weekStart = getMonday();
      const [current, previous] = await Promise.all([
        getWeeklyGoals(userId, weekStart),
        getLastWeekGoals(userId),
      ]);
      setGoals(current);
      setLastWeekGoals(previous);
    } catch (err) {
      console.error('[WeeklyGoals] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const syncCompletion = useCallback((todos: Todo[]) => {
    const todoMap = new Map(todos.map(t => [t.id, t]));

    setGoals(prev => {
      const updated: WeeklyGoal[] = [];
      let changed = false;

      for (const goal of prev) {
        const ids = goal.linked_todo_ids?.length ? goal.linked_todo_ids : (goal.linked_todo_id ? [goal.linked_todo_id] : []);
        if (ids.length === 0) {
          updated.push(goal);
          continue;
        }
        const linkedTodos = ids.map(id => todoMap.get(id)).filter(Boolean);
        const isDone = linkedTodos.length > 0 && linkedTodos.every(t => t!.status === 'done');

        if (goal.completed !== isDone) {
          changed = true;
          updated.push({ ...goal, completed: isDone });
          updateWeeklyGoalCompletion(goal.id, isDone);
        } else {
          updated.push(goal);
        }
      }

      return changed ? updated : prev;
    });
  }, []);

  const hasGoalsThisWeek = goals.length > 0;
  const completed = goals.filter(g => g.completed).length;
  const total = goals.length;

  return {
    goals,
    lastWeekGoals,
    loading,
    hasGoalsThisWeek,
    progress: { completed, total },
    refetch: fetchGoals,
    syncCompletion,
  };
}
