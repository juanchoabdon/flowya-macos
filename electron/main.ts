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

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let glassViewId: number | null = null;
let isExpanded = false;

// Agent state
let activeAgent: AgentLoop | null = null;

// Notch/pill dimensions
const PILL_WIDTH = 280;
const PILL_HEIGHT = 38;
const EXPANDED_WIDTH = 380;
const EXPANDED_HEIGHT = 600;

// Welcome window (login / onboarding) — a centered modal, not anchored to the notch
const WELCOME_WIDTH = 460;
const WELCOME_HEIGHT = 640;

// 'docked' = notch pill with hover-to-expand; 'welcome' = centered onboarding window
let windowMode: 'welcome' | 'docked' = 'docked';

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

function getNotchInfo(): { hasNotch: boolean; menuBarHeight: number } {
  const display = screen.getPrimaryDisplay();
  const { height: totalHeight } = display.size;
  const { height: workAreaHeight } = display.workAreaSize;
  const menuBarHeight = totalHeight - workAreaHeight;
  const scaleFactor = display.scaleFactor;
  const physicalWidth = display.size.width * scaleFactor;
  const hasNotch = physicalWidth >= 3024;
  return { hasNotch, menuBarHeight };
}

function getCurrentDisplay() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const b = mainWindow.getBounds();
    return screen.getDisplayNearestPoint({
      x: b.x + Math.round(b.width / 2),
      y: b.y + Math.round(b.height / 2),
    });
  }
  return screen.getPrimaryDisplay();
}

function getPillPosition(): { x: number; y: number } {
  const display = getCurrentDisplay();
  const x = display.bounds.x + Math.round((display.workAreaSize.width - PILL_WIDTH) / 2);
  const y = display.bounds.y;
  return { x, y };
}

function getExpandedPosition(): { x: number; y: number } {
  const display = getCurrentDisplay();
  const x = display.bounds.x + Math.round((display.workAreaSize.width - EXPANDED_WIDTH) / 2);
  const y = display.bounds.y;
  return { x, y };
}

function getWelcomePosition(): { x: number; y: number } {
  const display = getCurrentDisplay();
  const x = display.bounds.x + Math.round((display.workAreaSize.width - WELCOME_WIDTH) / 2);
  const y = display.bounds.y + Math.round((display.workAreaSize.height - WELCOME_HEIGHT) / 2);
  return { x, y };
}

function createWindow(): void {
  const pillPos = getPillPosition();

  mainWindow = new BrowserWindow({
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    x: pillPos.x,
    y: pillPos.y,
    minWidth: 140,
    minHeight: 38,
    maxWidth: WELCOME_WIDTH,
    maxHeight: WELCOME_HEIGHT,
    
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    transparent: true,
    backgroundColor: '#00000000',
    
    alwaysOnTop: true,
    
    frame: false,
    hasShadow: true,
    roundedCorners: true,
    
    acceptFirstMouse: true,
    resizable: false,
    movable: false,
    
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setWindowButtonVisibility(false);

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

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'floating', 1);

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && liquidGlass && liquidGlass.addView) {
      try {
        glassViewId = liquidGlass.addView(mainWindow.getNativeWindowHandle(), {
          cornerRadius: 19,
          tintColor: '#000000E0',
          opaque: true,
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

  mainWindow.on('closed', () => {
    mainWindow = null;
    glassViewId = null;
  });

  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window:focus', true);
    mainWindow?.setAlwaysOnTop(true, 'floating', 1);
    
    if (app.isPackaged && !updateDownloadedVersion) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }
  });

  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window:focus', false);
    if (!isExpanded) {
      mainWindow?.setOpacity(0.85);
    }
    mainWindow?.setAlwaysOnTop(true, 'floating', 1);
  });
}

let boundsAnimTimer: ReturnType<typeof setInterval> | null = null;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Slow start + slow end. Feels much smoother than easeOut for shrinking, since
// it avoids the abrupt initial jump that makes a collapse look janky.
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Smoothly animate the native window bounds ourselves at ~60fps. macOS's built-in
// setBounds animation is slow and choppy, and animating in CSS shows an empty
// full-size window. Tweening the real frame keeps the content perfectly in sync.
function animateBounds(
  target: { x: number; y: number; width: number; height: number },
  duration: number,
  easing: (t: number) => number = easeOutCubic,
  onDone?: () => void
): void {
  if (!mainWindow) return;
  if (boundsAnimTimer) {
    clearInterval(boundsAnimTimer);
    boundsAnimTimer = null;
  }

  const start = mainWindow.getBounds();
  const startTime = Date.now();
  const frameMs = 1000 / 60;

  boundsAnimTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (boundsAnimTimer) clearInterval(boundsAnimTimer);
      boundsAnimTimer = null;
      return;
    }
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const e = easing(t);

    mainWindow.setBounds({
      x: Math.round(start.x + (target.x - start.x) * e),
      y: Math.round(start.y + (target.y - start.y) * e),
      width: Math.round(start.width + (target.width - start.width) * e),
      height: Math.round(start.height + (target.height - start.height) * e),
    });

    if (t >= 1) {
      if (boundsAnimTimer) clearInterval(boundsAnimTimer);
      boundsAnimTimer = null;
      onDone?.();
    }
  }, frameMs);
}

function expandWindow(): boolean {
  if (windowMode !== 'docked') return false;
  if (!mainWindow || isExpanded) return false;
  isExpanded = true;
  const pos = getExpandedPosition();
  mainWindow.setMinimumSize(140, 38);
  mainWindow.setOpacity(1.0);
  // Focus the window so macOS renders the Liquid Glass in its active (bright)
  // state — otherwise the panel looks noticeably darker until the user clicks it.
  mainWindow.show();
  mainWindow.focus();
  // Tell the renderer to swap to expanded content immediately; the growing
  // window frame reveals it naturally from the top down.
  mainWindow.webContents.send('window:expandStateChanged', true);
  animateBounds(
    { x: pos.x, y: pos.y, width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT },
    340,
    easeInOutCubic,
    () => { mainWindow?.setMinimumSize(EXPANDED_WIDTH, 200); }
  );
  return true;
}

function collapseWindow(): boolean {
  if (windowMode !== 'docked') return false;
  if (!mainWindow || !isExpanded) return false;
  isExpanded = false;
  const pos = getPillPosition();
  mainWindow.setMinimumSize(140, 38);
  animateBounds(
    { x: pos.x, y: pos.y, width: PILL_WIDTH, height: PILL_HEIGHT },
    300,
    easeInOutCubic,
    () => { mainWindow?.webContents.send('window:expandStateChanged', false); }
  );
  return true;
}

// Grow into a centered welcome window (login / onboarding). Hover tracking is off
// here so the window never collapses while the user is filling in forms.
function enterWelcomeMode(): boolean {
  if (!mainWindow) return false;
  const alreadyWelcome = windowMode === 'welcome';
  windowMode = 'welcome';
  stopHoverTracking();
  isExpanded = false;
  mainWindow.setMinimumSize(140, 38);
  mainWindow.setOpacity(1.0);
  const pos = getWelcomePosition();
  if (alreadyWelcome) {
    mainWindow.setBounds({ x: pos.x, y: pos.y, width: WELCOME_WIDTH, height: WELCOME_HEIGHT }, false);
    mainWindow.webContents.send('window:modeChanged', 'welcome');
    return true;
  }
  animateBounds(
    { x: pos.x, y: pos.y, width: WELCOME_WIDTH, height: WELCOME_HEIGHT },
    360,
    easeInOutCubic,
    () => {
      mainWindow?.setMinimumSize(WELCOME_WIDTH, 400);
      mainWindow?.webContents.send('window:modeChanged', 'welcome');
    }
  );
  return true;
}

// Shrink from the welcome window down into the notch pill and re-enable hover.
function enterDockedMode(): boolean {
  if (!mainWindow) return false;
  if (windowMode === 'docked') {
    // Already docked (e.g. returning logged-in user on launch) — just confirm.
    mainWindow.webContents.send('window:modeChanged', 'docked');
    if (!hoverPollInterval) startHoverTracking();
    return true;
  }
  windowMode = 'docked';
  isExpanded = false;
  mainWindow.setMinimumSize(140, 38);
  const pos = getPillPosition();
  animateBounds(
    { x: pos.x, y: pos.y, width: PILL_WIDTH, height: PILL_HEIGHT },
    380,
    easeInOutCubic,
    () => {
      mainWindow?.webContents.send('window:modeChanged', 'docked');
      startHoverTracking();
    }
  );
  return true;
}

// Hover tracking driven from the main process. DOM mouseenter/mouseleave events are
// unreliable on frameless, always-on-top, non-focused windows on macOS — polling the
// real cursor position against the window bounds is far more robust.
let hoverPollInterval: ReturnType<typeof setInterval> | null = null;
let cursorWasInsideWindow = false;
let hoverExpandTimer: ReturnType<typeof setTimeout> | null = null;
let hoverCollapseTimer: ReturnType<typeof setTimeout> | null = null;
let hoverTrackingReady = false;

const HOVER_EXPAND_DELAY_MS = 300;
const HOVER_COLLAPSE_DELAY_MS = 450;
const HOVER_POLL_INTERVAL_MS = 80;

function stopHoverTracking(): void {
  hoverTrackingReady = false;
  cursorWasInsideWindow = false;
  if (hoverPollInterval) { clearInterval(hoverPollInterval); hoverPollInterval = null; }
  if (hoverExpandTimer) { clearTimeout(hoverExpandTimer); hoverExpandTimer = null; }
  if (hoverCollapseTimer) { clearTimeout(hoverCollapseTimer); hoverCollapseTimer = null; }
}

function startHoverTracking(): void {
  if (windowMode !== 'docked') return;
  // Grace period so the pill doesn't instantly expand if the cursor
  // happens to already be near the top of the screen on launch.
  hoverTrackingReady = false;
  setTimeout(() => { hoverTrackingReady = true; }, 800);

  if (hoverPollInterval) clearInterval(hoverPollInterval);
  hoverPollInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !hoverTrackingReady) return;

    const cursor = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    const isInside =
      cursor.x >= bounds.x &&
      cursor.x <= bounds.x + bounds.width &&
      cursor.y >= bounds.y &&
      cursor.y <= bounds.y + bounds.height;

    if (isInside && !cursorWasInsideWindow) {
      cursorWasInsideWindow = true;
      if (hoverCollapseTimer) {
        clearTimeout(hoverCollapseTimer);
        hoverCollapseTimer = null;
      }
      if (!isExpanded && !hoverExpandTimer) {
        hoverExpandTimer = setTimeout(() => {
          hoverExpandTimer = null;
          expandWindow();
        }, HOVER_EXPAND_DELAY_MS);
      }
    } else if (!isInside && cursorWasInsideWindow) {
      cursorWasInsideWindow = false;
      if (hoverExpandTimer) {
        clearTimeout(hoverExpandTimer);
        hoverExpandTimer = null;
      }
      if (isExpanded && !hoverCollapseTimer) {
        hoverCollapseTimer = setTimeout(() => {
          hoverCollapseTimer = null;
          collapseWindow();
        }, HOVER_COLLAPSE_DELAY_MS);
      }
    }
  }, HOVER_POLL_INTERVAL_MS);
}

// IPC Handlers
function setupIPC(): void {
  // Expand window (pill -> panel)
  ipcMain.handle('window:expand', () => {
    return expandWindow();
  });

  // Collapse window (panel -> pill)
  ipcMain.handle('window:collapse', () => {
    return collapseWindow();
  });

  // Get expand state
  ipcMain.handle('window:getExpandState', () => {
    return isExpanded;
  });

  // Get notch info
  ipcMain.handle('window:getNotchInfo', () => {
    return getNotchInfo();
  });

  // Move pill to next display
  let currentDisplayIndex = 0;
  ipcMain.handle('window:moveToNextDisplay', () => {
    if (!mainWindow) return false;
    const displays = screen.getAllDisplays();
    if (displays.length <= 1) return false;
    // Sync index to the display we're actually on, then advance.
    const current = getCurrentDisplay();
    const currentIdx = displays.findIndex(d => d.id === current.id);
    currentDisplayIndex = ((currentIdx >= 0 ? currentIdx : currentDisplayIndex) + 1) % displays.length;
    const target = displays[currentDisplayIndex];
    const w = isExpanded ? EXPANDED_WIDTH : PILL_WIDTH;
    const h = isExpanded ? EXPANDED_HEIGHT : PILL_HEIGHT;
    const x = target.bounds.x + Math.round((target.workAreaSize.width - w) / 2);
    const y = target.bounds.y;
    mainWindow.setBounds({ x, y, width: w, height: h }, false);
    return true;
  });

  // Number of connected displays
  ipcMain.handle('window:getDisplayCount', () => {
    return screen.getAllDisplays().length;
  });

  // Switch between the welcome (login/onboarding) window and the docked notch pill
  ipcMain.handle('window:setMode', (_event, mode: 'welcome' | 'docked') => {
    if (mode === 'welcome') return enterWelcomeMode();
    return enterDockedMode();
  });

  ipcMain.handle('window:getMode', () => windowMode);

  // Toggle always on top
  ipcMain.handle('window:setAlwaysOnTop', (_event, value: boolean) => {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(value, 'floating', 1);
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
      
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(true, 'floating', 1);
        }
      }, 100);
    }
    return true;
  });

  // Claude Computer Use agent
  ipcMain.handle('agent:start', async (_event, payload: { apiKey: string; taskText: string; taskDescription?: string }) => {
    if (activeAgent && activeAgent.getStatus() === 'running') {
      return { error: true, message: 'Agent is already running.' };
    }

    const { width: displayWidth, height: displayHeight } = screen.getPrimaryDisplay().size;
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

  // OpenAI API proxy
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
  startHoverTracking();
  
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
