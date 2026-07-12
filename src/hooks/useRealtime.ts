import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Todo, Space } from '../types';

const RECONNECT_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sessionId, setSessionId] = useState(0);

  const scheduleReconnect = useCallback((reason: string) => {
    console.warn(`[Realtime] ${reason} — reconnecting in 2s`);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      setSessionId((s) => s + 1);
      reconnectTimerRef.current = null;
    }, 2000);
  }, []);

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

    const channelSuffix = String(sessionId);

    // Subscribe to todos changes
    todosChannelRef.current = supabase
      .channel(`todos-realtime-${channelSuffix}`)
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
        console.log('[Realtime] Todos subscription:', status);
        if (RECONNECT_STATUSES.has(status)) {
          scheduleReconnect(`todos ${status}`);
        }
      });

    // Subscribe to spaces changes
    spacesChannelRef.current = supabase
      .channel(`spaces-realtime-${channelSuffix}`)
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
        console.log('[Realtime] Spaces subscription:', status);
        if (RECONNECT_STATUSES.has(status)) {
          scheduleReconnect(`spaces ${status}`);
        }
      });

    // Cleanup on unmount
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (todosChannelRef.current) {
        supabase.removeChannel(todosChannelRef.current);
        todosChannelRef.current = null;
      }
      if (spacesChannelRef.current) {
        supabase.removeChannel(spacesChannelRef.current);
        spacesChannelRef.current = null;
      }
    };
  }, [enabled, handleTodosChange, handleSpacesChange, sessionId, scheduleReconnect]);

  return {
    reconnect: useCallback(() => setSessionId((s) => s + 1), []),
  };
}
