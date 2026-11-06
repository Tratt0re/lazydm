const fs = require('node:fs');
const path = require('node:path');
const { documentModel, vaultIndexModel } = require('../models');
const fileUtils = require('../utils/file-utils');
const { diffLines, trimContext } = require('../utils/line-diff');
const cloudReadinessController = require('./cloud-readiness.controller');
const documentController = require('./document.controller');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const { ensurePlainObject, requireString } = require('./utils');

/**
 * Repair of the copies a sync client made (`goblin 2.md`, see `findSyncCopies`): what the copy and the original
 * look like side by side, and the three things the user can do. Nothing here runs on its own.
 */

const ACTIONS = Object.freeze(['keep-original', 'keep-both', 'restore-name']);
/** A note longer than this is not diffed or shown: the two sides are compared by size and date only. */
const MAX_TEXT_BYTES = 200 * 1024;
const MARKDOWN_EXTENSION = '.md';

function requireOpenIndex() {
  if (!indexerController.isOpen()) {
    throw new Error('The index is not ready yet.');
  }
}

function isNotePath(relativePath) {
  return path.posix.extname(relativePath).toLocaleLowerCase() === MARKDOWN_EXTENSION;
}

/** Name links use: a note without its extension, any other file with it. */
function linkNameOf(relativePath) {
  return isNotePath(relativePath)
    ? path.posix.basename(relativePath, MARKDOWN_EXTENSION)
    : path.posix.basename(relativePath);
}

/** The copy the scan lists for this path. Only listed files can be repaired: no other path is ever touched. */
function requireListedCopy(copyPath) {
  const copy = cloudReadinessController.listSyncCopies().find((item) => item.path === copyPath);
  if (!copy) {
    throw new Error('This file is no longer listed as a copy made by sync.');
  }

  return copy;
}

async function readSide(vaultPath, relativePath, { withText }) {
  const absolutePath = fileUtils.resolveInsideVault(vaultPath, relativePath);
  let stats;
  try {
    stats = await fs.promises.stat(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const buffer = await fs.promises.readFile(absolutePath);
  return {
    path: relativePath,
    size: stats.size,
    mtimeMs: Math.trunc(stats.mtimeMs),
    hash: fileUtils.hashContent(buffer),
    linkCount: vaultIndexModel.listIncomingLinks(relativePath).length,
    text: withText && stats.size <= MAX_TEXT_BYTES ? buffer.toString('utf8') : null,
  };
}

/**
 * Copy and original side by side. Notes get a line diff (changed lines with a little context around them); other
 * files only their size and date, since there is nothing to read. `actions` are the ones that make sense now.
 */
async function compare(payload) {
  const body = ensurePlainObject(payload, 'payload');
  requireOpenIndex();
  const copy = requireListedCopy(requireString(body.path, 'payload.path'));
  const vaultPath = vaultController.getReadyVaultPath();
  const isNote = isNotePath(copy.path);
  const copySide = await readSide(vaultPath, copy.path, { withText: isNote });
  if (!copySide) {
    throw new Error(`Not found: ${copy.path}`);
  }

  const originalSide = await readSide(vaultPath, copy.originalPath, { withText: isNote });
  const isIdentical = originalSide !== null && originalSide.hash === copySide.hash;
  const canDiff = isNote && originalSide?.text != null && copySide.text != null;
  const ops = canDiff ? diffLines(originalSide.text, copySide.text) : null;
  const diff = ops ? trimContext(ops) : null;

  return {
    path: copy.path,
    originalPath: copy.originalPath,
    kind: copy.kind,
    isNote,
    isIdentical,
    // Texts are only sent when the diff table is not available, so the two can be read apart.
    copy: { ...copySide, text: diff ? null : copySide.text },
    original: originalSide ? { ...originalSide, text: diff ? null : originalSide.text } : null,
    diff,
    actions: originalSide ? ['keep-original', 'keep-both'] : ['restore-name', 'keep-both'],
  };
}

/** `goblin-copy.md`, then `goblin-copy-2.md`…: the first free name next to the original's. */
function freeCopyPath(vaultPath, originalPath) {
  const extension = path.posix.extname(originalPath);
  const directory = path.posix.dirname(originalPath);
  const base = path.posix.basename(originalPath, extension);
  for (let counter = 1; counter < 1000; counter += 1) {
    const suffix = counter === 1 ? '-copy' : `-copy-${counter}`;
    const candidate = path.posix.join(directory, `${base}${suffix}${extension}`);
    if (!fs.existsSync(fileUtils.resolveInsideVault(vaultPath, candidate))) {
      return candidate;
    }
  }

  throw new Error(`No free name next to ${originalPath}.`);
}

async function moveCopy(vaultPath, fromPath, toPath) {
  if (isNotePath(fromPath)) {
    await documentModel.renameDocumentFile(vaultPath, fromPath, toPath);
  } else {
    await documentModel.moveVaultFile(vaultPath, fromPath, toPath);
  }
}

/**
 * - `keep-original`: links to the copy now point at the original, the copy goes to the Trash.
 * - `keep-both`: the copy is renamed to `<original>-copy`, links to it follow; nothing is deleted.
 * - `restore-name`: the original is gone, so the copy takes its name and the links that waited for it resolve.
 *
 * Both files must still be exactly what `compare` showed (`copyHash`, `originalHash`). Every note rewrite is
 * conflict-checked like a save: notes changed meanwhile are reported in `failedPaths`, not overwritten.
 */
async function resolve(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const action = requireString(body.action, 'payload.action');
  if (!ACTIONS.includes(action)) {
    throw new Error('Not a repair action.');
  }

  requireOpenIndex();
  const copy = requireListedCopy(requireString(body.path, 'payload.path'));
  const vaultPath = vaultController.getReadyVaultPath();
  const copySide = await readSide(vaultPath, copy.path, { withText: false });
  const originalSide = await readSide(vaultPath, copy.originalPath, { withText: false });
  if (
    !copySide ||
    copySide.hash !== body.copyHash ||
    (originalSide?.hash ?? null) !== (body.originalHash ?? null)
  ) {
    throw new Error('The files changed since you looked at them. Look at them again.');
  }

  if (action === 'keep-original' && !originalSide) {
    throw new Error('The original is gone: restore the name of the copy instead.');
  }

  if (action === 'restore-name' && originalSide) {
    throw new Error('The original is back: keep one of the two instead.');
  }

  const oldName = linkNameOf(copy.path);
  const rawsBySource = documentController.groupRawsBySource(
    vaultIndexModel.listIncomingLinks(copy.path),
  );
  const rewriteTo = (newName) => (content, sourcePath, raws) =>
    documentController.rewriteRenamedLinks(content, sourcePath, raws, oldName, newName);

  let keptPath = copy.originalPath;
  let isMoved = false;
  let isTrashed = false;
  let result = { updatedPaths: [], failedPaths: [], linkCount: 0 };
  let mapPaths = [];
  try {
    if (action === 'keep-original') {
      result = await documentController.rewriteIncomingLinks(
        vaultPath,
        rawsBySource,
        copy.path,
        rewriteTo(linkNameOf(copy.originalPath)),
      );
      mapPaths = isNotePath(copy.path)
        ? []
        : await documentController.rewriteMapImages(vaultPath, copy.path, copy.originalPath);
      await fileUtils.trashVaultItem(fileUtils.resolveInsideVault(vaultPath, copy.path));
      isTrashed = true;
    } else {
      keptPath =
        action === 'restore-name' ? copy.originalPath : freeCopyPath(vaultPath, copy.originalPath);
      await moveCopy(vaultPath, copy.path, keptPath);
      isMoved = true;
      result = await documentController.rewriteIncomingLinks(
        vaultPath,
        rawsBySource,
        copy.path,
        rewriteTo(linkNameOf(keptPath)),
      );
      mapPaths = isNotePath(copy.path)
        ? []
        : await documentController.rewriteMapImages(vaultPath, copy.path, keptPath);
    }
  } finally {
    // The disk may have changed even when a later step threw: the index must follow it.
    await indexerController.reindexPaths([
      ...(isMoved || isTrashed ? [copy.path] : []),
      keptPath,
      ...result.updatedPaths,
      ...mapPaths,
    ]);
  }

  return { path: keptPath, ...result };
}

module.exports = {
  compare,
  resolve,
};
