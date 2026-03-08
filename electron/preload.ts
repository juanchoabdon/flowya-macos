import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const windowApi = {
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
  
  // Set minimized mode (controls glass effect)
  setMinimized: (minimized: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:setMinimized', minimized),
  
  // Refresh dock icon and floating (call after login)
  refreshDock: (): Promise<boolean> =>
    ipcRenderer.invoke('window:refreshDock'),
  
  // Quit app
  quitApp: (): Promise<void> =>
    ipcRenderer.invoke('app:quit'),
  
  // Open external URL in system browser
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),
  
  // Resize window
  resizeWindow: (width: number, height: number): Promise<boolean> =>
    ipcRenderer.invoke('window:resize', width, height),
  
  // Reset window to default size and position
  resetWindowToDefault: (): Promise<boolean> =>
    ipcRenderer.invoke('window:resetToDefault'),
  
  // System info
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
  
  // PIP mode
  enterPip: (): Promise<boolean> =>
    ipcRenderer.invoke('window:enterPip'),

  exitPip: (): Promise<boolean> =>
    ipcRenderer.invoke('window:exitPip'),

  onPipChanged: (callback: (pip: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, pip: boolean) => callback(pip);
    ipcRenderer.on('window:pipChanged', handler);
    return () => ipcRenderer.removeListener('window:pipChanged', handler);
  },

  pipStartDrag: (screenX: number, screenY: number): Promise<void> =>
    ipcRenderer.invoke('window:pipStartDrag', screenX, screenY),

  pipDragMove: (screenX: number, screenY: number): Promise<void> =>
    ipcRenderer.invoke('window:pipDragMove', screenX, screenY),

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

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('windowApi', windowApi);

// Type declaration for the exposed API
export type WindowApi = typeof windowApi;
