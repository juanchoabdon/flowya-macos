export type AgentStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface AgentEvent {
  type: 'status' | 'thinking' | 'action' | 'screenshot' | 'error' | 'done';
  status: AgentStatus;
  message?: string;
  screenshot?: string; // base64 PNG for preview
  action?: {
    name: string;
    coordinate?: [number, number];
    text?: string;
  };
  iteration?: number;
  maxIterations?: number;
}

export interface AgentConfig {
  apiKey: string;
  model: string;
  maxIterations: number;
  displayWidth: number;
  displayHeight: number;
}

export const DEFAULT_AGENT_CONFIG: Omit<AgentConfig, 'apiKey'> = {
  model: 'claude-sonnet-4-5',
  maxIterations: 25,
  displayWidth: 1280,
  displayHeight: 800,
};
