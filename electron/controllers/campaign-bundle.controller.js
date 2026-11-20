const { app, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const exportModel = require('../models/campaign-export.model');
const importModel = require('../models/campaign-import.model');
const { ZipRefusedError, ZIP_REFUSALS } = require('../utils/zip-reader');
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

/**
 * A zip path the renderer names (a dropped file): absolute, ending in `.zip`, and a plain file. Anything else is
 * refused as "not a zip" without saying why; the real checks run on the file itself in `openZip`.
 */
async function assertZipPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new ZipRefusedError(ZIP_REFUSALS.notAZip);
  }
  if (path.extname(value).toLowerCase() !== '.zip') {
    throw new ZipRefusedError(ZIP_REFUSALS.notAZip);
  }

  const stat = await fs.promises.lstat(value).catch(() => null);
  if (!stat?.isFile()) {
    throw new ZipRefusedError(ZIP_REFUSALS.notAZip);
  }

  return value;
}

/**
 * Looks into a campaign zip without writing anything, for the *Import campaign* preview. With no `path` the system
 * *Open* dialog picks the file (in the main process); with a `path` (a dropped file) it is checked first. Gives
 * `{ status: 'cancelled' }`, `{ status: 'refused', code }` (a stable code the UI turns into a sentence) or
 * `{ status: 'ready', path, preview }`. A refused zip is an answer, not an exception, so the code survives IPC.
 * See design-principles §6g.
 */
async function scanImport(payload) {
  const body = payload === undefined || payload === null ? {} : ensurePlainObject(payload, 'payload');
  vaultController.getReadyVaultPath();

  try {
    let zipPath;
    if (body.path === undefined || body.path === null) {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Zip', extensions: ['zip'] }],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { status: 'cancelled' };
      }

      zipPath = await assertZipPath(result.filePaths[0]);
    } else {
      zipPath = await assertZipPath(body.path);
    }

    const preview = await importModel.scanBundle(zipPath, { isMedia: isMediaFileName });
    return { status: 'ready', path: zipPath, preview };
  } catch (error) {
    if (error instanceof ZipRefusedError) {
      return { status: 'refused', code: error.code };
    }

    throw error;
  }
}

module.exports = {
  exportCampaign,
  revealLastExport,
  scanImport,
};
