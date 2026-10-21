const { app, ipcMain } = require('electron');
const { CHANNELS } = require('./channels');
const { createIpcClient } = require('./client');
const { isAppUrl, isProductionCliMode } = require('../window');

let handlersRegistered = false;

/** Whether the calling frame is the app itself (the dev server or the built index.html). */
function isTrustedSender(event) {
  const frameUrl = event.senderFrame?.url ?? '';
  return isAppUrl(frameUrl, !app.isPackaged && !isProductionCliMode());
}

function registerIpcHandlers() {
  if (handlersRegistered) {
    return;
  }

  const { IPC_HANDLERS } = require('./handlers');

  for (const [channel, handler] of Object.entries(IPC_HANDLERS)) {
    // The event comes second so window controls can act on the window that asked; most handlers ignore it.
    ipcMain.handle(channel, async (event, payload) => {
      if (!isTrustedSender(event)) {
        throw new Error(`Blocked IPC call to ${channel} from an untrusted frame`);
      }

      return handler(payload, event);
    });
  }

  handlersRegistered = true;
}

module.exports = {
  CHANNELS,
  createIpcClient,
  registerIpcHandlers,
};
