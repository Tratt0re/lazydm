const { BrowserWindow } = require('electron');
const { reloadOpenWindows } = require('../window');

function reload() {
  reloadOpenWindows();
}

/** The window that sent the request (window controls of the app title bar). */
function getSenderWindow(event) {
  const browserWindow = event ? BrowserWindow.fromWebContents(event.sender) : null;
  if (!browserWindow || browserWindow.isDestroyed()) {
    throw new Error('No window for this request.');
  }

  return browserWindow;
}

function getState(_payload, event) {
  const browserWindow = getSenderWindow(event);
  return {
    platform: process.platform,
    isMaximized: browserWindow.isMaximized(),
    isFullscreen: browserWindow.isFullScreen(),
  };
}

function minimize(_payload, event) {
  getSenderWindow(event).minimize();
}

/** Maximize / restore (double-click on the title bar does the same). */
function toggleMaximize(_payload, event) {
  const browserWindow = getSenderWindow(event);
  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  } else {
    browserWindow.maximize();
  }

  return { isMaximized: browserWindow.isMaximized() };
}

function close(_payload, event) {
  getSenderWindow(event).close();
}

/**
 * A real paste in the sender's focused element (the editor's right-click *Paste*): the page handles it
 * like Cmd/Ctrl+V, so media files on the clipboard become assets too.
 */
function paste(_payload, event) {
  getSenderWindow(event).webContents.paste();
}

module.exports = {
  close,
  getState,
  minimize,
  paste,
  reload,
  toggleMaximize,
};
