const { ipcMain } = require('electron');
const { CHANNELS } = require('./channels');
const { createIpcClient } = require('./client');

let handlersRegistered = false;

function registerIpcHandlers() {
  if (handlersRegistered) {
    return;
  }

  const { IPC_HANDLERS } = require('./handlers');

  for (const [channel, handler] of Object.entries(IPC_HANDLERS)) {
    // The event comes second so window controls can act on the window that asked; most handlers ignore it.
    ipcMain.handle(channel, async (event, payload) => handler(payload, event));
  }

  handlersRegistered = true;
}

module.exports = {
  CHANNELS,
  createIpcClient,
  registerIpcHandlers,
};
