import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSpaces } from './hooks/useSpaces';
import { useTodos } from './hooks/useTodos';
import { useSettings } from './hooks/useSettings';
import { useAuth } from './hooks/useAuth';
import { useRealtime } from './hooks/useRealtime';
import { GlassBar } from './components/GlassBar';
import { AddTodo } from './components/AddTodo';
import { FilterBar } from './components/FilterBar';
import { TodoList } from './components/TodoList';
import { TodoDetail } from './components/TodoDetail';
import { Login } from './components/Login';
import { WhatsNewModal } from './components/WhatsNewModal';
import { DailySummary, shouldShowDailySummary } from './components/DailySummary';
import { AIOnboarding } from './components/AIOnboarding';
import { OnboardingModal } from './components/OnboardingModal';
import { AIRecommendation } from './components/AIRecommendation';
import { AIHubModal } from './components/AIHubModal';
import { AIRenameModal } from './components/AIRenameModal';
import { useStreak } from './hooks/useStreak';
import { useAIProfile } from './hooks/useAIProfile';
import { AIDuplicatesModal } from './components/AIDuplicatesModal';
import { RecurringTasksModal } from './components/RecurringTasksModal';
import { ConnectAIModal } from './components/ConnectAI';
import { MembershipModal } from './components/Membership';
import { SpaceUpsellModal } from './components/SpaceUpsellModal';
import { useEntitlement } from './hooks/useEntitlement';
import { useRecurringTasks } from './hooks/useRecurringTasks';
import { useAgent } from './hooks/useAgent';
import { AgentOverlay, AgentConfirmDialog } from './components/AgentOverlay';
import { prioritizeTasks, renameTasks, findDuplicates } from './lib/openai';
import { NotesView } from './components/NotesView';
import { useNotes } from './hooks/useNotes';
import type { FilterType, ViewMode, Todo, Priority, AIAnalysisResult, AIRenameResult, AIRenameSuggestion, AIDuplicatesResult } from './types';
import * as analytics from './lib/analytics';

export default function App() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  // App-wide Pro status. Kept live via Realtime so a purchase unlocks features
  // (e.g. unlimited spaces) even while no billing modal is open.
  const { isPro, loading: entitlementLoading } = useEntitlement(user?.id);
  const { spaces, loading: spacesLoading, createSpace, updateSpace, deleteSpace, reorderSpaces } = useSpaces(user?.id);
  const { settings, loading: settingsLoading, updateSettings } = useSettings(user?.id);
  const { count: streakCount, bestToday: streakBestToday, isActive: streakActive, showFlame, recordCompletion: recordStreakCompletion, getYesterdayBestStreak } = useStreak(user?.id);
  const { roles: aiRoles, context: aiContext, isSetup: aiIsSetup, saveProfile: saveAIProfile } = useAIProfile(settings, updateSettings);

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>('__all__');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('flowya_view_mode') as ViewMode) || 'tasks'; }
    catch { return 'tasks'; }
  });
  const [filter, setFilter] = useState<FilterType>('in_progress');
  const [windowFocused, setWindowFocused] = useState(true);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);
  const [deletedTodo, setDeletedTodo] = useState<Todo | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showDailySummary, setShowDailySummary] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [streakParticles, setStreakParticles] = useState<{id: number; x: number; y: number; emoji: string}[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [focusDescription, setFocusDescription] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [highlightTodoId, setHighlightTodoId] = useState<string | null>(null);
  // Window mode: 'welcome' = centered login/onboarding window, 'docked' = notch pill.
  const [docking, setDocking] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try { return localStorage.getItem('flowya_onboarding_done') === '1'; } catch { return false; }
  });

  // AI Prioritization state
  const [showAIOnboarding, setShowAIOnboarding] = useState(false);
  const [aiEditMode, setAIEditMode] = useState(false);
  const [showAIRecommendation, setShowAIRecommendation] = useState(false);
  const [aiResult, setAIResult] = useState<AIAnalysisResult | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [aiScope, setAIScope] = useState<'all' | string>('all');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // AI Hub & Rename state
  const [showAIHub, setShowAIHub] = useState(false);
  const [showAIRename, setShowAIRename] = useState(false);
  const [aiRenameResult, setAIRenameResult] = useState<AIRenameResult | null>(null);
  const [aiRenameLoading, setAIRenameLoading] = useState(false);
  const [aiRenameError, setAIRenameError] = useState<string | null>(null);

  // Recurring Tasks state
  const [showRecurringTasks, setShowRecurringTasks] = useState(false);
  const [showConnectAI, setShowConnectAI] = useState(false);
  const [showMembership, setShowMembership] = useState(false);
  const [showSpaceUpsell, setShowSpaceUpsell] = useState(false);

  // Duplicates state
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [dupResult, setDupResult] = useState<AIDuplicatesResult | null>(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);

  const {
    todos,
    loading: todosLoading,
    createTodo,
    updateTodo,
    unarchiveTodo,
    archiveTodo,
    archiveAllDone,
    reorderTodos,
    refetch: refetchTodos,
    isAllView,
  } = useTodos(selectedSpaceId, user?.id);

  const {
    notes,
    loading: notesLoading,
    createNote,
    updateNote,
    deleteNote,
    isAllView: notesAllView,
  } = useNotes(selectedSpaceId, user?.id);

  const {
    recurringTasks,
    createRecurringTask: createRecurring,
    updateRecurringTask: updateRecurring,
    deleteRecurringTask: deleteRecurring,
  } = useRecurringTasks(user?.id, refetchTodos);

  // Agent state
  const agent = useAgent();
  const [agentConfirmTask, setAgentConfirmTask] = useState<{ text: string; description?: string } | null>(null);

  const handleAgentExecute = (taskText: string, taskDescription?: string) => {
    setAgentConfirmTask({ text: taskText, description: taskDescription });
  };

  const handleAgentConfirm = (apiKey: string) => {
    if (agentConfirmTask) {
      agent.startAgent(apiKey, agentConfirmTask.text, agentConfirmTask.description);
      setAgentConfirmTask(null);
    }
  };

  // Detect fresh signup: account created less than 24 hours ago
  const isNewAccount = useCallback(() => {
    if (!user?.created_at) return false;
    const createdAt = new Date(user.created_at).getTime();
    return Date.now() - createdAt < 24 * 60 * 60 * 1000;
  }, [user?.created_at]);

  // First-run onboarding now runs in the dedicated welcome window (see appMode /
  // OnboardingModal below). The legacy in-app AI onboarding overlay is kept only for
  // the manual "edit AI profile" flow and no longer auto-opens on launch.

  // Initialize analytics once
  useEffect(() => {
    analytics.initAnalytics();
  }, []);

  // Identify user when logged in
  useEffect(() => {
    if (user) {
      analytics.identifyUser(user.id, user.email, settings?.nickname || undefined);
      analytics.trackSignIn(user.id, user.email);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh dock icon after login and check auto-trigger chain:
  // AI Onboarding (highest) > Daily Summary (lowest)
  const prevUserRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserRef.current === undefined && user?.id) {
      window.windowApi?.refreshDock();

      if (!isNewAccount()) {
        if (!aiIsSetup) {
          // AI Onboarding takes priority -- its own useEffect handles showing it
        } else if (shouldShowDailySummary()) {
          setTimeout(() => {
            analytics.trackViewDailySummary('morning');
            setShowDailySummary(true);
          }, 500);
        }
      }
    }
    prevUserRef.current = user?.id;
  }, [user?.id, aiIsSetup, isNewAccount]);

  // Show onboarding for new accounts only once spaces have loaded and there are none
  // DISABLED - onboarding flow removed

  // Create default space if none exist (skip if onboarding is handling it)
  useEffect(() => {
    if (!spacesLoading && spaces.length === 0 && !isNewAccount()) {
      createSpace('Personal').then(space => {
        if (space) setSelectedSpaceId(space.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spacesLoading, spaces.length]);

  // Save last selected space
  useEffect(() => {
    if (
      selectedSpaceId &&
      selectedSpaceId !== '__all__' &&
      settings &&
      settings.last_selected_space !== selectedSpaceId
    ) {
      updateSettings({ last_selected_space: selectedSpaceId });
    }
  }, [selectedSpaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSpace = useCallback((id: string) => {
    setSelectedSpaceId(id);
    const spaceName = id === '__all__' ? 'All' : spaces.find(s => s.id === id)?.name || 'Unknown';
    analytics.trackSwitchSpace(id, spaceName);
  }, [spaces]);

  // Cmd+1-9 to switch workspaces (1 = All, 2-9 = spaces by order)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const num = parseInt(e.key);

        if (num === 1) {
          analytics.trackUseShortcut(`cmd+${num}`);
          handleSelectSpace('__all__');
        } else if (num - 1 <= spaces.length) {
          const space = spaces[num - 2];
          if (space) {
            analytics.trackUseShortcut(`cmd+${num}`);
            handleSelectSpace(space.id);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [spaces, handleSelectSpace]);

  // Listen for window focus changes -- same priority chain as login
  useEffect(() => {
    if (window.windowApi?.onFocusChange) {
      const unsubscribe = window.windowApi.onFocusChange((focused) => {
        setWindowFocused(focused);
        if (focused && aiIsSetup && !isNewAccount()) {
          if (shouldShowDailySummary()) {
            setTimeout(() => {
              analytics.trackViewDailySummary('morning');
              setShowDailySummary(true);
            }, 500);
          }
        }
      });
      return unsubscribe;
    }
  }, [aiIsSetup]);

  // The single task surfaced in the collapsed pill: highest-priority in-progress,
  // falling back to highest-priority backlog. Mirrors the pill render logic.
  const pillTopTask = useMemo(() => {
    const byPosition = (a: Todo, b: Todo) => a.position - b.position;
    const active = todos.filter(t => !t.archived && t.status !== 'done');
    const inProgress = active.filter(t => t.status === 'in_progress').sort(byPosition);
    const backlog = active.filter(t => t.status === 'backlog').sort(byPosition);
    return inProgress[0] || backlog[0] || null;
  }, [todos]);

  // Listen for expand state changes from Electron
  useEffect(() => {
    if (window.windowApi?.onExpandStateChanged) {
      return window.windowApi.onExpandStateChanged((exp) => setExpanded(exp));
    }
  }, []);

  // When the panel expands, surface the pill's task in the list: if it's in
  // progress switch to that filter, then highlight/scroll to it briefly.
  useEffect(() => {
    if (!expanded || !pillTopTask) {
      setHighlightTodoId(null);
      return;
    }
    if (pillTopTask.status === 'in_progress') {
      setFilter('in_progress');
    }
    setHighlightTodoId(pillTopTask.id);
    const timer = setTimeout(() => setHighlightTodoId(null), 2600);
    return () => clearTimeout(timer);
  }, [expanded]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expanded) {
        window.windowApi?.collapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded]);

  // ---- Window mode (welcome vs docked) ----
  // A brand-new user should meet Flowya in a proper centered window (login +
  // onboarding), not squeezed into the notch pill. Once they're set up, the
  // window "docks" into the notch.
  //
  // The onboarding is latched: `ai_setup_complete` flips true mid-flow (at the
  // roles/context step, before the first-task step), so we must keep the modal
  // open until the user explicitly finishes/skips rather than reacting to aiIsSetup.
  const [onboardingActive, setOnboardingActive] = useState(false);
  useEffect(() => {
    if (!!user && !settingsLoading && !!settings && !aiIsSetup && !onboardingDismissed) {
      setOnboardingActive(true);
    }
  }, [user, settingsLoading, settings, aiIsSetup, onboardingDismissed]);

  const needsOnboarding = onboardingActive && !onboardingDismissed;
  const appMode: 'welcome' | 'docked' =
    !authLoading && (!user || needsOnboarding) ? 'welcome' : 'docked';

  const prevAppModeRef = useRef<'welcome' | 'docked'>('docked');
  const cameFromOnboardingRef = useRef(false);

  // Remember if we ever entered onboarding, so the first dock can reveal the panel.
  useEffect(() => {
    if (needsOnboarding) cameFromOnboardingRef.current = true;
  }, [needsOnboarding]);

  // Drive the native window: grow into welcome, or shrink/dock into the notch.
  useEffect(() => {
    if (authLoading) return;
    const prev = prevAppModeRef.current;
    if (appMode === 'welcome') {
      // The panel can never be "expanded" in welcome mode; clear any stale state
      // (e.g. the user signed out from the expanded panel).
      setExpanded(false);
    }
    if (prev === 'welcome' && appMode === 'docked') {
      // Keep a full dark panel until the shrink finishes to avoid an empty flash.
      setDocking(true);
    }
    prevAppModeRef.current = appMode;
    window.windowApi?.setWindowMode?.(appMode);
  }, [appMode, authLoading]);

  // Clear the docking filler once the native shrink completes, and reveal the
  // panel once the very first time a freshly-onboarded user lands in the notch.
  useEffect(() => {
    if (!window.windowApi?.onModeChanged) return;
    return window.windowApi.onModeChanged((mode) => {
      if (mode !== 'docked') return;
      setDocking(false);
      setExpanded(false); // always land as the collapsed pill after docking
      let seenPill = false;
      try { seenPill = localStorage.getItem('flowya_seen_pill') === '1'; } catch { /* ignore */ }
      if (cameFromOnboardingRef.current && !seenPill) {
        try { localStorage.setItem('flowya_seen_pill', '1'); } catch { /* ignore */ }
        setTimeout(() => window.windowApi?.expand?.(), 800);
      }
      cameFromOnboardingRef.current = false;
    });
  }, []);

  const handleFinishOnboarding = useCallback(() => {
    try { localStorage.setItem('flowya_onboarding_done', '1'); } catch { /* ignore */ }
    setShowAIOnboarding(false);
    setOnboardingActive(false);
    setOnboardingDismissed(true);
  }, []);

  // Auto-switch filter only when space actually changes (not on refetch)
  const prevSpaceRef = useRef<string | null>(null);
  const prevLoadingRef = useRef(true);
  const pendingSpaceSwitch = useRef(false);

  useEffect(() => {
    if (selectedSpaceId !== prevSpaceRef.current) {
      prevSpaceRef.current = selectedSpaceId;
      pendingSpaceSwitch.current = true;
    }
  }, [selectedSpaceId]);

  useEffect(() => {
    const justFinishedLoading = prevLoadingRef.current && !todosLoading;
    prevLoadingRef.current = todosLoading;

    if (justFinishedLoading && pendingSpaceSwitch.current) {
      pendingSpaceSwitch.current = false;
      const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
      setFilter(inProgressCount > 0 ? 'in_progress' : 'backlog');
    }
  }, [todosLoading, todos]);

  // Debounced refetch for realtime events — reorder sends N updates at once;
  // coalesce them into a single fetch 120 ms after the last event.
  const realtimeRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefetch = useCallback(() => {
    if (realtimeRefetchTimer.current) clearTimeout(realtimeRefetchTimer.current);
    realtimeRefetchTimer.current = setTimeout(() => {
      void refetchTodos();
      realtimeRefetchTimer.current = null;
    }, 120);
  }, [refetchTodos]);

  // Track recent local changes to avoid refetch blink from realtime echo
  const recentLocalChanges = useRef<Map<string, number>>(new Map());

  const markLocalChange = useCallback((todoId: string) => {
    recentLocalChanges.current.set(todoId, Date.now());
    setTimeout(() => {
      recentLocalChanges.current.delete(todoId);
    }, 5000);
  }, []);

  const isLocalChange = useCallback((todoId: string): boolean => {
    const timestamp = recentLocalChanges.current.get(todoId);
    if (!timestamp) return false;
    return Date.now() - timestamp < 5000;
  }, []);

  // Realtime sync with iOS app
  useRealtime({
    enabled: !!user?.id,
    onTodoInsert: useCallback((todo: Todo) => {
      if (isLocalChange(todo.id)) return;
      console.log('[Realtime] Todo inserted from another device:', todo.id);
      debouncedRefetch();
    }, [debouncedRefetch, isLocalChange]),
    onTodoUpdate: useCallback((todo: Todo) => {
      if (isLocalChange(todo.id)) {
        if (detailTodo?.id === todo.id) {
          setDetailTodo(todo);
        }
        return;
      }
      console.log('[Realtime] Todo updated from another device:', todo.id);
      debouncedRefetch();
      if (detailTodo?.id === todo.id) {
        setDetailTodo(todo);
      }
    }, [debouncedRefetch, detailTodo?.id, isLocalChange]),
    onTodoDelete: useCallback((id: string) => {
      if (isLocalChange(id)) return;
      console.log('[Realtime] Todo deleted from another device:', id);
      debouncedRefetch();
      if (detailTodo?.id === id) {
        setDetailTodo(null);
      }
    }, [debouncedRefetch, detailTodo?.id, isLocalChange]),
  });

  // Auto-sync when reconnecting to internet or window regains visibility
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Sync] Back online, refetching...');
      refetchTodos();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Sync] Window visible again, refetching...');
        refetchTodos();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetchTodos]);

  // Secret: Cmd+Shift+D to show today's progress
  const [showTodaySummary, setShowTodaySummary] = useState(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        analytics.trackViewDailySummary('manual');
        analytics.trackUseShortcut('cmd+shift+d');
        setShowTodaySummary(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cmd+F to search
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        analytics.trackUseShortcut('cmd+f');
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  // Cmd+Z to undo delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && deletedTodo && showUndoToast) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deletedTodo, showUndoToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateSpace = async (name: string) => {
    const space = await createSpace(name);
    if (space) {
      setSelectedSpaceId(space.id);
      analytics.trackSpaceCreated(space.id, space.name);
    }
  };

  const handleDeleteSpace = async (id: string) => {
    const spaceToDelete = spaces.find(s => s.id === id);
    await deleteSpace(id);
    analytics.trackSpaceDeleted(id, spaceToDelete?.name);
    const remaining = spaces.filter(s => s.id !== id);
    if (remaining.length > 0) {
      setSelectedSpaceId(remaining[0].id);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 2500);
  };

  const handleAIHubPrioritize = () => {
    setShowAIHub(false);
    handleAIAnalyze();
  };

  const handleAIHubRename = () => {
    setShowAIHub(false);
    handleAIRenameAnalyze();
  };

  const handleAIOnboardingComplete = async (roles: Record<string, string>, context: string) => {
    try {
      await saveAIProfile(roles, context);
    } catch (err) {
      console.error('[AI] Failed to save profile:', err);
    }
    analytics.trackAISetupComplete();
    const wasEditMode = aiEditMode;
    setAIEditMode(false);
    setShowAIOnboarding(false);
    if (!wasEditMode) {
      handleAIAnalyzeWithProfile(roles, context);

      // After first-time onboarding, chain into daily summary / weekly planning
      setTimeout(() => {
        if (shouldShowDailySummary()) {
          analytics.trackViewDailySummary('morning');
          setShowDailySummary(true);
        }
      }, 600);
    } else {
      showSuccess('AI profile updated ✓');
    }
  };

  const handleAIAnalyze = async () => {
    const scope = isAllView ? 'all' : (selectedSpaceId || 'all');
    setAIScope(scope);
    setAILoading(true);
    setAIError(null);
    setShowAIRecommendation(true);
    setAIResult(null);
    analytics.trackAIPrioritize(scope === 'all' ? 'all' : 'space');

    try {
      const result = await prioritizeTasks(
        { roles: aiRoles, context: aiContext },
        todos,
        spaces,
        scope,
      );
      setAIResult(result);
    } catch (err) {
      console.error('[AI] Prioritization failed:', err);
      setAIError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setAILoading(false);
    }
  };

  const handleAIAnalyzeWithProfile = async (roles: Record<string, string>, context: string) => {
    const scope = isAllView ? 'all' : (selectedSpaceId || 'all');
    setAIScope(scope);
    setAILoading(true);
    setAIError(null);
    setShowAIRecommendation(true);
    setAIResult(null);
    analytics.trackAIPrioritize(scope === 'all' ? 'all' : 'space');

    try {
      const result = await prioritizeTasks(
        { roles, context },
        todos,
        spaces,
        scope,
      );
      setAIResult(result);
    } catch (err) {
      console.error('[AI] Prioritization failed:', err);
      setAIError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setAILoading(false);
    }
  };

  const handleAcceptRecommendations = async () => {
    if (!aiResult) return;

    const keepRecs = aiResult.recommendations.filter(r => r.action === 'keep');
    const archiveRecs = aiResult.recommendations.filter(r => r.action === 'archive');

    for (let i = 0; i < keepRecs.length; i++) {
      const rec = keepRecs[i];
      const todo = todos.find(t => t.id === rec.todoId);
      if (!todo) continue;

      markLocalChange(rec.todoId);
      const updates: Record<string, unknown> = { position: i };
      if (todo.priority !== rec.newPriority) {
        updates.priority = rec.newPriority;
      }
      await updateTodo(rec.todoId, updates as { priority?: Priority; position?: number });
    }

    for (const rec of archiveRecs) {
      markLocalChange(rec.todoId);
      await archiveTodo(rec.todoId);
    }

    analytics.trackAIAccept(keepRecs.length + archiveRecs.length);
    setShowAIRecommendation(false);
    setAIResult(null);
    await refetchTodos();
    showSuccess('Prioritization applied ✓');
  };

  const handleAIRenameAnalyze = async () => {
    const scope = isAllView ? 'all' : (selectedSpaceId || 'all');
    setAIRenameLoading(true);
    setAIRenameError(null);
    setShowAIRename(true);
    setAIRenameResult(null);

    try {
      const profile = aiIsSetup ? { roles: aiRoles || {}, context: aiContext || '' } : null;
      const result = await renameTasks(profile, todos, spaces, scope);
      setAIRenameResult(result);
    } catch (err) {
      console.error('[AI] Rename failed:', err);
      setAIRenameError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setAIRenameLoading(false);
    }
  };

  const handleAcceptRenames = async (selected: AIRenameSuggestion[]) => {
    selected.forEach(s => markLocalChange(s.todoId));

    await Promise.all(
      selected.map(s => updateTodo(s.todoId, { text: s.newName }))
    );

    setShowAIRename(false);
    setAIRenameResult(null);
    await refetchTodos();
    showSuccess(`${selected.length} task${selected.length !== 1 ? 's' : ''} renamed ✓`);
  };

  // Duplicates handlers
  const handleAIHubDuplicates = () => {
    setShowAIHub(false);
    setDupLoading(true);
    setDupError(null);
    setDupResult(null);
    setShowDuplicates(true);

    findDuplicates(todos, spaces)
      .then(result => {
        setDupResult(result);
        analytics.trackAIDuplicates(result.groups.length);
      })
      .catch(err => {
        console.error('[AI] Duplicates failed:', err);
        setDupError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      })
      .finally(() => setDupLoading(false));
  };

  const handleAcceptDuplicates = async (removeTodoIds: string[]) => {
    for (const id of removeTodoIds) {
      markLocalChange(id);
      await archiveTodo(id);
    }
    setShowDuplicates(false);
    setDupResult(null);
    await refetchTodos();
    analytics.trackAIDuplicatesAccept(removeTodoIds.length);
    showSuccess(`${removeTodoIds.length} duplicate${removeTodoIds.length !== 1 ? 's' : ''} removed ✓`);
  };

  const handleStatusChange = (todoId: string, status: 'backlog' | 'in_progress' | 'done') => {
    markLocalChange(todoId);
    const todo = todos.find(t => t.id === todoId);
    const spaceName = todo ? spaces.find(s => s.id === todo.space_id)?.name : undefined;

    if (todo && status !== 'done') {
      const sameCategoryTodos = todos.filter(t =>
        t.status === status && t.id !== todoId
      );
      const priority = todo.priority || 'P1';

      let isUrgent = false;
      if (todo.due_date) {
        const dueDate = new Date(todo.due_date);
        const now = new Date();
        const diffMs = dueDate.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        isUrgent = diffMs < 0 || diffHours <= 1;
      }

      if (priority === 'P0' || isUrgent) {
        const minPos = Math.min(...sameCategoryTodos.map(t => t.position), 0);
        updateTodo(todoId, { status, position: Math.floor(minPos - 1) });
      } else if (priority === 'P2' || priority === 'P3') {
        const maxPos = Math.max(...sameCategoryTodos.map(t => t.position), 0);
        updateTodo(todoId, { status, position: Math.floor(maxPos + 1) });
      } else {
        const p0Tasks = sameCategoryTodos.filter(t => t.priority === 'P0');
        const p1Tasks = sameCategoryTodos.filter(t => !t.priority || t.priority === 'P1');

        if (p0Tasks.length > 0 && p1Tasks.length > 0) {
          const maxP0Pos = Math.max(...p0Tasks.map(t => t.position));
          const minP1Pos = Math.min(...p1Tasks.map(t => t.position));
          updateTodo(todoId, { status, position: Math.floor((maxP0Pos + minP1Pos) / 2) });
        } else if (p0Tasks.length > 0) {
          const maxP0Pos = Math.max(...p0Tasks.map(t => t.position));
          updateTodo(todoId, { status, position: Math.floor(maxP0Pos + 1) });
        } else {
          updateTodo(todoId, { status });
        }
      }
    } else {
      updateTodo(todoId, { status });
    }

    // Record streak on task completion
    if (status === 'done') {
      recordStreakCompletion();
      if (streakCount >= 1) {
        const emojis = ['🔥', '⚡️', '✨', '💥', '🎯'];
        const newParticles = Array.from({ length: 8 }, (_, i) => ({
          id: Date.now() + i,
          x: Math.random() * window.innerWidth,
          y: window.innerHeight * 0.4 + Math.random() * window.innerHeight * 0.3,
          emoji: emojis[Math.floor(Math.random() * emojis.length)],
        }));
        setStreakParticles(newParticles);
        setTimeout(() => setStreakParticles([]), 2000);
      }
    }

    analytics.trackTodoProgress(todoId, status, spaceName);
  };

  const handleFilterChange = (newFilter: FilterType) => {
    setFilter(newFilter);
    const spaceName = selectedSpaceId === '__all__' ? 'All' : spaces.find(s => s.id === selectedSpaceId)?.name || 'Unknown';
    analytics.trackViewKanban(newFilter, spaceName);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem('flowya_view_mode', mode); } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    const todoToDelete = todos.find(t => t.id === id);
    if (!todoToDelete) return;
    setDeletedTodo(todoToDelete);
    setShowUndoToast(true);
    markLocalChange(todoToDelete.id);
    await archiveTodo(todoToDelete.id);

    // Auto-hide toast after 5 seconds
    setTimeout(() => {
      setShowUndoToast(false);
      setDeletedTodo(null);
    }, 5000);

    if (detailTodo?.id === id) {
      setDetailTodo(null);
    }
  };

  const handleUndo = async () => {
    if (!deletedTodo) return;
    markLocalChange(deletedTodo.id);
    await unarchiveTodo(deletedTodo.id);
    setShowUndoToast(false);
    setDeletedTodo(null);
  };

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId);

  // Celebration animation for drag & drop to Done
  const triggerCelebration = () => {
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    const container = document.querySelector('.app-container');
    if (!container) return;

    for (let i = 0; i < 30; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti-particle';
      confetti.style.left = `${Math.random() * 100}%`;
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = `${Math.random() * 0.5}s`;
      confetti.style.animationDuration = `${1 + Math.random() * 1}s`;
      container.appendChild(confetti);

      setTimeout(() => confetti.remove(), 2000);
    }
  };

  // Filter todos by status, priority, and search query, then apply sorting
  const filteredTodos = todos
    .filter(todo => {
      // Status filter
      if (filter === 'backlog' && todo.status !== 'backlog') return false;
      if (filter === 'in_progress' && todo.status !== 'in_progress') return false;
      if (filter === 'done' && todo.status !== 'done') return false;

      // Priority filter (only for backlog and in_progress)
      if (priorityFilter && filter !== 'done') {
        const todoPriority = todo.priority || 'P1';
        if (todoPriority !== priorityFilter) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText = todo.text.toLowerCase().includes(query);
        const matchesDescription = todo.description?.toLowerCase().includes(query);
        if (!matchesText && !matchesDescription) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (filter === 'done') {
        const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return bTime - aTime;
      }
      // Group by status (in_progress → backlog → done), then by position within group.
      const statusOrder: Record<string, number> = { in_progress: 0, backlog: 1, done: 2 };
      const sa = statusOrder[a.status] ?? 1;
      const sb = statusOrder[b.status] ?? 1;
      if (sa !== sb) return sa - sb;
      return a.position - b.position;
    });

  // Count for display: done tasks vs pending (backlog + in_progress)
  const doneCount = todos.filter(t => t.status === 'done').length;
  const pendingCount = todos.filter(t => t.status !== 'done').length;


  // Swipe gesture handling for trackpad
  const swipeAccumulator = useRef(0);
  const swipeTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastSwipeTime = useRef(0);
  const filters: FilterType[] = ['backlog', 'in_progress', 'done'];

  const handleSwipe = useCallback((e: WheelEvent) => {
    if (viewMode !== 'tasks') return;
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;

    const swipeNow = Date.now();
    if (swipeNow - lastSwipeTime.current < 500) return;

    swipeAccumulator.current += e.deltaX;

    if (swipeTimeout.current) {
      clearTimeout(swipeTimeout.current);
    }

    const threshold = 150;

    if (Math.abs(swipeAccumulator.current) > threshold) {
      const currentIndex = filters.indexOf(filter);

      if (swipeAccumulator.current > 0 && currentIndex < filters.length - 1) {
        handleFilterChange(filters[currentIndex + 1]);
        lastSwipeTime.current = swipeNow;
      } else if (swipeAccumulator.current < 0 && currentIndex > 0) {
        handleFilterChange(filters[currentIndex - 1]);
        lastSwipeTime.current = swipeNow;
      }

      swipeAccumulator.current = 0;
    }

    swipeTimeout.current = setTimeout(() => {
      swipeAccumulator.current = 0;
    }, 150);
  }, [filter, filters, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add wheel event listener for swipe gestures
  useEffect(() => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.addEventListener('wheel', handleSwipe as EventListener, { passive: true });
      return () => {
        mainContent.removeEventListener('wheel', handleSwipe as EventListener);
      };
    }
  }, [handleSwipe]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
      </div>
    );
  }

  // Show login if not authenticated (rendered in the centered welcome window)
  if (!user) {
    return (
      <Login
        onSignInWithEmail={signInWithEmail}
        onSignUpWithEmail={signUpWithEmail}
      />
    );
  }

  if (spacesLoading || settingsLoading) {
    return (
      <div className={`app-container ${!windowFocused ? 'unfocused' : ''}`}>
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  // First-run onboarding, shown in the centered welcome window (no hover-collapse)
  if (needsOnboarding) {
    return (
      <OnboardingModal
        isOpen
        spaces={spaces}
        onCreateSpace={createSpace}
        onDeleteSpace={deleteSpace}
        onSaveAIProfile={saveAIProfile}
        onCreateTodo={createTodo}
        onClose={handleFinishOnboarding}
      />
    );
  }

  // While the window shrinks from welcome down into the notch, show a full dark
  // panel so no empty/white frame is visible during the resize.
  if (docking) {
    return <div className="docking-screen" />;
  }

  if (!expanded) {
    const topTask = pillTopTask;
    const hasAnyTask = todos.some(t => !t.archived);
    const spaceColor = selectedSpace?.color || settings?.all_spaces_color || '#6C63FF';
    const taskSpaceColor = topTask ? (spaces.find(s => s.id === topTask.space_id)?.color || spaceColor) : '#4ECDC4';
    return (
      <div
        className="pill-container"
      >
        <span className="pill-status-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M2 12C2 12 5 8 8 8C11 8 13 12 16 12C19 12 22 8 22 8" stroke={taskSpaceColor} strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M2 17C2 17 5 13 8 13C11 13 13 17 16 17C19 17 22 13 22 13" stroke={taskSpaceColor} strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </span>
        <span className="pill-task-name">
          {topTask ? topTask.text : (hasAnyTask ? 'All clear!' : 'Add your first task')}
        </span>
        {topTask ? (
          <span className={`pill-priority pill-priority-${topTask.priority}`}>
            {topTask.priority.toUpperCase()}
          </span>
        ) : hasAnyTask ? (
          <span className="pill-check">✓</span>
        ) : (
          <span className="pill-plus">+</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`app-container expanded-container ${!windowFocused ? 'unfocused' : ''}`}
    >
      <GlassBar
        spaces={spaces}
        selectedSpace={selectedSpace || null}
        selectedSpaceId={selectedSpaceId}
        onSelectSpace={handleSelectSpace}
        onCreateSpace={handleCreateSpace}
        onUpdateSpace={updateSpace}
        onDeleteSpace={handleDeleteSpace}
        onReorderSpaces={reorderSpaces}
        settings={settings}
        onUpdateSettings={updateSettings}
        onSignOut={() => {
          analytics.resetUser();
          signOut();
        }}
        userEmail={user?.email}
        windowFocused={windowFocused}
        onOpenWhatsNew={() => setShowWhatsNew(true)}
        streakCount={streakCount}
        streakActive={streakActive}
        showFlame={showFlame}
        onOpenRecurringTasks={() => setShowRecurringTasks(true)}
        onOpenConnectAI={() => setShowConnectAI(true)}
        onOpenMembership={() => setShowMembership(true)}
        isPro={isPro || entitlementLoading}
        onUpsellSpaces={() => setShowSpaceUpsell(true)}
      />

      <div className="main-content">
        {/* View mode toggle */}
        <div className="view-mode-toggle">
          <button
            className={`view-mode-btn ${viewMode === 'notes' ? 'active' : ''}`}
            onClick={() => handleViewModeChange('notes')}
          >
            <NotesIcon />
            Notes
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'tasks' ? 'active' : ''}`}
            onClick={() => handleViewModeChange('tasks')}
          >
            <TasksIcon />
            Tasks
          </button>
        </div>

        {viewMode === 'notes' ? (
          <NotesView
            notes={notes}
            loading={notesLoading}
            spaces={spaces}
            isAllView={notesAllView}
            onCreate={async (title, overrideSpaceId) => {
              return await createNote(title, overrideSpaceId);
            }}
            onUpdate={(id, updates) => {
              updateNote(id, updates);
            }}
            onDelete={(id) => {
              deleteNote(id);
            }}
          />
        ) : detailTodo ? (
          <TodoDetail
            todo={detailTodo}
            onUpdate={(id, updates) => {
              markLocalChange(id);
              updateTodo(id, updates);
              setDetailTodo(prev => prev ? { ...prev, ...updates } : null);
            }}
            onStatusChange={(id, status) => {
              handleStatusChange(id, status);
              setDetailTodo(prev => prev ? { ...prev, status } : null);
            }}
            onClose={() => { setDetailTodo(null); setFocusDescription(false); }}
            space={isAllView ? spaces.find(s => s.id === detailTodo.space_id) : undefined}
            spaces={isAllView ? spaces : undefined}
            onChangeSpace={isAllView ? (todoId, newSpaceId) => {
              markLocalChange(todoId);
              updateTodo(todoId, { space_id: newSpaceId } as Record<string, unknown>);
            } : undefined}
            focusDescription={focusDescription}
            aiRoles={aiRoles}
            aiContext={aiContext}
            aiSetupComplete={aiIsSetup}
            onExecuteWithAgent={handleAgentExecute}
            agentRunning={agent.isRunning}
          />
        ) : (
          <>
            <FilterBar
              filter={filter}
              onFilterChange={handleFilterChange}
              onDropTask={(taskId, newStatus) => {
                handleStatusChange(taskId, newStatus);
                if (newStatus === 'done') {
                  triggerCelebration();
                }
              }}
              doneCount={doneCount}
              pendingCount={pendingCount}
              priorityFilter={priorityFilter}
              onPriorityFilterChange={setPriorityFilter}
            />

            <TodoList
              todos={filteredTodos}
              highlightTodoId={highlightTodoId}
              loading={todosLoading}
              onStatusChange={handleStatusChange}
              onUpdate={async (id, updates) => {
                markLocalChange(id);
                await updateTodo(id, updates);
              }}
              onDelete={handleDelete}
              onArchive={(id) => { markLocalChange(id); archiveTodo(id); }}
              onOpenDetail={setDetailTodo}
              onArchiveAllDone={archiveAllDone}
              onReorder={(draggedId, targetId) => {
                const draggedTodo = todos.find(t => t.id === draggedId);
                if (draggedTodo) {
                  todos
                    .filter(t => t.status === draggedTodo.status)
                    .forEach(t => markLocalChange(t.id));
                }
                reorderTodos(draggedId, targetId);
              }}
              showClearAll={filter === 'done'}
              spaces={spaces}
              isAllView={isAllView}
              emptyMessage={
                filter === 'all'
                  ? 'No tasks yet. Add one below!'
                  : filter === 'backlog'
                  ? 'No backlog tasks'
                  : filter === 'in_progress'
                  ? 'No tasks in progress'
                  : 'No completed tasks'
              }
            />

            <AddTodo
              onAdd={async (text) => {
                const defaultSpaceId = isAllView ? spaces[0]?.id : undefined;
                const result = await createTodo(text, defaultSpaceId);
                if (result) {
                  markLocalChange(result.id);
                  const spaceName = isAllView
                    ? (spaces[0]?.name || 'Personal')
                    : (selectedSpace?.name || 'Unknown');
                  analytics.trackNewTodo(selectedSpaceId || '', spaceName);
                }
                return result;
              }}
              disabled={!selectedSpaceId || (isAllView && spaces.length === 0)}
              placeholder="Add new task..."
            />
          </>
        )}
      </div>

      {/* What's New Modal */}
      <WhatsNewModal
        isOpen={showWhatsNew}
        onClose={() => setShowWhatsNew(false)}
      />

      {/* Recurring Tasks Modal */}
      <RecurringTasksModal
        isOpen={showRecurringTasks}
        onClose={() => setShowRecurringTasks(false)}
        recurringTasks={recurringTasks}
        spaces={spaces}
        currentSpaceId={selectedSpaceId !== '__all__' ? selectedSpaceId : undefined}
        onCreate={createRecurring}
        onUpdate={updateRecurring}
        onDelete={deleteRecurring}
      />

      {/* Connect with AI Modal (MCP tokens) */}
      <ConnectAIModal
        isOpen={showConnectAI}
        onClose={() => setShowConnectAI(false)}
        userId={user?.id}
        onOpenMembership={() => {
          setShowConnectAI(false);
          setShowMembership(true);
        }}
      />

      {/* Membership / Flowya Pro status + billing */}
      <MembershipModal
        isOpen={showMembership}
        onClose={() => setShowMembership(false)}
        userId={user?.id}
      />

      {/* Contextual upsell shown when a free user hits the space limit */}
      <SpaceUpsellModal
        isOpen={showSpaceUpsell}
        onClose={() => setShowSpaceUpsell(false)}
        onUpgrade={() => {
          setShowSpaceUpsell(false);
          setShowMembership(true);
        }}
      />

      {/* Daily Summary Modal (morning greeting) */}
      {showDailySummary && (
        <DailySummary
          onClose={() => setShowDailySummary(false)}
          streakBestYesterday={getYesterdayBestStreak()}
        />
      )}

      {/* Today's Progress Modal (secret: ⌘+⇧+D) */}
      {showTodaySummary && (
        <DailySummary
          onClose={() => setShowTodaySummary(false)}
          showToday
          streakBestToday={streakBestToday}
        />
      )}

      {/* AI Onboarding Modal */}
      {showAIOnboarding && (
        <AIOnboarding
          spaces={spaces}
          onComplete={handleAIOnboardingComplete}
          onClose={() => { setShowAIOnboarding(false); setAIEditMode(false); }}
          editMode={aiEditMode}
          initialRoles={aiEditMode ? aiRoles : undefined}
          initialContext={aiEditMode ? aiContext : undefined}
        />
      )}

      {/* AI Recommendation Modal */}
      {showAIRecommendation && (
        <AIRecommendation
          result={aiResult}
          loading={aiLoading}
          error={aiError}
          todos={todos}
          spaces={spaces}
          scope={aiScope}
          onAccept={handleAcceptRecommendations}
          onDismiss={() => { setShowAIRecommendation(false); setAIResult(null); setAIError(null); }}
        />
      )}

      {showAIHub && (
        <AIHubModal
          onPrioritize={handleAIHubPrioritize}
          onRename={handleAIHubRename}
          onDuplicates={handleAIHubDuplicates}
          onClose={() => setShowAIHub(false)}
        />
      )}

      {showAIRename && (
        <AIRenameModal
          result={aiRenameResult}
          loading={aiRenameLoading}
          error={aiRenameError}
          onAccept={handleAcceptRenames}
          onDismiss={() => { setShowAIRename(false); setAIRenameResult(null); setAIRenameError(null); }}
        />
      )}

      {showDuplicates && (
        <AIDuplicatesModal
          result={dupResult}
          loading={dupLoading}
          error={dupError}
          todos={todos}
          spaces={spaces}
          onAccept={handleAcceptDuplicates}
          onDismiss={() => { setShowDuplicates(false); setDupResult(null); setDupError(null); }}
        />
      )}

      {/* Streak Celebration Particles */}
      {streakParticles.length > 0 && (
        <div className="streak-celebration">
          {streakParticles.map(p => (
            <span
              key={p.id}
              className="streak-particle"
              style={{
                left: p.x,
                top: p.y,
                animationDelay: `${Math.random() * 0.3}s`,
              }}
            >
              {p.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Undo Toast */}
      {showUndoToast && (
        <div className="undo-toast">
          <span>Task deleted</span>
          <button className="undo-btn" onClick={handleUndo}>
            Undo (⌘Z)
          </button>
          <button className="undo-close" onClick={() => { setShowUndoToast(false); setDeletedTodo(null); }}>
            ✕
          </button>
        </div>
      )}

      {/* Success Toast */}
      {successToast && (
        <div className="success-toast">{successToast}</div>
      )}

      {/* Search Bar (⌘+F) */}
      {showSearch && (
        <div className="search-overlay">
          <div className="search-bar">
            <SearchIcon />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSearch(false);
                  setSearchQuery('');
                }
              }}
            />
            {searchQuery && (
              <span className="search-count">
                {filteredTodos.length} result{filteredTodos.length !== 1 ? 's' : ''}
              </span>
            )}
            <button
              className="search-close"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Agent Overlay */}
      {agent.status !== 'idle' && (
        <AgentOverlay
          status={agent.status}
          message={agent.message}
          thinking={agent.thinking}
          screenshot={agent.screenshot}
          actions={agent.actions}
          iteration={agent.iteration}
          maxIterations={agent.maxIterations}
          isRunning={agent.isRunning}
          onStop={agent.stopAgent}
          onDismiss={agent.resetAgent}
        />
      )}

      {/* Agent Confirmation Dialog */}
      {agentConfirmTask && (
        <AgentConfirmDialog
          taskText={agentConfirmTask.text}
          onConfirm={handleAgentConfirm}
          onCancel={() => setAgentConfirmTask(null)}
        />
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 3H10M2 6H10M2 9H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 1.5H9C9.55 1.5 10 2 10 2.5V9.5C10 10 9.55 10.5 9 10.5H3C2.45 10.5 2 10 2 9.5V2.5C2 2 2.45 1.5 3 1.5Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 4H8M4 6H8M4 8H6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
