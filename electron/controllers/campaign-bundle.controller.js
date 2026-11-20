const { app, dialog, shell } = require('electron');
const path = require('node:path');
const exportModel = require('../models/campaign-export.model');
const { isMediaFileName } = require('./asset.controller');
const { requireExistingCampaign } = require('./campaign.controller');
const vaultController = require('./vault.controller');
const { ensurePlainObject } = require('./utils');

/** The zip the last export wrote: the only file *Show in folder* will reveal (the renderer names no path). */
let lastExportPath = null;

/**
 * Exports a campaign as a zip. The destination is chosen here, in the main process, with the system *Save* dialog
 * (the renderer never names a path to write); cancelling is not an error and gives `{ cancelled: true }`.
 * Read-only on the Codex. See design-principles §6g.
 */
async function exportCampaign(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const slug = await requireExistingCampaign(body, vaultPath);

  const result = await dialog.showSaveDialog({
    defaultPath: path.join(app.getPath('documents'), `${slug}.zip`),
    filters: [{ name: 'Zip', extensions: ['zip'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (result.canceled || !result.filePath) {
    return { cancelled: true };
  }

  const summary = await exportModel.exportCampaign(vaultPath, slug, result.filePath, {
    isMedia: isMediaFileName,
    appVersion: app.getVersion(),
    // The user picked the place and confirmed an overwrite in the dialog.
    allowInsideVault: true,
    overwrite: true,
  });
  lastExportPath = summary.path;
  return { cancelled: false, ...summary };
}

/** Shows the zip of the last export in the system file manager; false when there is none or it is gone. */
function revealLastExport() {
  if (lastExportPath === null) {
    return { revealed: false };
  }

  shell.showItemInFolder(lastExportPath);
  return { revealed: true };
}

module.exports = {
  exportCampaign,
  revealLastExport,
};
