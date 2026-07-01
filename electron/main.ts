import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  nativeTheme,
  nativeImage,
  dialog,
  shell,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { autoUpdater } from 'electron-updater';
import { AgentLoop } from './agent/agent-loop';

// Disable Chromium's swipe navigation to prevent macOS space switching
app.commandLine.appendSwitch('disable-features', 'TouchpadOverscrollHistoryNavigation');
app.commandLine.appendSwitch('overscroll-history-navigation', '0');

// Import liquid glass for native macOS glass effect
// eslint-disable-next-line @typescript-eslint/no-var-requires
let liquidGlass: {
  addView: (handle: Buffer, options?: { cornerRadius?: number; tintColor?: string; opaque?: boolean }) => number;
  unstable_setVariant?: (viewId: number, variant: number) => void;
} | null = null;

try {
  const liquidGlassModule = require('electron-liquid-glass');
  liquidGlass = liquidGlassModule.default || liquidGlassModule;
  console.log('Liquid glass module loaded:', Object.keys(liquidGlass || {}));
} catch (e) {
  console.warn('electron-liquid-glass not available:', e);
}

// Window state persistence
interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getWindowStateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState | null {
  try {
    const stateFile = getWindowStateFile();
    if (fs.existsSync(stateFile)) {
      const data = fs.readFileSync(stateFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load window state:', e);
  }
  return null;
}

function saveWindowState(state: WindowState): void {
  try {
    fs.writeFileSync(getWindowStateFile(), JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let glassViewId: number | null = null;
let pipSavedBounds: WindowState | null = null;

// Agent state
let activeAgent: AgentLoop | null = null;

// Store original window bounds for restore
let savedBounds: { x: number; y: number; width: number; height: number } | null = null;
const NUDGE_SIZE = 70;

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow(): void {
  const savedState = loadWindowState();
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Default position: top-right corner with some padding
  const defaultWidth = 350;
  const defaultHeight = 340;
  const defaultX = screenWidth - defaultWidth - 20;
  const defaultY = 60;

  mainWindow = new BrowserWindow({
    width: savedState?.width ?? defaultWidth,
    height: savedState?.height ?? defaultHeight,
    x: savedState?.x ?? defaultX,
    y: savedState?.y ?? defaultY,
    minWidth: 280,
    minHeight: 400,
    maxWidth: 500,
    maxHeight: 800,
    
    // macOS-specific window styling for Liquid Glass
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 }, // Hide traffic lights
    transparent: true,
    backgroundColor: '#00000000',
    
    // Floating window behavior
    alwaysOnTop: true,
    
    // Frame and shadow
    frame: false,
    hasShadow: true,
    roundedCorners: true,
    
    // macOS click behavior - accept clicks without stealing focus from Split View
    acceptFirstMouse: true,
    
    // Security
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload script
    },
  });

  // Show window buttons (required for liquid glass)
  mainWindow.setWindowButtonVisibility(true);

  // Set Content Security Policy to allow Amplitude and fonts
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com data:; " +
          "connect-src 'self' https://*.amplitude.com https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://flowya-mcp.vercel.app; " +
          "img-src 'self' data: blob:;"
        ]
      }
    });
  });

  // Configure as floating utility window
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'floating', 1);

  // Load the app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    // Uncomment to open DevTools in development
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In packaged app, __dirname is dist-electron/electron/, so we need ../../dist
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Prevent navigation to external URLs - open in system browser instead
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow navigation to localhost (dev server) and file:// (production)
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Prevent new windows from opening - open in system browser instead
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Apply native Liquid Glass effect after content loads
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && liquidGlass && liquidGlass.addView) {
      try {
        glassViewId = liquidGlass.addView(mainWindow.getNativeWindowHandle(), {
          cornerRadius: 18,
          tintColor: '#00000060',
        });
        if (glassViewId !== null && liquidGlass.unstable_setVariant) {
          liquidGlass.unstable_setVariant(glassViewId, 2);
        }
        console.log('Liquid Glass applied');
      } catch (e) {
        console.error('Failed to apply liquid glass effect:', e);
      }
    }
  });

  // Save window state on move/resize
  mainWindow.on('moved', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      saveWindowState(bounds);
    }
  });

  mainWindow.on('resized', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      saveWindowState(bounds);
    }
  });

  // Handle close behavior - for now, just quit normally to keep dock icon visible
  // mainWindow.on('close', (event) => {
  //   if (!isQuitting) {
  //     event.preventDefault();
  //     mainWindow?.hide();
  //   }
  // });

  mainWindow.on('closed', () => {
    mainWindow = null;
    glassViewId = null;
  });

  // Handle focus state - adjust opacity when window loses focus
  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window:focus', true);
    mainWindow?.setOpacity(1.0);
    
    // Re-ensure floating level on focus to prevent space switching
    mainWindow?.setAlwaysOnTop(true, 'floating', 1);
    
    // Check for updates when window gains focus (if packaged and no update pending)
    if (app.isPackaged && !updateDownloadedVersion) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }
  });

  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window:focus', false);
    mainWindow?.setOpacity(0.5);
    
    // Re-ensure floating level on blur  
    mainWindow?.setAlwaysOnTop(true, 'floating', 1);
  });
}

// IPC Handlers
function setupIPC(): void {
  // Toggle always on top
  ipcMain.handle('window:setAlwaysOnTop', (_event, value: boolean) => {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(value, 'pop-up-menu', 1);
      return true;
    }
    return false;
  });

  // Get always on top state
  ipcMain.handle('window:getAlwaysOnTop', () => {
    return mainWindow?.isAlwaysOnTop() ?? true;
  });

  // Toggle visible on all workspaces
  ipcMain.handle('window:setVisibleOnAllWorkspaces', (_event, value: boolean) => {
    if (mainWindow) {
      mainWindow.setVisibleOnAllWorkspaces(value, { visibleOnFullScreen: true });
      return true;
    }
    return false;
  });

  // Set window opacity
  ipcMain.handle('window:setOpacity', (_event, value: number) => {
    if (mainWindow) {
      // Clamp value between 0.3 and 1.0
      const opacity = Math.max(0.3, Math.min(1.0, value));
      mainWindow.setOpacity(opacity);
      return true;
    }
    return false;
  });

  // Toggle window visibility
  ipcMain.handle('window:toggle', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
      return mainWindow.isVisible();
    }
    return false;
  });

  // Get theme
  ipcMain.handle('system:getTheme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  // Quit app
  ipcMain.handle('app:quit', () => {
    isQuitting = true;
    app.quit();
  });

  // Open external URL in system browser
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });

  // Resize window
  ipcMain.handle('window:resize', (_event, width: number, height: number) => {
    if (mainWindow) {
      mainWindow.setSize(width, height, true);
      return true;
    }
    return false;
  });

  // Reset window to default size and position (like first launch)
  ipcMain.handle('window:resetToDefault', () => {
    if (mainWindow) {
      const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
      const defaultWidth = 350;
      const defaultHeight = 340;
      const defaultX = screenWidth - defaultWidth - 20;
      const defaultY = 60;
      
      const newBounds = { x: defaultX, y: defaultY, width: defaultWidth, height: defaultHeight };
      mainWindow.setBounds(newBounds, true);
      // Save the new state so it persists
      saveWindowState(newBounds);
      return true;
    }
    return false;
  });

  // Enter PIP mode - shrink window to bottom-right corner
  ipcMain.handle('window:enterPip', () => {
    if (!mainWindow) return false;
    pipSavedBounds = mainWindow.getBounds();
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const pipWidth = 230;
    const pipHeight = 48;
    const pipX = screenWidth - pipWidth - 20;
    const pipY = screenHeight - pipHeight - 12;
    mainWindow.setMinimumSize(140, 50);
    mainWindow.setBounds({ x: pipX, y: pipY, width: pipWidth, height: pipHeight }, true);
    mainWindow.webContents.send('window:pipChanged', true);
    return true;
  });

  // PIP drag - start drag tracking
  let pipDragStart: { screenX: number; screenY: number; winX: number; winY: number } | null = null;
  ipcMain.handle('window:pipStartDrag', (_event, screenX: number, screenY: number) => {
    if (!mainWindow) return;
    const [winX, winY] = mainWindow.getPosition();
    pipDragStart = { screenX, screenY, winX, winY };
  });

  // PIP drag - move window
  ipcMain.handle('window:pipDragMove', (_event, screenX: number, screenY: number) => {
    if (!mainWindow || !pipDragStart) return;
    const dx = screenX - pipDragStart.screenX;
    const dy = screenY - pipDragStart.screenY;
    mainWindow.setPosition(pipDragStart.winX + dx, pipDragStart.winY + dy);
  });

  // Exit PIP mode - restore previous window bounds
  ipcMain.handle('window:exitPip', () => {
    if (!mainWindow) return false;
    mainWindow.setMinimumSize(280, 400);
    if (pipSavedBounds) {
      mainWindow.setBounds(pipSavedBounds, true);
      saveWindowState(pipSavedBounds);
      pipSavedBounds = null;
    } else {
      const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
      mainWindow.setBounds({ x: screenWidth - 370, y: 60, width: 350, height: 340 }, true);
    }
    mainWindow.webContents.send('window:pipChanged', false);
    return true;
  });

  // Refresh dock and floating (call after login)
  ipcMain.handle('window:refreshDock', () => {
    if (process.platform === 'darwin' && app.dock) {
      const icnsPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'icon.icns')
        : path.join(app.getAppPath(), 'build', 'icon.icns');
      const pngPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(app.getAppPath(), 'build', 'icon.png');
      
      const iconPath = fs.existsSync(icnsPath) ? icnsPath : pngPath;
      
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          app.dock.setIcon(icon);
        }
      }
      app.dock.show();
      
      // Re-apply floating AFTER dock.show()
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(true, 'floating', 1);
        }
      }, 100);
    }
    return true;
  });

  // Set minimized mode - removes glass effect temporarily
  ipcMain.handle('window:setMinimized', (_event, minimized: boolean) => {
    if (!mainWindow) return false;
    
    if (minimized) {
      // Remove the liquid glass effect by setting window to use vibrancy instead
      // This effectively "disables" the custom glass view
      mainWindow.setBackgroundColor('#00000000');
    } else {
      // Re-apply liquid glass when expanding
      if (liquidGlass && liquidGlass.addView && glassViewId === null) {
        try {
          glassViewId = liquidGlass.addView(mainWindow.getNativeWindowHandle(), {
            cornerRadius: 18,
            tintColor: '#00000060',
          });
          if (glassViewId !== null && liquidGlass.unstable_setVariant) {
            liquidGlass.unstable_setVariant(glassViewId, 2);
          }
        } catch (e) {
          console.error('Failed to re-apply liquid glass:', e);
        }
      }
    }
    return true;
  });

  // Claude Computer Use agent
  ipcMain.handle('agent:start', async (_event, payload: { apiKey: string; taskText: string; taskDescription?: string }) => {
    if (activeAgent && activeAgent.getStatus() === 'running') {
      return { error: true, message: 'Agent is already running.' };
    }

    const { width: displayWidth, height: displayHeight } = screen.getPrimaryDisplay().size;
    // Scale down for retina — use logical resolution
    const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
    const logicalWidth = Math.round(displayWidth / scaleFactor) || 1280;
    const logicalHeight = Math.round(displayHeight / scaleFactor) || 800;

    activeAgent = new AgentLoop(payload.apiKey, {
      displayWidth: logicalWidth,
      displayHeight: logicalHeight,
    });

    activeAgent.on('agent-event', (event) => {
      mainWindow?.webContents.send('agent:event', event);
    });

    // Run the agent loop (non-blocking — runs in background)
    activeAgent.run(payload.taskText, payload.taskDescription).catch((err) => {
      console.error('Agent loop error:', err);
    });

    return { error: false };
  });

  ipcMain.handle('agent:stop', () => {
    if (activeAgent) {
      activeAgent.cancel();
      activeAgent = null;
    }
    return true;
  });

  ipcMain.handle('agent:getStatus', () => {
    return activeAgent?.getStatus() ?? 'idle';
  });

  // OpenAI API proxy - bypasses renderer CSP restrictions
  ipcMain.handle('ai:chat', async (_event, payload: { apiKey: string; model: string; messages: Array<{ role: string; content: string }>; temperature: number }) => {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${payload.apiKey}`,
        },
        body: JSON.stringify({
          model: payload.model,
          messages: payload.messages,
          temperature: payload.temperature,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return { error: true, status: response.status, body: errorBody };
      }

      const data = await response.json();
      return { error: false, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { error: true, status: 0, body: message };
    }
  });
}

// Auto-updater setup
let updateDownloadedVersion: string | null = null;

function setupAutoUpdater(): void {
  // Don't check for updates in development
  if (!app.isPackaged) {
    console.log('Skipping auto-update in development mode');
    return;
  }

  // Configure auto-updater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Check for updates immediately
  autoUpdater.checkForUpdatesAndNotify();
  
  // Check for updates every 30 minutes
  setInterval(() => {
    if (!updateDownloadedVersion) {
      console.log('Checking for updates (periodic)...');
      autoUpdater.checkForUpdatesAndNotify();
    }
  }, 30 * 60 * 1000); // 30 minutes

  // Events
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    // Notify renderer
    mainWindow?.webContents.send('updater:available', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    updateDownloadedVersion = info.version;
    
    // Notify renderer
    mainWindow?.webContents.send('updater:downloaded', info.version);
    
    // Show dialog to restart and install
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} is ready to install`,
      detail: 'Restart now to update to the latest version.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        performUpdate();
      }
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
  });
  
  // IPC handler to install update
  ipcMain.handle('updater:install', () => {
    if (updateDownloadedVersion) {
      performUpdate();
    }
  });
}

function performUpdate(): void {
  console.log('Performing update...');
  isQuitting = true;
  
  // Close all windows first
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(win => {
    win.removeAllListeners('close');
    win.close();
  });
  
  // quitAndInstall with isSilent=false, isForceRunAfter=true
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 500);
}

// Register global hotkey
function registerGlobalShortcut(): void {
  const shortcut = 'CommandOrControl+Shift+Space';
  
  const registered = globalShortcut.register(shortcut, () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
        // Bring to front
        mainWindow.moveTop();
      }
    }
  });

  if (!registered) {
    console.error(`Failed to register global shortcut: ${shortcut}`);
  }

  // Emergency stop for agent — Cmd+Shift+Escape
  const emergencyStop = 'CommandOrControl+Shift+Escape';
  const emergencyRegistered = globalShortcut.register(emergencyStop, () => {
    if (activeAgent) {
      console.log('Emergency stop: cancelling agent.');
      activeAgent.cancel();
      activeAgent = null;
      mainWindow?.webContents.send('agent:event', {
        type: 'done',
        status: 'cancelled',
        message: 'Agent stopped via emergency hotkey (Cmd+Shift+Escape).',
      });
    }
  });

  if (!emergencyRegistered) {
    console.error(`Failed to register emergency stop shortcut: ${emergencyStop}`);
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  setupIPC();
  registerGlobalShortcut();
  setupAutoUpdater();
  
  // Set custom dock icon with delay, then re-apply floating
  setTimeout(() => {
    if (process.platform === 'darwin' && app.dock) {
      const icnsPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'icon.icns')
        : path.join(app.getAppPath(), 'build', 'icon.icns');
      const pngPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(app.getAppPath(), 'build', 'icon.png');
      
      const iconPath = fs.existsSync(icnsPath) ? icnsPath : pngPath;
      
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          app.dock.setIcon(icon);
        }
      }
      app.dock.show();
      
      // Re-apply floating AFTER dock.show()
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(true, 'floating', 1);
        }
      }, 100);
    }
  }, 500);

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle macOS dock click
app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});
