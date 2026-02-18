import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Todo, Space } from '../types';

interface UseRealtimeOptions {
  onTodoInsert?: (todo: Todo) => void;
  onTodoUpdate?: (todo: Todo) => void;
  onTodoDelete?: (id: string) => void;
  onSpaceInsert?: (space: Space) => void;
  onSpaceUpdate?: (space: Space) => void;
  onSpaceDelete?: (id: string) => void;
  enabled?: boolean;
}

/**
 * Hook for subscribing to Supabase Realtime changes
 * Enables real-time sync between macOS and iOS apps
 */
export function useRealtime(options: UseRealtimeOptions) {
  const {
    onTodoInsert,
    onTodoUpdate,
    onTodoDelete,
    onSpaceInsert,
    onSpaceUpdate,
    onSpaceDelete,
    enabled = true,
  } = options;

  const todosChannelRef = useRef<RealtimeChannel | null>(null);
  const spacesChannelRef = useRef<RealtimeChannel | null>(null);

  // Store callbacks in refs to avoid re-subscribing on every render
  const callbacksRef = useRef({
    onTodoInsert,
    onTodoUpdate,
    onTodoDelete,
    onSpaceInsert,
    onSpaceUpdate,
    onSpaceDelete,
  });

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onTodoInsert,
      onTodoUpdate,
      onTodoDelete,
      onSpaceInsert,
      onSpaceUpdate,
      onSpaceDelete,
    };
  }, [onTodoInsert, onTodoUpdate, onTodoDelete, onSpaceInsert, onSpaceUpdate, onSpaceDelete]);

  const handleTodosChange = useCallback((
    payload: RealtimePostgresChangesPayload<Todo>
  ) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        if (newRecord && callbacksRef.current.onTodoInsert) {
          callbacksRef.current.onTodoInsert(newRecord as Todo);
        }
        break;
      case 'UPDATE':
        if (newRecord && callbacksRef.current.onTodoUpdate) {
          callbacksRef.current.onTodoUpdate(newRecord as Todo);
        }
        break;
      case 'DELETE':
        if (oldRecord && callbacksRef.current.onTodoDelete) {
          callbacksRef.current.onTodoDelete((oldRecord as { id: string }).id);
        }
        break;
    }
  }, []);

  const handleSpacesChange = useCallback((
    payload: RealtimePostgresChangesPayload<Space>
  ) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        if (newRecord && callbacksRef.current.onSpaceInsert) {
          callbacksRef.current.onSpaceInsert(newRecord as Space);
        }
        break;
      case 'UPDATE':
        if (newRecord && callbacksRef.current.onSpaceUpdate) {
          callbacksRef.current.onSpaceUpdate(newRecord as Space);
        }
        break;
      case 'DELETE':
        if (oldRecord && callbacksRef.current.onSpaceDelete) {
          callbacksRef.current.onSpaceDelete((oldRecord as { id: string }).id);
        }
        break;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Subscribe to todos changes
    todosChannelRef.current = supabase
      .channel('todos-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'todos',
        },
        handleTodosChange as (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => void
      )
      .subscribe((status) => {
        console.log('Todos realtime subscription status:', status);
      });

    // Subscribe to spaces changes
    spacesChannelRef.current = supabase
      .channel('spaces-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'spaces',
        },
        handleSpacesChange as (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => void
      )
      .subscribe((status) => {
        console.log('Spaces realtime subscription status:', status);
      });

    // Cleanup on unmount
    return () => {
      if (todosChannelRef.current) {
        supabase.removeChannel(todosChannelRef.current);
        todosChannelRef.current = null;
      }
      if (spacesChannelRef.current) {
        supabase.removeChannel(spacesChannelRef.current);
        spacesChannelRef.current = null;
      }
    };
  }, [enabled, handleTodosChange, handleSpacesChange]);

  return {
    isSubscribed: todosChannelRef.current !== null && spacesChannelRef.current !== null,
  };
}
