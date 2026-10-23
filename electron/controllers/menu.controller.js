const { app, Menu, shell } = require('electron');
const { broadcastIpcEvent } = require('../ipc/broadcast');
const { MAIN_ACTIONS, MENU_ACTION_EVENT, buildMenuTemplate } = require('../menu');
const { ensurePlainObject } = require('./utils');

const isMac = process.platform === 'darwin';

/** Keeps only string labels and boolean flags: the menu is built from what the renderer sends. */
function sanitize(value, isValid) {
  const result = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (isValid(entry)) {
      result[key] = entry;
    }
  }

  return result;
}

function perform(entryId) {
  if (entryId === MAIN_ACTIONS.revealVault) {
    // Required lazily: the vault controller loads models that need the database.
    const { getCurrent } = require('./vault.controller');
    const { status, vault } = getCurrent();
    if (status === 'ready' && vault) {
      shell.showItemInFolder(vault.path);
    }
    return;
  }

  broadcastIpcEvent(MENU_ACTION_EVENT, { id: entryId });
}

/**
 * (Re)builds the application menu with the renderer's translated labels and enabled entries. Only macOS has an
 * application menu: elsewhere the actions stay reachable through the app's own buttons and shortcuts.
 */
function update(payload) {
  if (!isMac) {
    return { applied: false };
  }

  const body = ensurePlainObject(payload, 'payload');
  const labels = sanitize(body.labels, (entry) => typeof entry === 'string' && entry.length < 120);
  const enabled = sanitize(body.enabled, (entry) => typeof entry === 'boolean');
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildMenuTemplate({ appName: app.name, labels, enabled, perform })),
  );
  return { applied: true };
}

module.exports = {
  update,
};
