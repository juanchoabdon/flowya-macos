import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '../types';
import * as api from '../lib/supabase';

interface UseSettingsReturn {
  settings: Settings | null;
  loading: boolean;
  error: Error | null;
  updateSettings: (updates: Partial<Omit<Settings, 'id'>>) => Promise<Settings | null>;
  refetch: () => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSettings(data);
      setError(null);

      // Apply settings to window
      if (window.windowApi) {
        window.windowApi.setAlwaysOnTop(data.always_on_top);
        window.windowApi.setVisibleOnAllWorkspaces(data.visible_on_all_workspaces);
        window.windowApi.setOpacity(data.opacity);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch settings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (
    updates: Partial<Omit<Settings, 'id'>>
  ): Promise<Settings | null> => {
    try {
      // Optimistic update
      setSettings(prev => prev ? { ...prev, ...updates } : null);

      // Apply to window immediately
      if (window.windowApi) {
        if (updates.always_on_top !== undefined) {
          window.windowApi.setAlwaysOnTop(updates.always_on_top);
        }
        if (updates.visible_on_all_workspaces !== undefined) {
          window.windowApi.setVisibleOnAllWorkspaces(updates.visible_on_all_workspaces);
        }
        if (updates.opacity !== undefined) {
          window.windowApi.setOpacity(updates.opacity);
        }
      }

      const updated = await api.updateSettings(updates);
      return updated;
    } catch (err) {
      // Revert on error
      fetchSettings();
      setError(err instanceof Error ? err : new Error('Failed to update settings'));
      return null;
    }
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    updateSettings,
    refetch: fetchSettings,
  };
}
