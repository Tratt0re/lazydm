const fs = require('node:fs');
const path = require('node:path');
const { dialog, net, protocol } = require('electron');
const { pathToFileURL } = require('node:url');
const { formatTimestampForFilename, resolveInsideVault } = require('../utils/file-utils');
const { toSlug } = require('../utils/string-sanitize');
const { documentModel, vaultIndexModel } = require('../models');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

/** `lazydm-asset://vault/<vault-relative path>` serves images, maps and PDFs embedded in notes. */
const ASSET_SCHEME = 'lazydm-asset';

const ASSETS_DIR_NAME = 'assets';
const ASSET_MAX_BYTES = 200 * 1024 * 1024;
const ASSET_NAME_MAX_LENGTH = 255;
/** Media files saved as assets (pasted, imported from disk), by kind and extension. */
const MEDIA_EXTENSIONS = Object.freeze({
  image: Object.freeze(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']),
  pdf: Object.freeze(['pdf']),
  audio: Object.freeze(['mp3', 'wav', 'ogg', 'm4a', 'flac']),
});
/** Extension of a pasted file that has none in its name (a screenshot), from its type. */
const MEDIA_EXTENSION_BY_MIME_TYPE = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/flac': 'flac',
});
/** The name Chromium gives a pasted bitmap (a screenshot): saved as `pasted-<timestamp>` instead. */
const PASTED_IMAGE_NAME_PATTERN = /^image\.[a-z0-9]+$/i;

/** Must run before the app is ready. */
function registerAssetScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/** Serves files of the open vault only; anything else (or outside the vault) answers 404. */
function handleAssetRequests() {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const relativePath = url.pathname
        .split('/')
        .filter(Boolean)
        .map((segment) => decodeURIComponent(segment))
        .join('/');
      const absolutePath = resolveInsideVault(vaultController.getReadyVaultPath(), relativePath);

      return await net.fetch(pathToFileURL(absolutePath).toString());
    } catch (error) {
      console.warn(
        '[electron] Asset request refused ->',
        request.url,
        error instanceof Error ? error.message : error,
      );
      return new Response('Not found', { status: 404 });
    }
  });
}

/** `{ kind, extension }` of a supported media file, from its name or else its type; throws otherwise. */
function getMediaType(fileName, mimeType) {
  const nameExtension = path.posix.extname(fileName).slice(1).toLocaleLowerCase();
  const extension = nameExtension || MEDIA_EXTENSION_BY_MIME_TYPE[mimeType] || '';
  const kind = Object.keys(MEDIA_EXTENSIONS).find((key) =>
    MEDIA_EXTENSIONS[key].includes(extension),
  );
  if (!kind) {
    throw new Error(`Not a supported media file: ${fileName || mimeType || 'unknown'}`);
  }

  return { kind, extension };
}

/** `<campaign>/assets` or `compendium/<system>/assets`: where the assets of a note's scope go. */
function getAssetsFolder(sourcePath) {
  const scope = vaultIndexModel.getCampaignSlug(sourcePath);
  if (!scope) {
    throw new Error(`Not inside a campaign or a compendium system: ${sourcePath}`);
  }

  return { scope, folder: `${scope}/${ASSETS_DIR_NAME}` };
}

/**
 * The link that resolves to a new asset: its file name, or its scope-relative path when another file of
 * the scope has the same name (as the editor's link suggestions do).
 */
function getLinkTarget(scope, relativePath) {
  const fileName = path.posix.basename(relativePath);
  const isNameTaken = vaultIndexModel
    .listScopeFiles(scope)
    .some(
      (file) =>
        file.path !== relativePath &&
        file.name.toLocaleLowerCase() === fileName.toLocaleLowerCase(),
    );
  return isNameTaken ? relativePath.slice(scope.length + 1) : fileName;
}

/**
 * Saves media bytes in the scope's `assets/` as a slug of the original name (`pasted-<timestamp>` for a
 * screenshot), adding `-<timestamp>` when the name is taken; then indexes it so links resolve right away.
 */
async function saveAsset(sourcePath, fileName, mimeType, bytes) {
  if (bytes.byteLength === 0 || bytes.byteLength > ASSET_MAX_BYTES) {
    throw new Error(`Media files must be between 1 byte and ${ASSET_MAX_BYTES / 1024 / 1024} MB.`);
  }

  const vaultPath = vaultController.getReadyVaultPath();
  const { kind, extension } = getMediaType(fileName, mimeType);
  const { scope, folder } = getAssetsFolder(sourcePath);
  const timestamp = formatTimestampForFilename();
  const baseName =
    !fileName || PASTED_IMAGE_NAME_PATTERN.test(fileName)
      ? `pasted-${timestamp}`
      : toSlug(path.posix.basename(fileName, path.posix.extname(fileName))) || `asset-${timestamp}`;

  let result = await documentModel.writeVaultFile(
    vaultPath,
    `${folder}/${baseName}.${extension}`,
    bytes,
  );
  if (result.status === 'exists') {
    result = await documentModel.writeVaultFile(
      vaultPath,
      `${folder}/${baseName}-${timestamp}.${extension}`,
      bytes,
    );
  }
  if (result.status === 'exists') {
    throw new Error(
      `A file named "${path.posix.basename(result.path)}" already exists in ${folder}.`,
    );
  }

  await indexerController.reindexPaths([result.path]);
  return { path: result.path, linkTarget: getLinkTarget(scope, result.path), kind };
}

/** A media file pasted into a note: `{ sourcePath, name, mimeType, bytes }` → the saved asset. */
async function save(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const sourcePath = requireString(body.sourcePath, 'payload.sourcePath');
  const name =
    normalizeOptionalString(body.name, 'payload.name', {
      allowEmpty: true,
      maxLength: ASSET_NAME_MAX_LENGTH,
    }) ?? '';
  const mimeType =
    normalizeOptionalString(body.mimeType, 'payload.mimeType', { allowEmpty: true }) ?? '';
  if (!(body.bytes instanceof Uint8Array)) {
    throw new Error('payload.bytes must be the file content.');
  }

  return saveAsset(sourcePath, name, mimeType, body.bytes);
}

/** Media files picked in the system file dialog, saved as assets of the note's scope (none if cancelled). */
async function importFiles(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const sourcePath = requireString(body.sourcePath, 'payload.sourcePath');
  getAssetsFolder(sourcePath);

  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Media', extensions: Object.values(MEDIA_EXTENSIONS).flat() }],
  });
  if (result.canceled) {
    return { files: [] };
  }

  const files = [];
  for (const filePath of result.filePaths) {
    const { size } = await fs.promises.stat(filePath);
    if (size > ASSET_MAX_BYTES) {
      throw new Error(
        `${path.basename(filePath)} is larger than ${ASSET_MAX_BYTES / 1024 / 1024} MB.`,
      );
    }

    const bytes = await fs.promises.readFile(filePath);
    files.push(await saveAsset(sourcePath, path.basename(filePath), '', bytes));
  }
  return { files };
}

module.exports = {
  handleAssetRequests,
  importFiles,
  registerAssetScheme,
  save,
};
