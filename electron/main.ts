import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  nativeTheme,
  nativeImage,
  dialog,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { autoUpdater } from 'electron-updater';

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
  const defaultWidth = 320;
  const defaultHeight = 520;
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

  // Set visible on all workspaces
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Load the app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    // Uncomment to open DevTools in development
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In packaged app, __dirname is dist-electron/electron/, so we need ../../dist
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

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
    
    // Check for updates when window gains focus (if packaged and no update pending)
    if (app.isPackaged && !updateDownloadedVersion) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }
  });

  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window:focus', false);
    mainWindow?.setOpacity(0.5);
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
          mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
    
    // Show dialog with download link (since auto-install doesn't work without code signing)
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available!`,
      detail: 'Click "Download" to get the latest version.',
      buttons: ['Download', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        // Open the releases page
        require('electron').shell.openExternal(
          `https://github.com/juanchoabdon/flowya-releases/releases/tag/v${info.version}`
        );
      }
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
  });
  
  // IPC handler to download update (opens browser)
  ipcMain.handle('updater:install', () => {
    if (updateDownloadedVersion) {
      require('electron').shell.openExternal(
        `https://github.com/juanchoabdon/flowya-releases/releases/tag/v${updateDownloadedVersion}`
      );
    }
  });
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
          mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
