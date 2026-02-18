import { useState, useEffect, useCallback } from 'react';
import type { Space } from '../types';
import * as api from '../lib/supabase';

interface UseSpacesReturn {
  spaces: Space[];
  loading: boolean;
  error: Error | null;
  createSpace: (name: string) => Promise<Space | null>;
  updateSpace: (id: string, updates: Partial<Pick<Space, 'name' | 'color'>>) => Promise<Space | null>;
  deleteSpace: (id: string) => Promise<boolean>;
  reorderSpaces: (fromIndex: number, toIndex: number) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useSpaces(userId?: string): UseSpacesReturn {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSpaces = useCallback(async () => {
    if (!userId) {
      setSpaces([]);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const data = await api.getSpaces();
      setSpaces(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch spaces'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  const createSpace = useCallback(async (name: string): Promise<Space | null> => {
    if (!userId) return null;
    
    try {
      const newSpace = await api.createSpace(name, userId);
      // Optimistic update
      setSpaces(prev => [...prev, newSpace]);
      return newSpace;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create space'));
      return null;
    }
  }, [userId]);

  const updateSpace = useCallback(async (id: string, updates: Partial<Pick<Space, 'name' | 'color'>>): Promise<Space | null> => {
    try {
      // Optimistic update
      setSpaces(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      const updated = await api.updateSpace(id, updates);
      return updated;
    } catch (err) {
      // Revert on error
      fetchSpaces();
      setError(err instanceof Error ? err : new Error('Failed to update space'));
      return null;
    }
  }, [fetchSpaces]);

  const deleteSpace = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Optimistic update
      setSpaces(prev => prev.filter(s => s.id !== id));
      await api.deleteSpace(id);
      return true;
    } catch (err) {
      // Revert on error
      fetchSpaces();
      setError(err instanceof Error ? err : new Error('Failed to delete space'));
      return false;
    }
  }, [fetchSpaces]);

  const reorderSpaces = useCallback(async (fromIndex: number, toIndex: number): Promise<void> => {
    if (fromIndex === toIndex) return;
    
    // Optimistic update
    setSpaces(prev => {
      const newSpaces = [...prev];
      const [removed] = newSpaces.splice(fromIndex, 1);
      newSpaces.splice(toIndex, 0, removed);
      return newSpaces.map((s, i) => ({ ...s, position: i }));
    });
    
    try {
      // Get the new order of IDs
      const currentSpaces = [...spaces];
      const [removed] = currentSpaces.splice(fromIndex, 1);
      currentSpaces.splice(toIndex, 0, removed);
      await api.reorderSpaces(currentSpaces.map(s => s.id));
    } catch (err) {
      // Revert on error
      fetchSpaces();
      setError(err instanceof Error ? err : new Error('Failed to reorder spaces'));
    }
  }, [spaces, fetchSpaces]);

  return {
    spaces,
    loading,
    error,
    createSpace,
    updateSpace,
    deleteSpace,
    reorderSpaces,
    refetch: fetchSpaces,
  };
}
