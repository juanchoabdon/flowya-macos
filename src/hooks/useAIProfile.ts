import { useCallback } from 'react';
import type { Settings } from '../types';

interface UseAIProfileReturn {
  isSetup: boolean;
  roles: Record<string, string>;
  context: string;
  saveProfile: (roles: Record<string, string>, context: string) => Promise<void>;
}

export function useAIProfile(
  settings: Settings | null,
  updateSettings: (updates: Partial<Omit<Settings, 'id'>>) => Promise<Settings | null>,
): UseAIProfileReturn {
  const isSetup = settings?.ai_setup_complete ?? false;
  const roles = (settings?.ai_roles as Record<string, string>) ?? {};
  const context = settings?.ai_context ?? '';

  const saveProfile = useCallback(async (
    newRoles: Record<string, string>,
    newContext: string,
  ) => {
    await updateSettings({
      ai_roles: newRoles,
      ai_context: newContext,
      ai_setup_complete: true,
    });
  }, [updateSettings]);

  return {
    isSetup,
    roles,
    context,
    saveProfile,
  };
}
