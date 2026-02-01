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
  
  // System info
  getTheme: (): Promise<'dark' | 'light'> => 
    ipcRenderer.invoke('system:getTheme'),
  
  // Focus listener
  onFocusChange: (callback: (focused: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, focused: boolean) => callback(focused);
    ipcRenderer.on('window:focus', handler);
    return () => ipcRenderer.removeListener('window:focus', handler);
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('windowApi', windowApi);

// Type declaration for the exposed API
export type WindowApi = typeof windowApi;
