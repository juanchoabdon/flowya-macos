import { contextBridge, ipcRenderer } from 'electron';

const windowApi = {
  // Expand/collapse (notch pill <-> panel)
  expand: (): Promise<boolean> =>
    ipcRenderer.invoke('window:expand'),

  collapse: (): Promise<boolean> =>
    ipcRenderer.invoke('window:collapse'),

  getExpandState: (): Promise<boolean> =>
    ipcRenderer.invoke('window:getExpandState'),

  getNotchInfo: (): Promise<{ hasNotch: boolean; menuBarHeight: number }> =>
    ipcRenderer.invoke('window:getNotchInfo'),

  moveToNextDisplay: (): Promise<boolean> =>
    ipcRenderer.invoke('window:moveToNextDisplay'),

  getDisplayCount: (): Promise<number> =>
    ipcRenderer.invoke('window:getDisplayCount'),

  onExpandStateChanged: (callback: (expanded: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, expanded: boolean) => callback(expanded);
    ipcRenderer.on('window:expandStateChanged', handler);
    return () => ipcRenderer.removeListener('window:expandStateChanged', handler);
  },

  // Welcome (login/onboarding) window <-> docked notch pill
  setWindowMode: (mode: 'welcome' | 'docked'): Promise<boolean> =>
    ipcRenderer.invoke('window:setMode', mode),

  getWindowMode: (): Promise<'welcome' | 'docked'> =>
    ipcRenderer.invoke('window:getMode'),

  onModeChanged: (callback: (mode: 'welcome' | 'docked') => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: 'welcome' | 'docked') => callback(mode);
    ipcRenderer.on('window:modeChanged', handler);
    return () => ipcRenderer.removeListener('window:modeChanged', handler);
  },

  // Window controls
  setAlwaysOnTop: (value: boolean): Promise<boolean> => 
    ipcRenderer.invoke('window:setAlwaysOnTop', value),
  
  getAlwaysOnTop: (): Promise<boolean> => 
    ipcRenderer.invoke('window:getAlwaysOnTop'),
  
  setVisibleOnAllWorkspaces: (value: boolean): Promise<boolean> => 
    ipcRenderer.invoke('window:setVisibleOnAllWorkspaces', value),
  
  setOpacity: (value: number): Promise<boolean> => 
    ipcRenderer.invoke('window:setOpacity', value),
  
  toggleVisibility: (): Promise<boolean> => 
    ipcRenderer.invoke('window:toggle'),
  
  refreshDock: (): Promise<boolean> =>
    ipcRenderer.invoke('window:refreshDock'),
  
  quitApp: (): Promise<void> =>
    ipcRenderer.invoke('app:quit'),
  
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),
  
  resizeWindow: (width: number, height: number): Promise<boolean> =>
    ipcRenderer.invoke('window:resize', width, height),
  
  getTheme: (): Promise<'dark' | 'light'> => 
    ipcRenderer.invoke('system:getTheme'),
  
  // Focus listener
  onFocusChange: (callback: (focused: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, focused: boolean) => callback(focused);
    ipcRenderer.on('window:focus', handler);
    return () => ipcRenderer.removeListener('window:focus', handler);
  },
  
  // Auto-updater
  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke('updater:install'),
  
  onUpdateAvailable: (callback: (version: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string) => callback(version);
    ipcRenderer.on('updater:available', handler);
    return () => ipcRenderer.removeListener('updater:available', handler);
  },
  
  onUpdateDownloaded: (callback: (version: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string) => callback(version);
    ipcRenderer.on('updater:downloaded', handler);
    return () => ipcRenderer.removeListener('updater:downloaded', handler);
  },

  // AI - proxy OpenAI calls through main process
  aiChat: (payload: { apiKey: string; model: string; messages: Array<{ role: string; content: string }>; temperature: number }): Promise<{ error: boolean; data?: unknown; status?: number; body?: string }> =>
    ipcRenderer.invoke('ai:chat', payload),

  // Claude Computer Use agent
  agentStart: (payload: { apiKey: string; taskText: string; taskDescription?: string }): Promise<{ error: boolean; message?: string }> =>
    ipcRenderer.invoke('agent:start', payload),

  agentStop: (): Promise<boolean> =>
    ipcRenderer.invoke('agent:stop'),

  agentGetStatus: (): Promise<string> =>
    ipcRenderer.invoke('agent:getStatus'),

  onAgentEvent: (callback: (event: { type: string; status: string; message?: string; screenshot?: string; action?: { name: string; coordinate?: [number, number]; text?: string }; iteration?: number; maxIterations?: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, agentEvent: Parameters<typeof callback>[0]) => callback(agentEvent);
    ipcRenderer.on('agent:event', handler);
    return () => ipcRenderer.removeListener('agent:event', handler);
  },
};

contextBridge.exposeInMainWorld('windowApi', windowApi);

export type WindowApi = typeof windowApi;
