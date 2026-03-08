import { useState, useEffect, useRef, useCallback } from 'react';
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
import { AIRecommendation } from './components/AIRecommendation';
import { AIHubModal } from './components/AIHubModal';
import { AIRenameModal } from './components/AIRenameModal';
import { WeeklyPlanningModal } from './components/WeeklyPlanningModal';
import { WeeklyFocusBanner } from './components/WeeklyFocusBanner';
import { WeeklyPlanNudge } from './components/WeeklyPlanNudge';
import { useStreak } from './hooks/useStreak';
import { useAIProfile } from './hooks/useAIProfile';
import { useWeeklyGoals } from './hooks/useWeeklyGoals';
import { AIDuplicatesModal } from './components/AIDuplicatesModal';
import { RecurringTasksModal } from './components/RecurringTasksModal';
import { OnboardingModal } from './components/OnboardingModal';
import { useRecurringTasks } from './hooks/useRecurringTasks';
import { prioritizeTasks, renameTasks, planWeek, findDuplicates } from './lib/openai';
import { upsertWeeklyGoals, getMonday, linkTodoToGoal, unlinkTodoFromGoal } from './lib/supabase';
import type { FilterType, Todo, Priority, AIAnalysisResult, AIRenameResult, AIRenameSuggestion, AIWeeklyPlanResult, AIDuplicatesResult } from './types';
import * as analytics from './lib/analytics';

export default function App() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const { spaces, loading: spacesLoading, createSpace, updateSpace, deleteSpace, reorderSpaces } = useSpaces(user?.id);
  const { settings, loading: settingsLoading, updateSettings } = useSettings(user?.id);
  const { count: streakCount, bestToday: streakBestToday, isActive: streakActive, showFlame, recordCompletion: recordStreakCompletion, getYesterdayBestStreak } = useStreak(user?.id);
  const { roles: aiRoles, context: aiContext, isSetup: aiIsSetup, saveProfile: saveAIProfile } = useAIProfile(settings, updateSettings);

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>('__all__');
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
  const [pipMode, setPipMode] = useState(false);

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

  // Weekly Planning state
  const [showWeeklyPlanning, setShowWeeklyPlanning] = useState(false);
  const [weeklyPlanInitialSpace, setWeeklyPlanInitialSpace] = useState<string | undefined>(undefined);
  const [weeklyPlanResult, setWeeklyPlanResult] = useState<AIWeeklyPlanResult | null>(null);
  const [weeklyPlanLoading, setWeeklyPlanLoading] = useState(false);
  const [weeklyPlanError, setWeeklyPlanError] = useState<string | null>(null);

  // Recurring Tasks state
  const [showRecurringTasks, setShowRecurringTasks] = useState(false);

  // New user onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

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
    goals: weeklyGoals,
    lastWeekGoals,
    hasGoalsThisWeek,
    refetch: refetchWeeklyGoals,
    syncCompletion: syncWeeklyGoalCompletion,
    toggleGoalCompletion,
  } = useWeeklyGoals(user?.id);

  const {
    recurringTasks,
    createRecurringTask: createRecurring,
    updateRecurringTask: updateRecurring,
    deleteRecurringTask: deleteRecurring,
  } = useRecurringTasks(user?.id, refetchTodos);

  // Sync weekly goal completion whenever todos change
  useEffect(() => {
    if (weeklyGoals.length > 0 && todos.length > 0) {
      syncWeeklyGoalCompletion(todos);
    }
  }, [todos, weeklyGoals.length, syncWeeklyGoalCompletion]);

  // Detect fresh signup: account created less than 24 hours ago
  const isNewAccount = useCallback(() => {
    if (!user?.created_at) return false;
    const createdAt = new Date(user.created_at).getTime();
    return Date.now() - createdAt < 24 * 60 * 60 * 1000;
  }, [user?.created_at]);

  // Auto-show AI onboarding if user hasn't completed setup (skip for brand-new accounts)
  const hasShownAIOnboarding = useRef(false);
  useEffect(() => {
    if (isNewAccount()) return;
    if (!settingsLoading && settings && !settings.ai_setup_complete && !hasShownAIOnboarding.current && spaces.length > 0) {
      hasShownAIOnboarding.current = true;
      setAIEditMode(false);
      exitPipIfNeeded();
      setShowAIOnboarding(true);
    }
  }, [settingsLoading, settings, spaces.length, isNewAccount]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Weekly planning auto-trigger helpers
  const shouldShowWeeklyPlanning = useCallback(() => {
    if (!aiIsSetup) return false;
    if (hasGoalsThisWeek) return false;
    const mondayStr = getMonday();
    const lastPlanned = localStorage.getItem('flowya_last_weekly_plan_date');
    if (lastPlanned === mondayStr) return false;
    const snoozedUntil = localStorage.getItem('flowya_weekly_plan_snoozed_until');
    if (snoozedUntil && Date.now() < parseInt(snoozedUntil, 10)) return false;

    const day = new Date().getDay();
    const isSunOrMon = day === 0 || day === 1;
    const missedLastWeek = lastWeekGoals.length === 0;

    return isSunOrMon || missedLastWeek;
  }, [aiIsSetup, hasGoalsThisWeek, lastWeekGoals.length]);

  const markWeeklyPlanningDone = useCallback(() => {
    localStorage.setItem('flowya_last_weekly_plan_date', getMonday());
    localStorage.removeItem('flowya_weekly_plan_snoozed_until');
  }, []);

  const snoozeWeeklyPlanning = useCallback(() => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    localStorage.setItem('flowya_weekly_plan_snoozed_until', String(Date.now() + twoHoursMs));
    setShowWeeklyPlanning(false);
    setWeeklyPlanResult(null);
    setWeeklyPlanError(null);
    setWeeklyPlanInitialSpace(undefined);
  }, []);

  const checkWeeklyPlanningAfterSummary = useCallback(() => {
    if (shouldShowWeeklyPlanning()) {
      setTimeout(() => { exitPipIfNeeded(); setShowWeeklyPlanning(true); }, 400);
    }
  }, [shouldShowWeeklyPlanning]);

  // Refresh dock icon after login and check auto-trigger chain:
  // AI Onboarding (highest) > Daily Summary > Weekly Planning (lowest)
  // Skip all auto-popups for brand-new accounts
  const prevUserRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserRef.current === undefined && user?.id) {
      window.windowApi?.refreshDock();

      if (isNewAccount()) {
        setTimeout(() => setShowOnboarding(true), 600);
      } else {
        if (!aiIsSetup) {
          // AI Onboarding takes priority -- its own useEffect handles showing it
        } else if (shouldShowDailySummary()) {
          setTimeout(() => {
            exitPipIfNeeded();
            analytics.trackViewDailySummary('morning');
            setShowDailySummary(true);
          }, 500);
        } else if (shouldShowWeeklyPlanning()) {
          setTimeout(() => { exitPipIfNeeded(); setShowWeeklyPlanning(true); }, 500);
        }
      }
    }
    prevUserRef.current = user?.id;
  }, [user?.id, aiIsSetup, shouldShowWeeklyPlanning, isNewAccount]);

  // Create default space if none exist (skip if onboarding is handling it)
  useEffect(() => {
    if (!spacesLoading && spaces.length === 0 && !showOnboarding && !isNewAccount()) {
      createSpace('Personal').then(space => {
        if (space) setSelectedSpaceId(space.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spacesLoading, spaces.length, showOnboarding]);

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
              exitPipIfNeeded();
              analytics.trackViewDailySummary('morning');
              setShowDailySummary(true);
            }, 500);
          } else if (shouldShowWeeklyPlanning()) {
            setTimeout(() => { exitPipIfNeeded(); setShowWeeklyPlanning(true); }, 500);
          }
        }
      });
      return unsubscribe;
    }
  }, [aiIsSetup, shouldShowWeeklyPlanning]);

  // Listen for PIP mode changes
  useEffect(() => {
    if (window.windowApi?.onPipChanged) {
      return window.windowApi.onPipChanged((pip) => setPipMode(pip));
    }
  }, []);

  const pipModeRef = useRef(pipMode);
  pipModeRef.current = pipMode;
  const exitPipIfNeeded = useCallback(() => {
    if (pipModeRef.current) {
      window.windowApi?.exitPip();
    }
  }, []);

  const pipDragRef = useRef<{ x: number; y: number } | null>(null);
  const pipDidDrag = useRef(false);
  const handlePipMouseDown = useCallback((e: React.MouseEvent) => {
    pipDragRef.current = { x: e.screenX, y: e.screenY };
    pipDidDrag.current = false;
    window.windowApi?.pipStartDrag(e.screenX, e.screenY);
    const onMove = (ev: MouseEvent) => {
      if (!pipDragRef.current) return;
      const dx = ev.screenX - pipDragRef.current.x;
      const dy = ev.screenY - pipDragRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        pipDidDrag.current = true;
        window.windowApi?.pipDragMove(ev.screenX, ev.screenY);
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!pipDidDrag.current) {
        window.windowApi?.exitPip();
      }
      pipDragRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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
      refetchTodos();
    }, [refetchTodos, isLocalChange]),
    onTodoUpdate: useCallback((todo: Todo) => {
      if (isLocalChange(todo.id)) {
        if (detailTodo?.id === todo.id) {
          setDetailTodo(todo);
        }
        return;
      }
      console.log('[Realtime] Todo updated from another device:', todo.id);
      refetchTodos();
      if (detailTodo?.id === todo.id) {
        setDetailTodo(todo);
      }
    }, [refetchTodos, detailTodo?.id, isLocalChange]),
    onTodoDelete: useCallback((id: string) => {
      if (isLocalChange(id)) return;
      console.log('[Realtime] Todo deleted from another device:', id);
      refetchTodos();
      if (detailTodo?.id === id) {
        setDetailTodo(null);
      }
    }, [refetchTodos, detailTodo?.id, isLocalChange]),
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

  // AI Hub handlers
  const handleAIButtonClick = () => {
    if (!aiIsSetup) {
      setAIEditMode(false);
      setShowAIOnboarding(true);
      return;
    }
    setShowAIHub(true);
  };

  const handleAIHubPrioritize = () => {
    setShowAIHub(false);
    handleAIAnalyze();
  };

  const handleEditAIProfile = () => {
    setAIEditMode(true);
    setShowAIOnboarding(true);
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
          exitPipIfNeeded();
          analytics.trackViewDailySummary('morning');
          setShowDailySummary(true);
        } else if (shouldShowWeeklyPlanning()) {
          exitPipIfNeeded();
          setShowWeeklyPlanning(true);
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
        weeklyGoals,
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
        weeklyGoals,
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

  // Weekly Planning handlers
  const handleAIHubWeeklyPlan = () => {
    setShowAIHub(false);
    setShowWeeklyPlanning(true);
  };

  const handleWeeklyPlan = async (objectives: Array<{ spaceId: string; spaceName: string; goals: string[] }>) => {
    setWeeklyPlanLoading(true);
    setWeeklyPlanError(null);
    setWeeklyPlanResult(null);

    try {
      const profile = { roles: aiRoles || {}, context: aiContext || '' };
      const result = await planWeek(profile, objectives, todos, spaces);
      setWeeklyPlanResult(result);
    } catch (err) {
      console.error('[AI] Weekly plan failed:', err);
      setWeeklyPlanError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setWeeklyPlanLoading(false);
    }
  };

  const handleAcceptWeeklyPlan = async () => {
    if (!weeklyPlanResult || !user?.id) return;

    // Collect all linked todo IDs per goal
    const goalTodoIds: Record<string, string[]> = {};

    for (const mapping of weeklyPlanResult.mappings) {
      const goalKey = `${mapping.spaceId}::${mapping.goalPosition}`;
      if (!goalTodoIds[goalKey]) goalTodoIds[goalKey] = [];
      let linkedTodoId: string | null = null;

      if (mapping.action === 'map_existing' && mapping.todoId) {
        markLocalChange(mapping.todoId);
        const updates: Record<string, unknown> = { priority: mapping.newPriority };
        if (mapping.newDueDate) updates.due_date = mapping.newDueDate;
        await updateTodo(mapping.todoId, updates as { priority?: Priority; due_date?: string });
        linkedTodoId = mapping.todoId;
      } else if (mapping.action === 'create_new' && mapping.newTaskName) {
        const newTodo = await createTodo(mapping.newTaskName);
        if (newTodo) {
          markLocalChange(newTodo.id);
          const updates: Record<string, unknown> = {
            priority: mapping.newPriority,
            space_id: mapping.spaceId,
          };
          if (mapping.newDueDate) updates.due_date = mapping.newDueDate;
          await updateTodo(newTodo.id, updates as { priority?: Priority; due_date?: string; space_id?: string });
          linkedTodoId = newTodo.id;
        }
      }

      if (linkedTodoId) goalTodoIds[goalKey].push(linkedTodoId);
    }

    // One DB row per unique goal, with all linked todo IDs
    const seenGoals = new Set<string>();
    const goalRows: Array<{ space_id: string; goal_text: string; position: number; linked_todo_ids: string[] }> = [];
    for (const mapping of weeklyPlanResult.mappings) {
      const goalKey = `${mapping.spaceId}::${mapping.goalPosition}`;
      if (seenGoals.has(goalKey)) continue;
      seenGoals.add(goalKey);
      goalRows.push({
        space_id: mapping.spaceId,
        goal_text: mapping.goalText,
        position: mapping.goalPosition,
        linked_todo_ids: goalTodoIds[goalKey] || [],
      });
    }

    // Apply reprioritizations
    for (const rec of weeklyPlanResult.reprioritizations) {
      const todo = todos.find(t => t.id === rec.todoId);
      if (!todo) continue;
      markLocalChange(rec.todoId);
      const updates: Record<string, unknown> = {};
      if (todo.priority !== rec.newPriority) updates.priority = rec.newPriority;
      if (rec.newDueDate) updates.due_date = rec.newDueDate;
      if (Object.keys(updates).length > 0) {
        await updateTodo(rec.todoId, updates as { priority?: Priority; due_date?: string });
      }
    }

    // Save goals to database
    await upsertWeeklyGoals(user.id, goalRows);
    markWeeklyPlanningDone();
    localStorage.setItem('flowya_weekly_plan_intro_seen', 'true');

    setShowWeeklyPlanning(false);
    setWeeklyPlanResult(null);
    await refetchTodos();
    await refetchWeeklyGoals();
    showSuccess('Weekly plan applied ✓');
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

      const now = new Date();

      const getUrgencyScore = (todo: typeof a): number => {
        if (!todo.due_date) return 0;
        const due = new Date(todo.due_date);
        const diffMs = due.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffMs < 0) return 3;
        if (diffHours <= 1) return 2;
        return 0;
      };

      const aUrgency = getUrgencyScore(a);
      const bUrgency = getUrgencyScore(b);

      if (aUrgency !== bUrgency) {
        return bUrgency - aUrgency;
      }

      const aIsP0 = a.priority === 'P0';
      const bIsP0 = b.priority === 'P0';
      if (aIsP0 && !bIsP0) return -1;
      if (!aIsP0 && bIsP0) return 1;

      return a.position - b.position;
    });

  // Count for display: done tasks vs pending (backlog + in_progress)
  const doneCount = todos.filter(t => t.status === 'done').length;
  const pendingCount = todos.filter(t => t.status !== 'done').length;

  // Calculate urgency indicators by status
  const urgencyByStatus = {
    backlog: { hasOverdue: false, hasDueSoon: false },
    in_progress: { hasOverdue: false, hasDueSoon: false },
    done: { hasOverdue: false, hasDueSoon: false },
  };

  const now = new Date();
  todos.forEach(t => {
    if (t.status === 'done' || !t.due_date) return;
    const due = new Date(t.due_date);
    const diffMs = due.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffMs < 0) {
      urgencyByStatus[t.status].hasOverdue = true;
    } else if (diffHours <= 1) {
      urgencyByStatus[t.status].hasDueSoon = true;
    }
  });

  // Swipe gesture handling for trackpad
  const swipeAccumulator = useRef(0);
  const swipeTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastSwipeTime = useRef(0);
  const filters: FilterType[] = ['backlog', 'in_progress', 'done'];

  const handleSwipe = useCallback((e: WheelEvent) => {
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
  }, [filter, filters]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Show login if not authenticated
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

  if (pipMode) {
    const inProgressCount = todos.filter(t => t.status === 'in_progress' && !t.archived).length;
    const spaceColor = selectedSpace?.color || settings?.all_spaces_color || '#64B5F6';
    return (
      <div
        className={`app-container pip-container ${!windowFocused ? 'unfocused' : ''}`}
        style={{ background: `linear-gradient(135deg, ${spaceColor}D0 0%, ${spaceColor}90 50%, ${spaceColor}B8 100%)` }}
        onMouseDown={handlePipMouseDown}
      >
        <div className="pip-bar">
          <span className="pip-bar-title">{settings?.nickname || 'Flowya'}</span>
          <span className="pip-bar-dot" style={{ background: spaceColor }} />
          <span className="pip-bar-count">{inProgressCount} active</span>
          {streakActive && (
            <span className="pip-bar-streak">🔥 {streakCount}</span>
          )}
          <button className="pip-bar-expand" title="Expand">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 2H12V5.5M5.5 12H2V8.5M12 2L8 6M2 12L6 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${!windowFocused ? 'unfocused' : ''}`}>
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
        onAIPrioritize={handleAIButtonClick}
        onEditAIProfile={handleEditAIProfile}
        aiProfileSetup={aiIsSetup}
        streakCount={streakCount}
        streakActive={streakActive}
        showFlame={showFlame}
        onEnterPip={() => window.windowApi?.enterPip()}
        onOpenRecurringTasks={() => setShowRecurringTasks(true)}
      />

      <div className="main-content">
        {detailTodo ? (
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
            weeklyGoals={weeklyGoals}
            onLinkGoal={async (goalId, todoId) => {
              await linkTodoToGoal(goalId, todoId);
              await refetchWeeklyGoals();
              syncWeeklyGoalCompletion(todos);
            }}
            onUnlinkGoal={async (goalId, todoId) => {
              await unlinkTodoFromGoal(goalId, todoId);
              await refetchWeeklyGoals();
              syncWeeklyGoalCompletion(todos);
            }}
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
              urgencyByStatus={urgencyByStatus}
            />

            {!hasGoalsThisWeek && aiIsSetup && (
              <WeeklyPlanNudge onPlan={() => {
                setWeeklyPlanResult(null);
                setWeeklyPlanError(null);
                setWeeklyPlanInitialSpace(undefined);
                setShowWeeklyPlanning(true);
              }} />
            )}

            {hasGoalsThisWeek && (
              <WeeklyFocusBanner
                goals={weeklyGoals}
                spaces={spaces}
                todos={todos}
                isAllView={isAllView}
                selectedSpaceId={selectedSpaceId}
                onOpenGoal={(todoId) => {
                  const todo = todos.find(t => t.id === todoId);
                  if (todo) setDetailTodo(todo);
                }}
                onEdit={(spaceId) => {
                  setWeeklyPlanResult(null);
                  setWeeklyPlanError(null);
                  setWeeklyPlanInitialSpace(spaceId);
                  setShowWeeklyPlanning(true);
                }}
                onLinkTask={async (goalId, todoId) => {
                  await linkTodoToGoal(goalId, todoId);
                  await refetchWeeklyGoals();
                  syncWeeklyGoalCompletion(todos);
                }}
                onUnlinkTask={async (goalId, todoId) => {
                  await unlinkTodoFromGoal(goalId, todoId);
                  await refetchWeeklyGoals();
                  syncWeeklyGoalCompletion(todos);
                }}
                onToggleComplete={toggleGoalCompletion}
              />
            )}

            <TodoList
              todos={filteredTodos}
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
                  setDetailTodo(result);
                  setFocusDescription(true);
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
        onCreate={createRecurring}
        onUpdate={updateRecurring}
        onDelete={deleteRecurring}
      />

      {/* New User Onboarding */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        spaces={spaces}
        onCreateSpace={createSpace}
        onDeleteSpace={deleteSpace}
        onSaveAIProfile={saveAIProfile}
        onCreateTodo={createTodo}
      />

      {/* Daily Summary Modal (morning greeting) */}
      {showDailySummary && (
        <DailySummary
          onClose={() => { setShowDailySummary(false); checkWeeklyPlanningAfterSummary(); }}
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
          onWeeklyPlan={handleAIHubWeeklyPlan}
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

      {showWeeklyPlanning && (
        <WeeklyPlanningModal
          spaces={spaces}
          lastWeekGoals={lastWeekGoals}
          currentWeekGoals={weeklyGoals}
          todos={todos}
          result={weeklyPlanResult}
          loading={weeklyPlanLoading}
          error={weeklyPlanError}
          isFirstTime={localStorage.getItem('flowya_weekly_plan_intro_seen') !== 'true'}
          initialSpaceId={weeklyPlanInitialSpace}
          onPlan={handleWeeklyPlan}
          onAccept={handleAcceptWeeklyPlan}
          onDismiss={snoozeWeeklyPlanning}
          onSnooze={snoozeWeeklyPlanning}
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
