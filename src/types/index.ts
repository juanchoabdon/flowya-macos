// Database types
export interface Space {
  id: string;
  user_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

// Pastel colors for spaces (stronger but still soft)
export const SPACE_COLORS = [
  '#FF6B7A', // Coral Pink
  '#FF8A65', // Peach
  '#FFB74D', // Amber
  '#AED581', // Light Green
  '#4DD0E1', // Cyan
  '#64B5F6', // Sky Blue
  '#4DB6AC', // Teal
  '#81C784', // Green
  '#FFD54F', // Yellow
  '#FFAB91', // Light Coral
  '#90CAF9', // Light Blue
  '#A5D6A7', // Mint
  '#9575CD', // Purple
  '#AB47BC', // Magenta
];

// Task status type
export type TaskStatus = 'backlog' | 'in_progress' | 'done';

// Priority type
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface Todo {
  id: string;
  space_id: string;
  text: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;  // ISO date string for deadline
  position: number;
  created_at: string;
  started_at: string | null;  // When moved to in_progress
  completed_at: string | null;
  archived: boolean;
}

export interface Settings {
  id?: number;
  user_id: string;
  always_on_top: boolean;
  visible_on_all_workspaces: boolean;
  opacity: number;
  last_selected_space: string | null;
  all_spaces_color: string | null;
  nickname: string | null;
  ai_roles: Record<string, string> | null;
  ai_context: string | null;
  ai_setup_complete: boolean;
}

// AI Prioritization types
export interface AIRecommendation {
  todoId: string;
  rank: number;
  newPriority: Priority;
  newDueDate?: string | null;
  rationale: string;
  action: 'keep' | 'archive';
}

export interface AIAnalysisResult {
  recommendations: AIRecommendation[];
  summary: string;
}

// AI Rename types
export interface AIRenameSuggestion {
  todoId: string;
  currentName: string;
  newName: string;
  rationale: string;
}

export interface AIRenameResult {
  suggestions: AIRenameSuggestion[];
  summary: string;
}

// Duplicate Detection types
export interface AIDuplicateGroup {
  keepTodoId: string;
  removeTodoIds: string[];
  reason: string;
}

export interface AIDuplicatesResult {
  groups: AIDuplicateGroup[];
  summary: string;
}

// Weekly Planning types
export interface WeeklyGoal {
  id: string;
  user_id: string;
  space_id: string;
  week_start: string;
  goal_text: string;
  position: number;
  linked_todo_id: string | null;
  linked_todo_ids: string[];
  completed: boolean;
  created_at: string;
}

export type DailyPlanStatus = 'draft' | 'confirmed' | 'closed';
export type DailyPlanBucket = 'deadline' | 'active' | 'follow_up' | 'habit';
export type DailyPlanCapacity = 'light' | 'normal' | 'packed';

export interface DailyPlan {
  id: string;
  user_id: string;
  plan_date: string;
  timezone: string;
  status: DailyPlanStatus;
  capacity: DailyPlanCapacity | null;
  summary: string | null;
  confirmed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyPlanItem {
  id: string;
  task_id: string;
  bucket: DailyPlanBucket;
  position: number;
  task: Todo | null;
  missing: boolean;
}

export interface DailyPlanView {
  plan: DailyPlan | null;
  items: DailyPlanItem[];
}

export interface AIWeeklyPlanMapping {
  goalPosition: number;
  goalText: string;
  spaceId: string;
  action: 'map_existing' | 'create_new';
  todoId?: string;
  newTaskName?: string;
  newPriority: Priority;
  newDueDate?: string | null;
  rationale: string;
}

export interface AIWeeklyPlanResult {
  summary: string;
  mappings: AIWeeklyPlanMapping[];
  reprioritizations: AIRecommendation[];
}

// Recurring Task types
export interface RecurringTask {
  id: string;
  user_id: string;
  space_id: string;
  text: string;
  days: number[];        // 0=Sun, 1=Mon, ..., 6=Sat
  enabled: boolean;
  last_created_date: string | null;
  created_at: string;
}

// Agent types (renderer side)
export type AgentStatusType =
  | 'idle'
  | 'starting'
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface AgentEventPayload {
  type: 'status' | 'thinking' | 'action' | 'screenshot' | 'error' | 'done';
  status: AgentStatusType;
  message?: string;
  screenshot?: string;
  action?: {
    name: string;
    coordinate?: [number, number];
    text?: string;
  };
  iteration?: number;
  maxIterations?: number;
}

// Notes
export interface Note {
  id: string;
  user_id: string;
  space_id: string;
  title: string;
  content: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// View modes
export type ViewMode = 'tasks' | 'notes';

// Filter types
export type FilterType = 'all' | 'backlog' | 'in_progress' | 'done';

// Window API exposed via preload
export interface WindowApi {
  expand: () => Promise<boolean>;
  collapse: () => Promise<boolean>;
  getExpandState: () => Promise<boolean>;
  getNotchInfo: () => Promise<{ hasNotch: boolean; menuBarHeight: number }>;
  moveToNextDisplay: () => Promise<boolean>;
  getDisplayCount: () => Promise<number>;
  onExpandStateChanged: (callback: (expanded: boolean) => void) => () => void;
  setWindowMode: (mode: 'welcome' | 'docked') => Promise<boolean>;
  getWindowMode: () => Promise<'welcome' | 'docked'>;
  onModeChanged: (callback: (mode: 'welcome' | 'docked') => void) => () => void;
  setAlwaysOnTop: (value: boolean) => Promise<boolean>;
  getAlwaysOnTop: () => Promise<boolean>;
  setVisibleOnAllWorkspaces: (value: boolean) => Promise<boolean>;
  setOpacity: (value: number) => Promise<boolean>;
  toggleVisibility: () => Promise<boolean>;
  refreshDock: () => Promise<boolean>;
  quitApp: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  aiChat: (payload: { apiKey: string; model: string; messages: Array<{ role: string; content: string }>; temperature: number }) => Promise<{ error: boolean; data?: unknown; status?: number; body?: string }>;
  resizeWindow: (width: number, height: number) => Promise<boolean>;
  getTheme: () => Promise<'dark' | 'light'>;
  onFocusChange: (callback: (focused: boolean) => void) => () => void;
  // Auto-updater
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (callback: (version: string) => void) => () => void;
  onUpdateDownloaded: (callback: (version: string) => void) => () => void;
  // Claude Computer Use agent
  agentStart: (payload: { apiKey: string; taskText: string; taskDescription?: string }) => Promise<{ error: boolean; message?: string }>;
  agentStop: () => Promise<boolean>;
  agentGetStatus: () => Promise<string>;
  onAgentEvent: (callback: (event: AgentEventPayload) => void) => () => void;
}

// Extend Window interface to include our API
declare global {
  interface Window {
    windowApi: WindowApi;
  }
}

export {};
