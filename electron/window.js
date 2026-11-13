const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { openExternalSafe } = require('./utils/external-url');

const isMac = process.platform === 'darwin';

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:4200';
const RENDERER_BUILD_SEGMENTS = ['dist', 'lazydm', 'browser'];
const PRODUCTION_MODE_FLAGS = new Set(['--prod', '--production']);
const openWindows = new Set();
/** Centres the macOS traffic lights in the 40px title bar of the app. */
const TRAFFIC_LIGHT_POSITION = Object.freeze({ x: 16, y: 13 });

function resolveAppPath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

function resolveRendererIndexPath() {
  return resolveAppPath(...RENDERER_BUILD_SEGMENTS, 'index.html');
}

function resolvePreloadPath() {
  const preloadPath = resolveAppPath('electron', 'preload.bundle.cjs');

  if (!fs.existsSync(preloadPath)) {
    throw new Error(`Preload bundle not found at ${preloadPath}. Run "npm run build:preload".`);
  }

  return preloadPath;
}

// macOS shows the icon with Apple's margin and shadow; Windows and Linux show it edge to edge.
const APP_ICON_FILE = process.platform === 'darwin' ? 'lazydm_ico_1024.png' : 'lazydm_ico_win.png';

function resolveAppIconPath(isDev) {
  const candidates = isDev
    ? [
        resolveAppPath('src', 'assets', 'icon', APP_ICON_FILE),
        resolveAppPath(...RENDERER_BUILD_SEGMENTS, 'assets', 'icon', APP_ICON_FILE),
      ]
    : [resolveAppPath(...RENDERER_BUILD_SEGMENTS, 'assets', 'icon', APP_ICON_FILE)];

  for (const iconPath of candidates) {
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }

  return null;
}

function initMainWindow(isDev, iconPath = null) {
  const windowOptions = {
    width: 1200,
    height: 800,
    minWidth: 950,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: isDev,
    },
  };

  if (iconPath) {
    windowOptions.icon = iconPath;
  }

  // The app draws its own title bar: macOS keeps the native traffic lights inset into it,
  // the other platforms get a frameless window and the app's own window buttons.
  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = TRAFFIC_LIGHT_POSITION;
  } else {
    windowOptions.frame = false;
  }

  return new BrowserWindow(windowOptions);
}

function emitFullscreenState(mainWindow) {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('window:fullscreenChanged', {
    isFullscreen: mainWindow.isFullScreen(),
  });
}

function emitMaximizedState(mainWindow) {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('window:maximizedChanged', {
    isMaximized: mainWindow.isMaximized(),
  });
}

function registerWindowLifecycle(mainWindow) {
  openWindows.add(mainWindow);

  // mainWindow.on('focus', () => {});
  // mainWindow.on('blur', () => {});
  // mainWindow.on('close', (event) => {});

  mainWindow.webContents.on('did-finish-load', () => {
    emitFullscreenState(mainWindow);
  });

  mainWindow.on('enter-full-screen', () => {
    emitFullscreenState(mainWindow);
  });

  mainWindow.on('leave-full-screen', () => {
    emitFullscreenState(mainWindow);
  });

  mainWindow.on('maximize', () => emitMaximizedState(mainWindow));
  mainWindow.on('unmaximize', () => emitMaximizedState(mainWindow));

  mainWindow.on('closed', () => {
    openWindows.delete(mainWindow);
  });
}

/**
 * Whether `url` is the app itself: the dev server origin, or a route of the built renderer. The app uses path
 * routing, so its pages are `file://<build folder>/<route>` rather than `index.html`; anything outside that
 * folder (another local file) is not the app.
 */
function isAppUrl(url, isDev) {
  try {
    const target = new URL(url);
    if (isDev) {
      return target.origin === new URL(DEV_SERVER_URL).origin;
    }

    if (target.protocol !== 'file:') {
      return false;
    }

    const buildDir = pathToFileURL(path.dirname(resolveRendererIndexPath())).pathname;
    return target.pathname === buildDir || target.pathname.startsWith(`${buildDir}/`);
  } catch {
    return false;
  }
}

function registerNavigationGuards(mainWindow, isDev) {
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalSafe(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url, isDev)) {
      return;
    }

    event.preventDefault();
    void openExternalSafe(url);
  });
}

/**
 * The default application menu closes the window on Cmd/Ctrl+W; with the campaign tab bar that
 * shortcut closes the active tab instead, so it is forwarded to the renderer.
 */
function registerTabShortcuts(mainWindow) {
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isModifierPressed = isMac ? input.meta : input.control;
    if (
      input.type !== 'keyDown' ||
      !isModifierPressed ||
      input.shift ||
      input.alt ||
      input.key.toLowerCase() !== 'w'
    ) {
      return;
    }

    event.preventDefault();
    mainWindow.webContents.send('workspace:shortcut', { action: 'closeTab' });
  });
}

function loadWindowContent(mainWindow, isDev) {
  if (isDev) {
    console.log(`[electron] DEV mode -> ${DEV_SERVER_URL}`);
    mainWindow.loadURL(DEV_SERVER_URL);
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    return;
  }

  const indexPath = resolveRendererIndexPath();

  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Renderer build not found at ${indexPath}. Run "npm run build:web" before starting Electron in production mode.`,
    );
  }

  console.log('[electron] PROD mode ->', indexPath);
  mainWindow.loadFile(indexPath);
}

function isProductionCliMode() {
  return process.argv.some((flag) => PRODUCTION_MODE_FLAGS.has(flag));
}

function createWindow() {
  const isDev = !app.isPackaged && !isProductionCliMode();
  const iconPath = resolveAppIconPath(isDev);

  if (isMac && iconPath) {
    app.dock.setIcon(iconPath);
  }

  const mainWindow = initMainWindow(isDev, iconPath);
  registerWindowLifecycle(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  registerNavigationGuards(mainWindow, isDev);
  registerTabShortcuts(mainWindow);
  loadWindowContent(mainWindow, isDev);

  return mainWindow;
}

function reloadOpenWindows() {
  const isDev = !app.isPackaged && !isProductionCliMode();

  if (openWindows.size === 0) {
    createWindow();
    return;
  }

  for (const mainWindow of openWindows) {
    if (mainWindow.isDestroyed()) {
      continue;
    }

    loadWindowContent(mainWindow, isDev);
  }
}

module.exports = {
  createWindow,
  isAppUrl,
  isProductionCliMode,
  initMainWindow,
  reloadOpenWindows,
};
