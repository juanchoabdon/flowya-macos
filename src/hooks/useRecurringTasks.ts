import { useState, useEffect, useCallback, useRef } from 'react';
import type { RecurringTask } from '../types';
import * as api from '../lib/supabase';

interface UseRecurringTasksReturn {
  recurringTasks: RecurringTask[];
  loading: boolean;
  createRecurringTask: (task: { space_id: string; text: string; days: number[] }) => Promise<RecurringTask | null>;
  updateRecurringTask: (id: string, updates: Partial<Pick<RecurringTask, 'text' | 'space_id' | 'days' | 'enabled'>>) => Promise<void>;
  deleteRecurringTask: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

function getTodayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function useRecurringTasks(
  userId: string | undefined,
  refetchTodos: () => Promise<void>
): UseRecurringTasksReturn {
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const hasAutoCreated = useRef(false);

  const fetchRecurringTasks = useCallback(async () => {
    if (!userId) {
      setRecurringTasks([]);
      setLoading(false);
      return;
    }
    try {
      const data = await api.getRecurringTasks(userId);
      setRecurringTasks(data);
    } catch (err) {
      console.error('Failed to fetch recurring tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRecurringTasks();
  }, [fetchRecurringTasks]);

  // Auto-create tasks for today on load
  useEffect(() => {
    if (!userId || loading || hasAutoCreated.current || recurringTasks.length === 0) return;
    hasAutoCreated.current = true;

    const today = getTodayDateString();
    const dayOfWeek = new Date().getDay(); // 0=Sun ... 6=Sat

    const tasksToCreate = recurringTasks.filter(
      rt => rt.enabled && rt.days.includes(dayOfWeek) && rt.last_created_date !== today
    );

    if (tasksToCreate.length === 0) return;

    (async () => {
      for (const rt of tasksToCreate) {
        try {
          await api.createTodoAtTop(rt.space_id, rt.text);
          await api.markRecurringTaskCreated(rt.id, today);
        } catch (err) {
          console.error(`Failed to auto-create recurring task "${rt.text}":`, err);
        }
      }
      await fetchRecurringTasks();
      await refetchTodos();
    })();
  }, [userId, loading, recurringTasks, fetchRecurringTasks, refetchTodos]);

  const createRecurringTask = useCallback(async (
    task: { space_id: string; text: string; days: number[] }
  ): Promise<RecurringTask | null> => {
    if (!userId) return null;
    try {
      const created = await api.createRecurringTask({ ...task, user_id: userId });
      setRecurringTasks(prev => [...prev, created]);
      return created;
    } catch (err) {
      console.error('Failed to create recurring task:', err);
      return null;
    }
  }, [userId]);

  const updateRecurringTask = useCallback(async (
    id: string,
    updates: Partial<Pick<RecurringTask, 'text' | 'space_id' | 'days' | 'enabled'>>
  ): Promise<void> => {
    try {
      const updated = await api.updateRecurringTask(id, updates);
      setRecurringTasks(prev => prev.map(rt => rt.id === id ? updated : rt));
    } catch (err) {
      console.error('Failed to update recurring task:', err);
    }
  }, []);

  const deleteRecurringTask = useCallback(async (id: string): Promise<void> => {
    try {
      setRecurringTasks(prev => prev.filter(rt => rt.id !== id));
      await api.deleteRecurringTask(id);
    } catch (err) {
      console.error('Failed to delete recurring task:', err);
      fetchRecurringTasks();
    }
  }, [fetchRecurringTasks]);

  return {
    recurringTasks,
    loading,
    createRecurringTask,
    updateRecurringTask,
    deleteRecurringTask,
    refetch: fetchRecurringTasks,
  };
}
