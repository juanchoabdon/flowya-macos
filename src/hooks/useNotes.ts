import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note } from '../types';
import * as api from '../lib/supabase';
import { ALL_SPACES_ID } from './useTodos';

interface UseNotesReturn {
  notes: Note[];
  loading: boolean;
  createNote: (title: string, overrideSpaceId?: string) => Promise<Note | null>;
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'position'>>) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
  isAllView: boolean;
}

export function useNotes(spaceId: string | null, userId?: string): UseNotesReturn {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const isAllView = spaceId === ALL_SPACES_ID;
  const isInitialLoad = useRef(true);

  const fetchNotes = useCallback(async () => {
    if (!spaceId || !userId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    try {
      if (isInitialLoad.current) setLoading(true);
      const data = isAllView
        ? await api.getAllNotes()
        : await api.getNotes(spaceId);
      setNotes(data);
      isInitialLoad.current = false;
    } catch {
      // Table might not exist yet
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [spaceId, isAllView, userId]);

  useEffect(() => {
    isInitialLoad.current = true;
    fetchNotes();
  }, [fetchNotes]);

  const createNoteHandler = useCallback(async (title: string, overrideSpaceId?: string): Promise<Note | null> => {
    const targetSpaceId = overrideSpaceId || spaceId;
    if (!targetSpaceId || targetSpaceId === ALL_SPACES_ID) return null;

    try {
      const note = await api.createNote(targetSpaceId, title);
      setNotes(prev => [...prev, note]);
      return note;
    } catch {
      return null;
    }
  }, [spaceId]);

  const updateNoteHandler = useCallback(async (id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'position'>>): Promise<Note | null> => {
    try {
      const updated = await api.updateNote(id, updates);
      setNotes(prev => prev.map(n => n.id === id ? updated : n));
      return updated;
    } catch {
      return null;
    }
  }, []);

  const deleteNoteHandler = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.deleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    notes,
    loading,
    createNote: createNoteHandler,
    updateNote: updateNoteHandler,
    deleteNote: deleteNoteHandler,
    refetch: fetchNotes,
    isAllView,
  };
}
