# NeosTasks

A beautiful floating macOS todo app with glassmorphism UI, built with Electron + React + Vite.

![NeosTasks Screenshot](./docs/screenshot.png)

## Features

- 🪟 **Floating Window** - Always-on-top, visible on all Spaces
- ✨ **Glassmorphism UI** - macOS "Liquid Glass" aesthetic with blur effects
- 📋 **Multiple Spaces** - Organize todos into different lists
- ☁️ **Cloud Sync** - Data persisted in Supabase
- ⌨️ **Global Hotkey** - `Cmd+Shift+Space` to toggle visibility
- 🎚️ **Customizable** - Adjust opacity, toggle always-on-top

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast bundler
- **Supabase** - PostgreSQL database
- **electron-builder** - App packaging

## Prerequisites

- Node.js 18+
- npm or yarn
- A Supabase account (free tier works)

## Setup

### 1. Clone and Install

```bash
cd NeosTasks
npm install
```

### 2. Configure Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase/schema.sql`
3. Go to Settings > API and copy your credentials
4. Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run in Development

```bash
npm run electron:dev
```

This starts both the Vite dev server and Electron concurrently.

### 4. Build for Production

```bash
npm run build
```

### 5. Package macOS App

```bash
npm run package
```

The `.app` and `.dmg` files will be in the `release/` directory.

## Project Structure

```
NeosTasks/
├── electron/
│   ├── main.ts        # Electron main process
│   └── preload.ts     # IPC bridge (contextIsolation)
├── src/
│   ├── components/    # React components
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # Supabase client
│   ├── types/         # TypeScript definitions
│   ├── App.tsx        # Main app component
│   ├── main.tsx       # React entry point
│   └── index.css      # Styles with CSS variables
├── supabase/
│   └── schema.sql     # Database schema
├── build/             # Build resources (icons, entitlements)
├── electron-builder.json
├── vite.config.ts
└── package.json
```

## How It Works

### Glassmorphism on macOS

The glassmorphism effect is achieved through a combination of:

1. **Electron BrowserWindow settings:**
   - `transparent: true` - Enables transparent window background
   - `vibrancy: 'under-window'` - macOS system blur effect
   - `visualEffectState: 'active'` - Keeps vibrancy even when unfocused

2. **CSS backdrop-filter:**
   ```css
   .app-container {
     background: rgba(255, 255, 255, 0.72);
     backdrop-filter: blur(40px);
     -webkit-backdrop-filter: blur(40px);
   }
   ```

3. **Translucent backgrounds:**
   - All backgrounds use rgba colors with alpha < 1
   - Layered transparency creates depth

### Always-on-Top & Visible on All Workspaces

```typescript
// In main.ts
mainWindow.setAlwaysOnTop(true, 'floating');
mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
```

- `'floating'` level ensures the window stays above normal windows
- `visibleOnFullScreen: true` shows the window even in fullscreen apps

### IPC Security

The app uses Electron's recommended security model:

```typescript
// main.ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  preload: path.join(__dirname, 'preload.js'),
}
```

The preload script exposes only the necessary APIs:

```typescript
// preload.ts
contextBridge.exposeInMainWorld('windowApi', {
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:setAlwaysOnTop', value),
  // ...
});
```

### Global Hotkey

```typescript
globalShortcut.register('CommandOrControl+Shift+Space', () => {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
  }
});
```

## macOS Caveats

### Transparency Performance

- `vibrancy` uses native macOS blur, which is hardware-accelerated
- CSS `backdrop-filter` adds additional GPU load
- On older Macs, consider reducing blur amount or disabling vibrancy

### Notarization (for distribution)

To distribute outside the Mac App Store, you need to:

1. Have an Apple Developer account ($99/year)
2. Sign and notarize the app
3. Add signing config to `electron-builder.json`:

```json
{
  "mac": {
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist",
    "identity": "Your Developer ID Application"
  },
  "afterSign": "scripts/notarize.js"
}
```

### Window State Persistence

Window position and size are saved to:
```
~/Library/Application Support/NeosTasks/window-state.json
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘ + ⇧ + Space` | Toggle window visibility |
| `Enter` | Add new todo |
| `Double-click` | Edit todo text |
| `Escape` | Cancel editing |

## Data Model

### Spaces
```sql
CREATE TABLE spaces (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ
);
```

### Todos
```sql
CREATE TABLE todos (
  id UUID PRIMARY KEY,
  space_id UUID REFERENCES spaces(id),
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

### Settings
```sql
CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  always_on_top BOOLEAN DEFAULT TRUE,
  visible_on_all_workspaces BOOLEAN DEFAULT TRUE,
  opacity REAL DEFAULT 1.0,
  last_selected_space UUID
);
```

## License

MIT
