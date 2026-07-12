import { useState, useEffect, useCallback } from 'react';
import type { WeeklyGoal, Todo } from '../types';
import { fetchDisplayWeeklyGoals, getLastWeekGoals, updateWeeklyGoalCompletion, supabase } from '../lib/supabase';

interface UseWeeklyGoalsReturn {
  goals: WeeklyGoal[];
  lastWeekGoals: WeeklyGoal[];
  loading: boolean;
  hasGoalsThisWeek: boolean;
  showsPlannedWeekAhead: boolean;
  progress: { completed: number; total: number };
  refetch: () => Promise<void>;
  syncCompletion: (todos: Todo[]) => void;
  toggleGoalCompletion: (goalId: string) => void;
  toggleLastWeekGoalCompletion: (goalId: string) => void;
}

async function fetchMissingTodos(missingIds: string[]): Promise<Map<string, Todo>> {
  const map = new Map<string, Todo>();
  if (missingIds.length === 0) return map;
  const { data } = await supabase
    .from('todos')
    .select('*')
    .in('id', missingIds);
  if (data) {
    for (const t of data as Todo[]) {
      map.set(t.id, t);
    }
  }
  return map;
}

function getLinkedIds(goal: WeeklyGoal): string[] {
  return goal.linked_todo_ids?.length
    ? goal.linked_todo_ids
    : (goal.linked_todo_id ? [goal.linked_todo_id] : []);
}

export function useWeeklyGoals(userId: string | undefined): UseWeeklyGoalsReturn {
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [lastWeekGoals, setLastWeekGoals] = useState<WeeklyGoal[]>([]);
  const [showsPlannedWeekAhead, setShowsPlannedWeekAhead] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [display, previous] = await Promise.all([
        fetchDisplayWeeklyGoals(userId),
        getLastWeekGoals(userId),
      ]);
      setGoals(display.goals);
      setShowsPlannedWeekAhead(display.showsPlannedWeekAhead);
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

  // Realtime: refresh when goals change (MCP set_weekly_goals, completion sync, etc.)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`weekly-goals-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_goals', filter: `user_id=eq.${userId}` },
        () => { void fetchGoals(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, fetchGoals]);

  const syncCompletion = useCallback(async (todos: Todo[]) => {
    const todoMap = new Map(todos.map(t => [t.id, t]));

    const allGoals = [...goals, ...lastWeekGoals];
    const missingIds: string[] = [];
    for (const goal of allGoals) {
      for (const id of getLinkedIds(goal)) {
        if (!todoMap.has(id) && !missingIds.includes(id)) {
          missingIds.push(id);
        }
      }
    }

    const archivedMap = await fetchMissingTodos(missingIds);
    for (const [id, todo] of archivedMap) {
      todoMap.set(id, todo);
    }

    setGoals(prev => {
      const updated: WeeklyGoal[] = [];
      let changed = false;

      for (const goal of prev) {
        const ids = getLinkedIds(goal);
        if (ids.length === 0) { updated.push(goal); continue; }
        const linkedTodos = ids.map(id => todoMap.get(id)).filter(Boolean);
        if (linkedTodos.length === 0) { updated.push(goal); continue; }
        const isDone = linkedTodos.every(t => t!.status === 'done');

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

    setLastWeekGoals(prev => {
      const updated: WeeklyGoal[] = [];
      let changed = false;

      for (const goal of prev) {
        const ids = getLinkedIds(goal);
        if (ids.length === 0) { updated.push(goal); continue; }
        const linkedTodos = ids.map(id => todoMap.get(id)).filter(Boolean);
        if (linkedTodos.length === 0) { updated.push(goal); continue; }
        const isDone = linkedTodos.every(t => t!.status === 'done');

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
  }, [goals, lastWeekGoals]);

  const toggleGoalCompletion = useCallback((goalId: string) => {
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      const newCompleted = !g.completed;
      updateWeeklyGoalCompletion(goalId, newCompleted);
      return { ...g, completed: newCompleted };
    }));
  }, []);

  const toggleLastWeekGoalCompletion = useCallback((goalId: string) => {
    setLastWeekGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      const newCompleted = !g.completed;
      updateWeeklyGoalCompletion(goalId, newCompleted);
      return { ...g, completed: newCompleted };
    }));
  }, []);

  const hasGoalsThisWeek = goals.length > 0;
  const completed = goals.filter(g => g.completed).length;
  const total = goals.length;

  return {
    goals,
    lastWeekGoals,
    loading,
    hasGoalsThisWeek,
    showsPlannedWeekAhead,
    progress: { completed, total },
    refetch: fetchGoals,
    syncCompletion,
    toggleGoalCompletion,
    toggleLastWeekGoalCompletion,
  };
}
