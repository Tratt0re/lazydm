const fs = require('node:fs');
const path = require('node:path');
const { dialog, net, protocol } = require('electron');
const { pathToFileURL } = require('node:url');
const { formatTimestampForFilename, resolveInsideVault } = require('../utils/file-utils');
const { toSlug } = require('../utils/string-sanitize');
const { documentModel, sectionModel, vaultIndexModel } = require('../models');
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

/** Whether `fileName` has a media extension (image, PDF, audio): the only files the app hands to the system. */
function isMediaFileName(fileName) {
  const extension = path.posix.extname(fileName).slice(1).toLocaleLowerCase();
  return Object.values(MEDIA_EXTENSIONS).some((extensions) => extensions.includes(extension));
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
 * Where media files of a request go: `folder` (the Assets section of a scope or one of its sub-folders, from
 * the section page) or else the assets of the note `sourcePath` is (a paste, *Import file…* in the editor).
 */
function resolveAssetTarget(body) {
  if (body.folder === undefined) {
    return getAssetsFolder(requireString(body.sourcePath, 'payload.sourcePath'));
  }

  const folder = requireString(body.folder, 'payload.folder').replace(/\/+$/, '');
  const location = sectionModel.parseSectionFolder(folder);
  if (!location || location.section !== ASSETS_DIR_NAME) {
    throw new Error(`Not the Assets section or one of its sub-folders: ${folder}`);
  }

  return { scope: location.scope, folder };
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
 * An asset of the scope with exactly these bytes (same size first, then same content), or null. Without the
 * index nothing can be compared, so nothing is found.
 */
async function findIdenticalAsset(vaultPath, scope, bytes) {
  if (!indexerController.isOpen()) {
    return null;
  }

  const content = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const candidatePath of vaultIndexModel.listScopeAssetsOfSize(scope, bytes.byteLength)) {
    try {
      const candidate = await fs.promises.readFile(resolveInsideVault(vaultPath, candidatePath));
      if (candidate.equals(content)) {
        return candidatePath;
      }
    } catch (_) {
      // gone or unreadable meanwhile: not a match
    }
  }
  return null;
}

/**
 * Saves media bytes in the scope's `assets/` as a slug of the original name (`pasted-<timestamp>` for a
 * screenshot), adding `-<timestamp>` when the name is taken; then indexes it so links resolve right away. A file
 * identical to an asset already in the scope is not saved again: that asset is returned (`isReused`).
 */
async function saveAsset(target, fileName, mimeType, bytes) {
  if (bytes.byteLength === 0 || bytes.byteLength > ASSET_MAX_BYTES) {
    throw new Error(`Media files must be between 1 byte and ${ASSET_MAX_BYTES / 1024 / 1024} MB.`);
  }

  const vaultPath = vaultController.getReadyVaultPath();
  const { kind, extension } = getMediaType(fileName, mimeType);
  const { scope, folder } = target;
  const identicalPath = await findIdenticalAsset(vaultPath, scope, bytes);
  if (identicalPath) {
    return {
      path: identicalPath,
      linkTarget: getLinkTarget(scope, identicalPath),
      kind,
      isReused: true,
    };
  }

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
  return {
    path: result.path,
    linkTarget: getLinkTarget(scope, result.path),
    kind,
    isReused: false,
  };
}

/**
 * A media file pasted into a note or dropped on the Assets section: `{ sourcePath | folder, name, mimeType,
 * bytes }` → the saved asset.
 */
async function save(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const target = resolveAssetTarget(body);
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

  return saveAsset(target, name, mimeType, body.bytes);
}

/**
 * Media files picked in the system file dialog, saved in the request's target (see `resolveAssetTarget`);
 * none if cancelled.
 */
async function importFiles(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const target = resolveAssetTarget(body);

  // A map picks one image: the dialog offers images only and takes a single file.
  const isImageOnly = body.imageOnly === true;
  const result = await dialog.showOpenDialog({
    properties: isImageOnly ? ['openFile'] : ['openFile', 'multiSelections'],
    filters: [
      isImageOnly
        ? { name: 'Images', extensions: [...MEDIA_EXTENSIONS.image] }
        : { name: 'Media', extensions: Object.values(MEDIA_EXTENSIONS).flat() },
    ],
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
    files.push(await saveAsset(target, path.basename(filePath), '', bytes));
  }
  return { files };
}

module.exports = {
  handleAssetRequests,
  importFiles,
  isMediaFileName,
  registerAssetScheme,
  save,
};
