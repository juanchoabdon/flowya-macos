import * as amplitude from '@amplitude/analytics-browser';

const AMPLITUDE_API_KEY = '2c875c2ad96c939361e0c817d67c9ee4';

// Initialize Amplitude (EU region)
export function initAnalytics(): void {
  console.log('[Analytics] Initializing Amplitude (EU)...');
  amplitude.init(AMPLITUDE_API_KEY, {
    serverZone: 'EU',
    defaultTracking: {
      sessions: true,
      pageViews: false,
      formInteractions: false,
      fileDownloads: false,
    },
  });
  console.log('[Analytics] Amplitude initialized');
}

// Identify user
export function identifyUser(userId: string, email?: string, nickname?: string): void {
  console.log('[Analytics] Identify user:', { userId, email, nickname });
  amplitude.setUserId(userId);
  
  const identifyObj = new amplitude.Identify();
  if (email) {
    identifyObj.set('email', email);
  }
  if (nickname) {
    identifyObj.set('nickname', nickname);
  }
  amplitude.identify(identifyObj);
}

// Clear user on signout
export function resetUser(): void {
  amplitude.reset();
}

// ============ Events ============

export function trackSignIn(userId: string, email?: string): void {
  console.log('[Analytics] Track: signin', { userId, email });
  amplitude.track('signin', {
    user_id: userId,
    email: email,
  });
}

export function trackNewTodo(spaceId: string, spaceName: string): void {
  amplitude.track('new_todo', {
    space_id: spaceId,
    space_name: spaceName,
  });
}

export function trackTodoProgress(
  todoId: string, 
  status: 'backlog' | 'in_progress' | 'done',
  spaceName?: string
): void {
  amplitude.track('todo_progress', {
    todo_id: todoId,
    status: status,
    space_name: spaceName,
  });
}

export function trackSpaceCreated(spaceId: string, spaceName: string): void {
  amplitude.track('space_created', {
    space_id: spaceId,
    space_name: spaceName,
  });
}

export function trackSpaceDeleted(spaceId: string, spaceName?: string): void {
  amplitude.track('space_deleted', {
    space_id: spaceId,
    space_name: spaceName,
  });
}

export function trackSwitchSpace(spaceId: string, spaceName: string): void {
  amplitude.track('switch_space', {
    space_id: spaceId,
    space_name: spaceName,
  });
}

export function trackViewKanban(filter: 'all' | 'backlog' | 'in_progress' | 'done', spaceName: string): void {
  amplitude.track('view_kanban', {
    filter: filter,
    space_name: spaceName,
  });
}

// New feature tracking

export function trackSetPriority(todoId: string, priority: string, previousPriority?: string): void {
  amplitude.track('set_priority', {
    todo_id: todoId,
    priority: priority,
    previous_priority: previousPriority,
  });
}

export function trackSetETA(todoId: string, etaType: string, isCustom: boolean = false): void {
  amplitude.track('set_eta', {
    todo_id: todoId,
    eta_type: etaType,
    is_custom: isCustom,
  });
}

export function trackFilterByPriority(priority: string | null): void {
  amplitude.track('filter_by_priority', {
    priority: priority || 'all',
  });
}

export function trackViewWhatsNew(): void {
  amplitude.track('view_whats_new');
}

export function trackViewDailySummary(type: 'morning' | 'manual'): void {
  amplitude.track('view_daily_summary', {
    type: type,
  });
}

export function trackUseShortcut(shortcut: string): void {
  amplitude.track('use_shortcut', {
    shortcut: shortcut,
  });
}

export function trackStreak(streakCount: number, isNewBest: boolean): void {
  amplitude.track('streak', {
    streak_count: streakCount,
    is_new_best: isNewBest,
  });
}

export function trackAISetupComplete(): void {
  amplitude.track('ai_setup_complete');
}

export function trackAIPrioritize(scope: 'all' | 'space'): void {
  amplitude.track('ai_prioritize', { scope });
}

export function trackAIAccept(count: number): void {
  amplitude.track('ai_accept', { count });
}

export function trackAIDuplicates(found: number): void {
  amplitude.track('ai_duplicates', { found });
}

export function trackAIDuplicatesAccept(removed: number): void {
  amplitude.track('ai_duplicates_accept', { removed });
}
