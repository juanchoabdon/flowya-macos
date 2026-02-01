// Database types
export interface Space {
  id: string;
  user_id: string;
  name: string;
  color: string;
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

export interface Todo {
  id: string;
  space_id: string;
  text: string;
  description: string | null;
  status: TaskStatus;
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
}

// Filter types
export type FilterType = 'all' | 'backlog' | 'in_progress' | 'done';

// Window API exposed via preload
export interface WindowApi {
  setAlwaysOnTop: (value: boolean) => Promise<boolean>;
  getAlwaysOnTop: () => Promise<boolean>;
  setVisibleOnAllWorkspaces: (value: boolean) => Promise<boolean>;
  setOpacity: (value: number) => Promise<boolean>;
  toggleVisibility: () => Promise<boolean>;
  setMinimized: (minimized: boolean) => Promise<boolean>;
  refreshDock: () => Promise<boolean>;
  getTheme: () => Promise<'dark' | 'light'>;
  onFocusChange: (callback: (focused: boolean) => void) => () => void;
}

// Extend Window interface to include our API
declare global {
  interface Window {
    windowApi: WindowApi;
  }
}

export {};
