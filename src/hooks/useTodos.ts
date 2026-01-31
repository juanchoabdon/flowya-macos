import { useState, useEffect, useCallback } from 'react';
import type { Todo } from '../types';
import * as api from '../lib/supabase';

// Special constant for "all todos" view
export const ALL_SPACES_ID = '__all__';

interface UseTodosReturn {
  todos: Todo[];
  loading: boolean;
  error: Error | null;
  createTodo: (text: string) => Promise<Todo | null>;
  updateTodo: (id: string, updates: Partial<Pick<Todo, 'text' | 'description' | 'status' | 'position'>>) => Promise<Todo | null>;
  deleteTodo: (id: string) => Promise<boolean>;
  archiveTodo: (id: string) => Promise<boolean>;
  archiveAllDone: () => Promise<boolean>;
  reorderTodos: (draggedId: string, targetId: string) => Promise<void>;
  refetch: () => Promise<void>;
  isAllView: boolean;
}

export function useTodos(spaceId: string | null): UseTodosReturn {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const isAllView = spaceId === ALL_SPACES_ID;

  const fetchTodos = useCallback(async () => {
    if (!spaceId) {
      setTodos([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Fetch all todos if "all" view, otherwise fetch for specific space
      const data = isAllView 
        ? await api.getAllTodos()
        : await api.getTodos(spaceId);
      setTodos(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch todos'));
    } finally {
      setLoading(false);
    }
  }, [spaceId, isAllView]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const createTodo = useCallback(async (text: string): Promise<Todo | null> => {
    // Can't create todos in "all" view - need a specific space
    if (!spaceId || isAllView) return null;

    try {
      const newTodo = await api.createTodo(spaceId, text);
      // Optimistic update - add to top
      setTodos(prev => [newTodo, ...prev]);
      return newTodo;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create todo'));
      return null;
    }
  }, [spaceId, isAllView]);

  const updateTodo = useCallback(async (
    id: string,
    updates: Partial<Pick<Todo, 'text' | 'description' | 'status' | 'position'>>
  ): Promise<Todo | null> => {
    try {
      // Optimistic update
      setTodos(prev => prev.map(t => {
        if (t.id === id) {
          return {
            ...t,
            ...updates,
            completed_at: updates.status !== undefined
              ? (updates.status === 'done' ? new Date().toISOString() : null)
              : t.completed_at,
          };
        }
        return t;
      }));

      const updated = await api.updateTodo(id, updates);
      return updated;
    } catch (err) {
      // Revert on error
      fetchTodos();
      setError(err instanceof Error ? err : new Error('Failed to update todo'));
      return null;
    }
  }, [fetchTodos]);

  const reorderTodos = useCallback(async (draggedId: string, targetId: string): Promise<void> => {
    if (draggedId === targetId) return;
    
    // Find the items
    const draggedIndex = todos.findIndex(t => t.id === draggedId);
    const targetIndex = todos.findIndex(t => t.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    // Create new array with reordered items
    const newTodos = [...todos];
    const [draggedItem] = newTodos.splice(draggedIndex, 1);
    newTodos.splice(targetIndex, 0, draggedItem);

    // Update positions
    const updatedTodos = newTodos.map((todo, index) => ({
      ...todo,
      position: index,
    }));

    // Optimistic update
    setTodos(updatedTodos);

    // Persist to database
    try {
      const todoIds = updatedTodos.map(t => t.id);
      await api.reorderTodos(todoIds);
    } catch (err) {
      // Revert on error
      fetchTodos();
      setError(err instanceof Error ? err : new Error('Failed to reorder todos'));
    }
  }, [todos, spaceId, fetchTodos]);

  const deleteTodo = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Optimistic update
      setTodos(prev => prev.filter(t => t.id !== id));
      await api.deleteTodo(id);
      return true;
    } catch (err) {
      // Revert on error
      fetchTodos();
      setError(err instanceof Error ? err : new Error('Failed to delete todo'));
      return false;
    }
  }, [fetchTodos]);

  const archiveTodo = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Optimistic update - remove from list
      setTodos(prev => prev.filter(t => t.id !== id));
      await api.archiveTodo(id);
      return true;
    } catch (err) {
      // Revert on error
      fetchTodos();
      setError(err instanceof Error ? err : new Error('Failed to archive todo'));
      return false;
    }
  }, [fetchTodos]);

  const archiveAllDone = useCallback(async (): Promise<boolean> => {
    try {
      // Optimistic update - remove all done from list
      setTodos(prev => prev.filter(t => t.status !== 'done'));
      await api.archiveAllDone(isAllView ? undefined : spaceId || undefined);
      return true;
    } catch (err) {
      // Revert on error
      fetchTodos();
      setError(err instanceof Error ? err : new Error('Failed to archive done todos'));
      return false;
    }
  }, [fetchTodos, spaceId, isAllView]);

  return {
    todos,
    loading,
    error,
    createTodo,
    updateTodo,
    deleteTodo,
    archiveTodo,
    archiveAllDone,
    reorderTodos,
    refetch: fetchTodos,
    isAllView,
  };
}
