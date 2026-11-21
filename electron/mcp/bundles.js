const fs = require('node:fs');
const path = require('node:path');
const { isInside } = require('../utils/path-utils');
const campaignModel = require('../models/campaign.model');
const sectionModel = require('../models/section.model');
const exportModel = require('../models/campaign-export.model');
const importModel = require('../models/campaign-import.model');
const { version: APP_VERSION } = require('../../package.json');

/** A campaign zip is told apart from a folder by its name: the folder import takes anything else. */
function isZipSource(sourcePath) {
  return typeof sourcePath === 'string' && path.extname(sourcePath).toLowerCase() === '.zip';
}

/**
 * The zip an agent names, as a real path, or an error. A zip inside the Codex is refused, like a folder is: an import
 * reads another place and writes a new campaign. Whether the file is a zip LazyDM can take is `openZip`'s to say
 * (it refuses links, other file types and anything hostile), and its refusals are plain sentences.
 */
async function assertZipSource(sourcePath, vaultPath) {
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
    throw new Error('sourcePath must be an absolute path to a .zip file on this computer.');
  }

  let realParent;
  try {
    realParent = await fs.promises.realpath(path.dirname(sourcePath));
  } catch {
    throw new Error(`File not found: ${sourcePath}`);
  }

  const realVault = await fs.promises.realpath(vaultPath);
  if (isInside(realVault, realParent)) {
    throw new Error('The zip is inside the Codex. Pick a zip outside of it.');
  }

  return path.join(realParent, path.basename(sourcePath));
}

/** What a campaign zip holds, without writing anything: the same preview the *Import campaign* modal shows. */
async function scanZip({ sourcePath }, deps) {
  const zipPath = await assertZipSource(sourcePath, deps.vaultPath);
  return { kind: 'zip', ...(await importModel.scanBundle(zipPath, { isMedia: deps.isMedia })) };
}

/** Imports a campaign zip as a new campaign, or with `dryRun` only reports what it holds. See §6g. */
async function importZip({ sourcePath, name, dryRun }, deps) {
  const zipPath = await assertZipSource(sourcePath, deps.vaultPath);
  if (dryRun === true) {
    return {
      dryRun: true,
      kind: 'zip',
      ...(await importModel.scanBundle(zipPath, { isMedia: deps.isMedia })),
    };
  }

  const result = await importModel.importBundle(deps.vaultPath, zipPath, {
    name: typeof name === 'string' && name.trim().length > 0 ? name : null,
    isMedia: deps.isMedia,
    reindex: deps.reindex,
  });
  return { dryRun: false, kind: 'zip', ...result };
}

/**
 * Writes a campaign as a zip at `destination`: an absolute path ending in `.zip`, in a folder that exists, outside
 * the Codex, that is not taken. Read-only on the Codex. Under an access limit only an allowed campaign can be
 * exported, and nothing from outside it goes into the zip (no templates of the Codex root or of a compendium system).
 */
async function exportZip({ slug, destination }, scope, deps) {
  const campaignSlug = scope.resolve(typeof slug === 'string' ? slug : '');
  if (!sectionModel.isPlainFolderSegment(campaignSlug) || campaignSlug.includes('/')) {
    throw new Error(`Not a campaign: ${campaignSlug}`);
  }
  if (!(await campaignModel.readCampaign(deps.vaultPath, campaignSlug))) {
    throw new Error(`Campaign not found: ${campaignSlug}`);
  }

  const summary = await exportModel.exportCampaign(deps.vaultPath, campaignSlug, destination, {
    isMedia: deps.isMedia,
    appVersion: APP_VERSION,
    allowInsideVault: false,
    overwrite: false,
    externalTemplates: !scope.isLimited,
  });
  return { slug: campaignSlug, ...summary };
}

module.exports = {
  exportZip,
  importZip,
  isZipSource,
  scanZip,
};
