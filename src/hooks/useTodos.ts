import { useState, useEffect, useCallback, useRef } from 'react';
import type { Todo } from '../types';
import * as api from '../lib/supabase';

// Special constant for "all todos" view
export const ALL_SPACES_ID = '__all__';

interface UseTodosReturn {
  todos: Todo[];
  loading: boolean;
  error: Error | null;
  createTodo: (text: string, overrideSpaceId?: string) => Promise<Todo | null>;
  updateTodo: (id: string, updates: Partial<Pick<Todo, 'text' | 'description' | 'status' | 'position' | 'priority' | 'due_date' | 'space_id'>>) => Promise<Todo | null>;
  unarchiveTodo: (id: string) => Promise<boolean>;
  archiveTodo: (id: string) => Promise<boolean>;
  archiveAllDone: () => Promise<boolean>;
  reorderTodos: (draggedId: string, targetId: string) => Promise<void>;
  refetch: () => Promise<void>;
  isAllView: boolean;
}

export function useTodos(spaceId: string | null, userId?: string): UseTodosReturn {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const isAllView = spaceId === ALL_SPACES_ID;

  const isInitialLoad = useRef(true);

  const fetchTodos = useCallback(async () => {
    if (!spaceId || !userId) {
      setTodos([]);
      setLoading(false);
      return;
    }

    try {
      if (isInitialLoad.current) {
        setLoading(true);
      }
      const data = isAllView 
        ? await api.getAllTodos()
        : await api.getTodos(spaceId);
      setTodos(data);
      setError(null);
      isInitialLoad.current = false;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch todos'));
    } finally {
      setLoading(false);
    }
  }, [spaceId, isAllView, userId]);

  useEffect(() => {
    isInitialLoad.current = true;
    fetchTodos();
  }, [fetchTodos]);

  const createTodo = useCallback(async (text: string, overrideSpaceId?: string): Promise<Todo | null> => {
    const targetSpaceId = overrideSpaceId || spaceId;
    if (!targetSpaceId || (isAllView && !overrideSpaceId)) return null;

    try {
      const newTodo = await api.createTodo(targetSpaceId, text);
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
    updates: Partial<Pick<Todo, 'text' | 'description' | 'status' | 'position' | 'priority' | 'due_date' | 'space_id'>>
  ): Promise<Todo | null> => {
    try {
      const currentTodo = todos.find(t => t.id === id);
      const finalUpdates = { ...updates };
      
      // When moving to a new status, set position to end so oldest are at top
      if (updates.status && updates.status !== currentTodo?.status) {
        const statusTodos = todos.filter(t => t.status === updates.status);
        const maxPosition = statusTodos.length > 0 
          ? Math.max(...statusTodos.map(t => t.position)) + 1 
          : 0;
        finalUpdates.position = maxPosition;
      }
      
      // Optimistic update
      setTodos(prev => prev.map(t => {
        if (t.id === id) {
          const newTodo = { ...t, ...finalUpdates };
          
          // Update timestamps based on status
          if (updates.status !== undefined) {
            if (updates.status === 'in_progress') {
              newTodo.started_at = new Date().toISOString();
              newTodo.completed_at = null;
            } else if (updates.status === 'done') {
              newTodo.completed_at = new Date().toISOString();
            } else {
              // backlog
              newTodo.started_at = null;
              newTodo.completed_at = null;
            }
          }
          
          return newTodo;
        }
        return t;
      }));

      const updated = await api.updateTodo(id, finalUpdates);
      return updated;
    } catch (err) {
      // Revert on error
      fetchTodos();
      setError(err instanceof Error ? err : new Error('Failed to update todo'));
      return null;
    }
  }, [fetchTodos, todos]);

  const reorderTodos = useCallback(async (draggedId: string, targetId: string): Promise<void> => {
    if (draggedId === targetId) return;
    
    // Find the dragged item to get its status
    const draggedItem = todos.find(t => t.id === draggedId);
    
    if (!draggedItem) return;
    
    // Only reorder within same status
    const status = draggedItem.status;
    
    // Get only todos with the same status, sorted by position
    const statusTodos = todos
      .filter(t => t.status === status)
      .sort((a, b) => a.position - b.position);
    
    const draggedIndex = statusTodos.findIndex(t => t.id === draggedId);
    
    if (draggedIndex === -1) return;
    
    // Handle dropping at the end
    const isEndDrop = targetId === '__end__';
    let targetIndex: number;
    
    if (isEndDrop) {
      // Move to the end
      targetIndex = statusTodos.length - 1;
      // If already at the end, nothing to do
      if (draggedIndex === targetIndex) return;
    } else {
      const targetItem = todos.find(t => t.id === targetId);
      if (!targetItem) return;
      targetIndex = statusTodos.findIndex(t => t.id === targetId);
      if (targetIndex === -1) return;
    }

    // Reorder within the status group
    const newStatusTodos = [...statusTodos];
    const [removed] = newStatusTodos.splice(draggedIndex, 1);
    
    if (isEndDrop) {
      // Push to the end
      newStatusTodos.push(removed);
    } else {
      newStatusTodos.splice(targetIndex, 0, removed);
    }

    // Update positions only for this status group
    const updatedStatusTodos = newStatusTodos.map((todo, index) => ({
      ...todo,
      position: index,
    }));
    
    // Merge back with other todos
    const otherTodos = todos.filter(t => t.status !== status);
    const updatedTodos = [...otherTodos, ...updatedStatusTodos];

    // Optimistic update
    setTodos(updatedTodos);

    // Persist to database - only update the reordered status todos
    try {
      const todoIds = updatedStatusTodos.map(t => t.id);
      await api.reorderTodos(todoIds);
    } catch (err) {
      // Revert on error
      fetchTodos();
      setError(err instanceof Error ? err : new Error('Failed to reorder todos'));
    }
  }, [todos, fetchTodos]);

  const unarchiveTodo = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.unarchiveTodo(id);
      await fetchTodos();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to unarchive todo'));
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
    unarchiveTodo,
    archiveTodo,
    archiveAllDone,
    reorderTodos,
    refetch: fetchTodos,
    isAllView,
  };
}
