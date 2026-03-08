import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentStatusType, AgentEventPayload } from '../types';

export interface AgentAction {
  name: string;
  coordinate?: [number, number];
  text?: string;
  timestamp: number;
}

export interface AgentState {
  status: AgentStatusType;
  message: string;
  screenshot: string | null;
  actions: AgentAction[];
  iteration: number;
  maxIterations: number;
  thinking: string | null;
}

const INITIAL_STATE: AgentState = {
  status: 'idle',
  message: '',
  screenshot: null,
  actions: [],
  iteration: 0,
  maxIterations: 25,
  thinking: null,
};

export function useAgent() {
  const [state, setState] = useState<AgentState>(INITIAL_STATE);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const cleanup = window.windowApi.onAgentEvent((event: AgentEventPayload) => {
      setState((prev) => {
        const next = { ...prev };
        next.status = event.status;
        if (event.iteration !== undefined) next.iteration = event.iteration;
        if (event.maxIterations !== undefined) next.maxIterations = event.maxIterations;

        switch (event.type) {
          case 'status':
            next.message = event.message || '';
            break;
          case 'thinking':
            next.thinking = event.message || null;
            break;
          case 'action':
            next.message = event.message || '';
            next.thinking = null;
            if (event.action) {
              next.actions = [
                ...prev.actions.slice(-19), // keep last 20 actions
                { ...event.action, timestamp: Date.now() },
              ];
            }
            break;
          case 'screenshot':
            next.screenshot = event.screenshot || null;
            if (event.message) next.message = event.message;
            break;
          case 'error':
            next.message = event.message || 'An error occurred.';
            break;
          case 'done':
            next.message = event.message || 'Done.';
            next.thinking = null;
            break;
        }

        return next;
      });
    });

    cleanupRef.current = cleanup;
    return cleanup;
  }, []);

  const startAgent = useCallback(
    async (apiKey: string, taskText: string, taskDescription?: string) => {
      setState({ ...INITIAL_STATE, status: 'starting', message: 'Starting agent...' });
      const result = await window.windowApi.agentStart({
        apiKey,
        taskText,
        taskDescription,
      });
      if (result.error) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          message: result.message || 'Failed to start agent.',
        }));
      }
    },
    []
  );

  const stopAgent = useCallback(async () => {
    await window.windowApi.agentStop();
    setState((prev) => ({
      ...prev,
      status: 'cancelled',
      message: 'Agent stopped.',
      thinking: null,
    }));
  }, []);

  const resetAgent = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const isRunning = state.status === 'running' || state.status === 'starting';

  return {
    ...state,
    isRunning,
    startAgent,
    stopAgent,
    resetAgent,
  };
}
