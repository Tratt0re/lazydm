const fs = require('node:fs');
const path = require('node:path');
const { shell } = require('electron');
const { resolveInsideVault } = require('../utils/file-utils');
const {
  campaignModel,
  compendiumModel,
  documentModel,
  encounterModel,
  mapModel,
  sectionModel,
  vaultIndexModel,
  vaultModel,
} = require('../models');
const {
  getLinkPlainText,
  parseMarkdownDocument,
  renameLinkFolder,
  renameLinkTarget,
  replaceDocumentTitle,
  rewriteLinks,
} = require('../utils/markdown-parse');
const { toSlug } = require('../utils/string-sanitize');
const { isMediaFileName } = require('./asset.controller');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const {
  ensurePlainObject,
  normalizeEnum,
  normalizeOptionalBooleanFlag,
  normalizeOptionalString,
  requireString,
} = require('./utils');

const DOCUMENT_TITLE_MAX_LENGTH = 120;
const DOCUMENT_TYPE_MAX_LENGTH = 40;
const MARKDOWN_EXTENSION = '.md';
const BACKLINKS_MAX_ROWS = 300;
const BACKLINK_SNIPPET_MAX_LENGTH = 240;

function requirePath(body, key = 'path') {
  return requireString(body[key], `payload.${key}`);
}

function requireContent(body) {
  return requireString(body.content, 'payload.content', { trim: false, allowEmpty: true });
}

/**
 * Files of a folder (and of its sub-folders, unless `direct`) from the index — empty while it is not open
 * yet — and its sub-folders from the disk (an empty one exists before its first file), with file counts.
 */
async function list(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const folder = requirePath(body, 'folder');
  const isDirect = normalizeOptionalBooleanFlag(body.direct, 'payload.direct') ?? false;
  const prefix = `${folder.replace(/\/+$/, '')}/`;
  const files = indexerController.isOpen() ? vaultIndexModel.listFolderFiles(folder) : [];
  const subfolders = await documentModel.listSubfolders(
    vaultController.getReadyVaultPath(),
    folder,
  );

  return {
    rows: isDirect ? files.filter((file) => !file.path.slice(prefix.length).includes('/')) : files,
    folders: subfolders.map((name) => ({
      name,
      fileCount: files.filter((file) => file.path.startsWith(`${prefix}${name}/`)).length,
    })),
  };
}

const FOLDER_NAME_MAX_LENGTH = 60;

/** New sub-folder of a section: one level deep, in a section that holds notes. */
async function createFolder(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const folder = requirePath(body, 'folder');
  const name = requireString(body.name, 'payload.name', { maxLength: FOLDER_NAME_MAX_LENGTH });
  const location = sectionModel.parseSectionFolder(folder);
  if (!location || location.subfolder !== null) {
    throw new Error('Sub-folders can only be created directly inside a section.');
  }

  const vaultPath = vaultController.getReadyVaultPath();
  await requireCopyTarget(vaultPath, location.scope);
  const section = sectionModel
    .listScopeSections(vaultPath, location.scope)
    .find((item) => item.key === location.section);
  if (!section) {
    throw new Error(`Not a section: ${folder}`);
  }
  if (!section.type && !section.isSpecial) {
    throw new Error(`The ${section.key} folder has no sub-folders.`);
  }

  const slug = toSlug(name);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  return {
    path: await documentModel.createFolder(vaultPath, `${location.scope}/${section.key}/${slug}`),
    name: slug,
  };
}

/** Relative markdown link from a folder to a vault file, `#heading` of the old link kept. */
function toMarkdownHref(fromDir, targetPath, oldRaw) {
  const hashIndex = oldRaw.indexOf('#');
  const suffix = hashIndex < 0 ? '' : oldRaw.slice(hashIndex);
  const relative = path.posix.relative(fromDir, targetPath);
  return `${encodeURI(relative).replace(/\(/g, '%28').replace(/\)/g, '%29')}${suffix}`;
}

/**
 * New raw target of a link to a moved note: markdown links get the new relative path, wikilinks written as
 * a path get the new scope-relative path (`.md`, `#heading`, `|alias` kept). Bare names stay: they resolve
 * wherever the note is.
 */
function retargetMovedLink(link, sourcePath, newPath, scope) {
  if (link.syntax === 'markdown') {
    return toMarkdownHref(path.posix.dirname(sourcePath), newPath, link.raw);
  }

  const pipeIndex = link.raw.indexOf('|');
  const target = pipeIndex < 0 ? link.raw : link.raw.slice(0, pipeIndex);
  const hashIndex = target.indexOf('#');
  const linkPath = hashIndex < 0 ? target : target.slice(0, hashIndex);
  if (!linkPath.includes('/')) {
    return null;
  }

  const scopeRelative = newPath.slice(scope.length + 1);
  const isNote = newPath.toLocaleLowerCase().endsWith(MARKDOWN_EXTENSION);
  const hasExtension = linkPath.trim().toLocaleLowerCase().endsWith(MARKDOWN_EXTENSION);
  // Notes are linked with or without `.md`; other files always by their full file name.
  const newLinkPath =
    !isNote || hasExtension ? scopeRelative : scopeRelative.slice(0, -MARKDOWN_EXTENSION.length);
  return `${newLinkPath}${link.raw.slice(linkPath.length)}`;
}

/**
 * Moves a note file and recomputes its own relative links from the new folder. The rewrite is
 * conflict-checked like a save; returns false when it was not saved (the file moved but kept its old links).
 */
async function moveNoteFile(vaultPath, relativePath, newPath) {
  const current = await documentModel.readDocument(vaultPath, relativePath);
  const resolvedByRaw = new Map(
    vaultIndexModel
      .listOutgoingLinks(relativePath)
      .filter((link) => link.resolvedPath)
      .map((link) => [link.raw, link.resolvedPath === relativePath ? newPath : link.resolvedPath]),
  );
  const ownContent = rewriteLinks(
    current.content,
    (link) =>
      link.syntax === 'markdown' && resolvedByRaw.has(link.raw)
        ? toMarkdownHref(path.posix.dirname(newPath), resolvedByRaw.get(link.raw), link.raw)
        : null,
    { sourcePath: relativePath },
  ).content;

  await documentModel.renameDocumentFile(vaultPath, relativePath, newPath);
  if (ownContent === current.content) {
    return true;
  }

  const result = await documentModel.writeDocument(
    vaultPath,
    newPath,
    ownContent,
    current.contentHash,
  );
  return result.status === 'saved';
}

/**
 * Moves a file (note or asset) into a section (or sub-folder) of its own campaign or system: it keeps its
 * name; a note's own relative links are recomputed; every
 * link the index resolved to it is rewritten like *Rename* does (each write conflict-checked; failures reported).
 */
async function move(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const folder = requirePath(body, 'folder').replace(/\/+$/, '');
  requireIndexOpen();

  const vaultPath = vaultController.getReadyVaultPath();
  const location = sectionModel.parseSectionFolder(folder);
  const scope = vaultIndexModel.getCampaignSlug(relativePath);
  if (!location || location.scope !== scope) {
    throw new Error('A note can only move to a section of its own campaign or system.');
  }

  const section = sectionModel
    .listScopeSections(vaultPath, scope)
    .find((item) => item.key === location.section);
  if (!section || (!section.type && !section.isSpecial)) {
    throw new Error(`Not a section folder: ${folder}`);
  }

  const newPath = `${folder}/${path.posix.basename(relativePath)}`;
  if (newPath === relativePath) {
    return { path: newPath, updatedPaths: [], failedPaths: [], linkCount: 0 };
  }

  const isNote = relativePath.toLocaleLowerCase().endsWith(MARKDOWN_EXTENSION);
  const rawsBySource = groupRawsBySource(vaultIndexModel.listIncomingLinks(relativePath));
  const updatedPaths = [];
  const failedPaths = [];
  let linkCount = 0;
  let isMoved = false;
  try {
    if (isNote) {
      const isOwnContentSaved = await moveNoteFile(vaultPath, relativePath, newPath);
      isMoved = true;
      if (!isOwnContentSaved) {
        failedPaths.push(newPath);
      }
    } else {
      await documentModel.moveVaultFile(vaultPath, relativePath, newPath);
      isMoved = true;
      updatedPaths.push(...(await rewriteMapImages(vaultPath, relativePath, newPath)));
    }

    await rewriteMovedLinks();
  } finally {
    // The file may have moved even when a later step threw: the index must follow what is on disk.
    await indexerController.reindexPaths(
      isMoved ? [relativePath, newPath, ...updatedPaths] : [relativePath],
    );
  }

  return { path: newPath, updatedPaths, failedPaths, linkCount };

  async function rewriteMovedLinks() {
    for (const [sourcePath, raws] of rawsBySource) {
      if (sourcePath === relativePath) {
        continue;
      }

      try {
        const source = await documentModel.readDocument(vaultPath, sourcePath);
        const rewritten = rewriteLinks(
          source.content,
          (link) =>
            raws.has(link.raw) ? retargetMovedLink(link, sourcePath, newPath, scope) : null,
          { sourcePath },
        );
        if (rewritten.count === 0) {
          continue;
        }

        const result = await documentModel.writeDocument(
          vaultPath,
          sourcePath,
          rewritten.content,
          source.contentHash,
        );
        if (result.status === 'saved') {
          updatedPaths.push(sourcePath);
          linkCount += rewritten.count;
        } else {
          failedPaths.push(sourcePath);
        }
      } catch (error) {
        console.warn('[electron] Failed to update links ->', sourcePath, error);
        failedPaths.push(sourcePath);
      }
    }
  }
}

/** Shows a vault file or folder in the system file manager (Finder, Explorer…). */
function reveal(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const absolutePath = resolveInsideVault(vaultController.getReadyVaultPath(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Not found: ${relativePath}`);
  }

  shell.showItemInFolder(absolutePath);
  return { path: relativePath };
}

/**
 * Opens a vault file in the system's default app (a PDF in its viewer). Throws the system's message when no
 * app can open it, so the page can offer *Reveal* instead.
 */
async function openFile(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const absolutePath = resolveInsideVault(vaultController.getReadyVaultPath(), relativePath);
  if (!isMediaFileName(absolutePath)) {
    throw new Error(`Only images, PDFs and audio can be opened: ${relativePath}`);
  }

  // lstat, so a symlink to something else is not followed.
  const stats = fs.existsSync(absolutePath) ? fs.lstatSync(absolutePath) : null;
  if (!stats?.isFile()) {
    throw new Error(`Not found: ${relativePath}`);
  }

  const errorMessage = await shell.openPath(absolutePath);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
  return { path: relativePath };
}

async function read(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const document = await documentModel.readDocument(
    vaultController.getReadyVaultPath(),
    relativePath,
  );

  return {
    ...document,
    links: indexerController.isOpen() ? vaultIndexModel.listOutgoingLinks(relativePath) : [],
  };
}

function write(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const expectedHash =
    normalizeOptionalString(body.expectedHash, 'payload.expectedHash', { allowNull: true }) ?? null;

  return documentModel.writeDocument(
    vaultController.getReadyVaultPath(),
    requirePath(body),
    requireContent(body),
    expectedHash,
  );
}

function saveCopy(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return documentModel.saveDocumentCopy(
    vaultController.getReadyVaultPath(),
    requirePath(body),
    requireContent(body),
  );
}

function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const folderPath = requirePath(body, 'folder');
  const title = requireString(body.title, 'payload.title', {
    maxLength: DOCUMENT_TITLE_MAX_LENGTH,
  });
  const type = toSlug(
    requireString(body.type, 'payload.type', { maxLength: DOCUMENT_TYPE_MAX_LENGTH }),
  );

  const slug = toSlug(title);
  if (slug.length === 0) {
    throw new Error('payload.title must contain at least one letter or number.');
  }

  const section =
    normalizeOptionalString(body.section, 'payload.section', { allowNull: true }) ?? null;
  return documentModel.createDocument(vaultController.getReadyVaultPath(), {
    folderPath,
    slug,
    title,
    type,
    section,
  });
}

function requireIndexOpen() {
  if (!indexerController.isOpen()) {
    throw new Error('The vault index is not ready yet.');
  }
}

function getNoteName(relativePath) {
  return path.posix.basename(relativePath, MARKDOWN_EXTENSION);
}

/** Raw link targets per source note, so a rewrite only touches links the index resolved to the note. */
function groupRawsBySource(links) {
  const rawsBySource = new Map();
  for (const link of links) {
    if (!rawsBySource.has(link.sourcePath)) {
      rawsBySource.set(link.sourcePath, new Set());
    }

    rawsBySource.get(link.sourcePath).add(link.raw);
  }

  return rawsBySource;
}

function rewriteRenamedLinks(content, sourcePath, raws, oldName, newName) {
  return rewriteLinks(
    content,
    (link) => (raws?.has(link.raw) ? renameLinkTarget(link, oldName, newName) : null),
    { sourcePath },
  );
}

/**
 * Link panel data of a note: the notes linking to it (each with the text of the line holding the link),
 * the files it links to, and its own links that resolve to nothing.
 */
async function links(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  if (!indexerController.isOpen()) {
    return { backlinks: [], outgoingLinks: [], brokenLinks: [] };
  }

  const vaultPath = vaultController.getReadyVaultPath();
  const incomingLinks = vaultIndexModel
    .listIncomingLinks(relativePath)
    .filter((link) => link.sourcePath !== relativePath)
    .slice(0, BACKLINKS_MAX_ROWS);
  const outgoing = vaultIndexModel.listOutgoingLinks(relativePath);
  const linesBySource = new Map();

  for (const sourcePath of new Set(incomingLinks.map((link) => link.sourcePath))) {
    try {
      const document = await documentModel.readDocument(vaultPath, sourcePath);
      linesBySource.set(sourcePath, document.content.replace(/\r\n?/g, '\n').split('\n'));
    } catch (_) {
      linesBySource.set(sourcePath, []);
    }
  }

  return {
    backlinks: incomingLinks.map((link) => ({
      ...link,
      snippet: (linesBySource.get(link.sourcePath)[link.line - 1] ?? '')
        .trim()
        .slice(0, BACKLINK_SNIPPET_MAX_LENGTH),
    })),
    outgoingLinks: outgoing.filter(
      (link) => link.resolvedPath !== null && link.resolvedPath !== relativePath,
    ),
    brokenLinks: outgoing.filter((link) => link.resolvedPath === null && link.targetName !== ''),
  };
}

/** Files the note's links can resolve to (its own campaign or system only): the editor's link suggestions. */
function linkTargets(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const sourcePath = requirePath(body, 'sourcePath');
  if (!indexerController.isOpen()) {
    return { rows: [] };
  }

  const scope = vaultIndexModel.getCampaignSlug(sourcePath);
  return {
    // The party roster is hidden from the lists, so it is not offered as a link either.
    rows: vaultIndexModel
      .listScopeFiles(scope)
      .filter(
        (file) =>
          file.path !== sourcePath &&
          !file.path.endsWith(`/encounters/${encounterModel.PARTY_FILE_NAME}`),
      ),
  };
}

/** Unresolved links written in the notes of a campaign. */
function brokenLinks(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const scope = requireString(body.campaign, 'payload.campaign');
  const [rootDir, systemDir, ...rest] = scope.split('/');
  const isSystem =
    rootDir === compendiumModel.COMPENDIUM_DIR_NAME &&
    rest.length === 0 &&
    Boolean(systemDir) &&
    compendiumModel.isSystemDirName(systemDir);
  if (!isSystem && (scope.includes('/') || !vaultModel.isCampaignDirName(scope))) {
    throw new Error(`payload.campaign is not a campaign or compendium system: ${scope}`);
  }

  return { rows: indexerController.isOpen() ? vaultIndexModel.listBrokenLinks(scope) : [] };
}

/**
 * Renames a note: new title → new kebab-case file name in the same folder, `title:` and the matching
 * `# Heading` updated. With `updateLinks`, links resolving to the note are rewritten in every note
 * (each write is conflict-checked like a normal save; notes changed meanwhile are reported, not overwritten).
 */
async function rename(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const title = requireString(body.title, 'payload.title', {
    maxLength: DOCUMENT_TITLE_MAX_LENGTH,
  });
  const updateLinks = normalizeOptionalBooleanFlag(body.updateLinks, 'payload.updateLinks') !== 0;

  const slug = toSlug(title);
  if (slug.length === 0) {
    throw new Error('payload.title must contain at least one letter or number.');
  }

  requireIndexOpen();
  const vaultPath = vaultController.getReadyVaultPath();
  const current = await documentModel.readDocument(vaultPath, relativePath);
  const newPath = path.posix.join(path.posix.dirname(relativePath), `${slug}${MARKDOWN_EXTENSION}`);
  const oldName = getNoteName(relativePath);
  const isNameChanged = oldName !== slug;
  const rawsBySource = groupRawsBySource(vaultIndexModel.listIncomingLinks(relativePath));

  let isRenamed = false;
  const ownFailedPaths = [];
  let updatedPaths = [];
  let failedPaths = [];
  let linkCount = 0;
  try {
    let ownContent = replaceDocumentTitle(current.content, current.title, title);
    if (isNameChanged) {
      ownContent = rewriteRenamedLinks(
        ownContent,
        relativePath,
        rawsBySource.get(relativePath),
        oldName,
        slug,
      ).content;
      await documentModel.renameDocumentFile(vaultPath, relativePath, newPath);
      isRenamed = true;
    }

    if (ownContent !== current.content) {
      const result = await documentModel.writeDocument(
        vaultPath,
        newPath,
        ownContent,
        current.contentHash,
      );
      if (result.status !== 'saved') {
        ownFailedPaths.push(newPath);
      }
    }

    ({ updatedPaths, failedPaths, linkCount } =
      updateLinks && isNameChanged
        ? await rewriteIncomingLinks(
            vaultPath,
            rawsBySource,
            relativePath,
            (content, sourcePath, raws) =>
              rewriteRenamedLinks(content, sourcePath, raws, oldName, slug),
          )
        : { updatedPaths: [], failedPaths: [], linkCount: 0 });
  } finally {
    // The file may have been renamed even when a later step threw: the index must follow the disk.
    await indexerController.reindexPaths(
      isRenamed ? [relativePath, newPath, ...updatedPaths] : [relativePath],
    );
  }

  return {
    path: newPath,
    updatedPaths,
    failedPaths: [...ownFailedPaths, ...failedPaths],
    linkCount,
  };
}

/**
 * Rewrites the links the index resolved to a file in every note linking to it (`rewrite` returns
 * `{ content, count }` for a note's content and its raw links to the file). `skipPath` (the file itself) is
 * left out. Each write is conflict-checked like a save: notes changed meanwhile are reported, not overwritten.
 */
async function rewriteIncomingLinks(vaultPath, rawsBySource, skipPath, rewrite) {
  const updatedPaths = [];
  const failedPaths = [];
  let linkCount = 0;

  for (const [sourcePath, raws] of rawsBySource) {
    if (sourcePath === skipPath) {
      continue;
    }

    try {
      const source = await documentModel.readDocument(vaultPath, sourcePath);
      const rewritten = rewrite(source.content, sourcePath, raws);
      if (rewritten.count === 0) {
        continue;
      }

      const result = await documentModel.writeDocument(
        vaultPath,
        sourcePath,
        rewritten.content,
        source.contentHash,
      );
      if (result.status === 'saved') {
        updatedPaths.push(sourcePath);
        linkCount += rewritten.count;
      } else {
        failedPaths.push(sourcePath);
      }
    } catch (error) {
      console.warn('[electron] Failed to update links ->', sourcePath, error);
      failedPaths.push(sourcePath);
    }
  }

  return { updatedPaths, failedPaths, linkCount };
}

/**
 * Renames a sub-folder of a section: the folder on disk and the path links through it
 * (`[[enemies/humans/bandit]]`, `../enemies/humans/bandit.md`) — the rewrite the `monsters/` → `enemies/`
 * migration does for sections. A taken name is refused; every write is conflict-checked like a save.
 */
async function renameFolder(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const folderPath = requirePath(body, 'folder').replace(/\/+$/, '');
  const name = requireString(body.name, 'payload.name', { maxLength: FOLDER_NAME_MAX_LENGTH });
  const location = sectionModel.parseSectionFolder(folderPath);
  if (!location?.subfolder) {
    throw new Error(`Not a sub-folder of a section: ${folderPath}`);
  }

  const slug = toSlug(name);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  requireIndexOpen();
  const vaultPath = vaultController.getReadyVaultPath();
  const sectionPath = `${location.scope}/${location.section}`;
  const newFolderPath = `${sectionPath}/${slug}`;
  if (newFolderPath === folderPath) {
    return {
      path: folderPath,
      name: slug,
      moved: [],
      updatedPaths: [],
      failedPaths: [],
      linkCount: 0,
    };
  }

  const prefix = `${folderPath}/`;
  const toNewPath = (filePath) =>
    filePath.startsWith(prefix) ? `${newFolderPath}/${filePath.slice(prefix.length)}` : filePath;
  const files = vaultIndexModel
    .listScopeFiles(location.scope)
    .filter((file) => file.path.startsWith(prefix));
  // Notes inside the folder move with it: their links are rewritten at their new path.
  const rawsBySource = new Map(
    [
      ...groupRawsBySource(files.flatMap((file) => vaultIndexModel.listIncomingLinks(file.path))),
    ].map(([sourcePath, raws]) => [toNewPath(sourcePath), raws]),
  );

  await documentModel.moveVaultFolder(vaultPath, folderPath, newFolderPath);

  const moved = files.map((file) => ({ from: file.path, to: toNewPath(file.path) }));
  let links = { updatedPaths: [], failedPaths: [], linkCount: 0 };
  try {
    const parents = new Set(['', location.section, sectionPath]);
    links = await rewriteIncomingLinks(vaultPath, rawsBySource, null, (content, sourcePath, raws) =>
      rewriteLinks(
        content,
        (link) =>
          raws?.has(link.raw) ? renameLinkFolder(link, location.subfolder, slug, parents) : null,
        { sourcePath },
      ),
    );
  } finally {
    // The folder has moved even when a later step threw: the index must follow the disk.
    await indexerController.reindexPaths([
      ...moved.flatMap((move) => [move.from, move.to]),
      ...links.updatedPaths,
    ]);
  }

  return {
    path: newFolderPath,
    name: slug,
    moved,
    updatedPaths: links.updatedPaths,
    failedPaths: links.failedPaths,
    linkCount: links.linkCount,
  };
}

/** What a link to a deleted file becomes: its plain text, or nothing for an embedded asset. */
function getDeletedLinkText(link, isNote) {
  return !isNote && link.kind === 'embed' ? '' : getLinkPlainText(link);
}

/**
 * Rewrites the links from notes outside a deleted folder (`prefix`, its own notes go with it) to the files in
 * it: a note's links become plain text, an asset's embeds are removed (see {@link getDeletedLinkText}).
 */
async function rewriteLinksToDeletedFiles(vaultPath, files, prefix) {
  const isNoteByRawBySource = new Map();
  for (const file of files) {
    for (const link of vaultIndexModel.listIncomingLinks(file.path)) {
      if (!link.sourcePath.startsWith(prefix)) {
        if (!isNoteByRawBySource.has(link.sourcePath)) {
          isNoteByRawBySource.set(link.sourcePath, new Map());
        }
        isNoteByRawBySource.get(link.sourcePath).set(link.raw, file.kind === 'md');
      }
    }
  }

  const rawsBySource = new Map(
    [...isNoteByRawBySource].map(([sourcePath, isNoteByRaw]) => [
      sourcePath,
      new Set(isNoteByRaw.keys()),
    ]),
  );
  return rewriteIncomingLinks(vaultPath, rawsBySource, null, (content, sourcePath) => {
    const isNoteByRaw = isNoteByRawBySource.get(sourcePath);
    return rewriteLinks(
      content,
      (link) =>
        isNoteByRaw.has(link.raw)
          ? { text: getDeletedLinkText(link, isNoteByRaw.get(link.raw)) }
          : null,
      { sourcePath },
    );
  });
}

const FOLDER_DELETE_MODES = new Set(['delete', 'moveToMain']);

/**
 * A folder the Review page lists and the user may delete: in a campaign, a folder that is not one of its
 * sections; in a campaign or a system, a folder deeper than one sub-folder of a note section. Real sections,
 * special sections and hidden / `_` folders are never stray.
 */
function isStrayFolder(vaultPath, folderPath) {
  const scope = vaultIndexModel.getCampaignSlug(folderPath);
  if (!scope || !folderPath.startsWith(`${scope}/`)) {
    return false;
  }

  const segments = folderPath.slice(scope.length + 1).split('/');
  if (segments.some((segment) => segment.length === 0 || /^[._]/.test(segment))) {
    return false;
  }

  const section = sectionModel
    .listScopeSections(vaultPath, scope)
    .find((item) => item.key === segments[0]);
  if (segments.length === 1) {
    return !scope.includes('/') && !section;
  }

  return !!section?.type && !section.isSpecial && segments.length > 2;
}

/**
 * Deletes a sub-folder of a section; the folder goes to the system Trash. `mode`:
 * - `delete`: its files go with it; with `rewriteLinks` the links from notes outside it are handled like a
 *   file delete (plain text, embeds removed);
 * - `moveToMain`: its files first move to the section's main folder like *Move to…* (links rewritten). A file whose name is taken there stops everything: `{ status: 'clashes', clashes }`.
 */
async function deleteFolder(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const folderPath = requirePath(body, 'folder').replace(/\/+$/, '');
  const mode = normalizeEnum(body.mode, 'payload.mode', FOLDER_DELETE_MODES);
  const rewriteLinksToText =
    normalizeOptionalBooleanFlag(body.rewriteLinks, 'payload.rewriteLinks') !== 0;
  const location = sectionModel.parseSectionFolder(folderPath);
  if (!location?.subfolder) {
    throw new Error(`Not a sub-folder of a section: ${folderPath}`);
  }

  requireIndexOpen();
  const vaultPath = vaultController.getReadyVaultPath();
  const absolutePath = resolveInsideVault(vaultPath, folderPath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`Not a folder: ${folderPath}`);
  }

  const prefix = `${folderPath}/`;
  const sectionPath = `${location.scope}/${location.section}`;
  const files = vaultIndexModel
    .listScopeFiles(location.scope)
    .filter((file) => file.path.startsWith(prefix));
  const moved = [];
  const updatedPaths = new Set();
  const failedPaths = new Set();
  let linkCount = 0;
  let isTrashed = false;

  try {
    if (mode === 'moveToMain') {
      const names = files.map((file) => path.posix.basename(file.path));
      const clashes = names.filter(
        (name, index) =>
          names.indexOf(name) !== index ||
          fs.existsSync(resolveInsideVault(vaultPath, `${sectionPath}/${name}`)),
      );
      if (clashes.length > 0) {
        return { status: 'clashes', clashes: [...new Set(clashes)] };
      }

      // One by one, like *Move to…*: each move re-indexes, so links between these files stay right too.
      // A failure stops here, before the folder goes to the Trash: what already moved stays moved (and indexed).
      for (const file of files) {
        const result = await move({ path: file.path, folder: sectionPath });
        moved.push({ from: file.path, to: result.path });
        result.updatedPaths.forEach((item) => updatedPaths.add(item));
        result.failedPaths.forEach((item) => failedPaths.add(item));
        linkCount += result.linkCount;
      }
    }

    // The Trash comes first: if it fails nothing was rewritten, and the links are rewritten from the index.
    await shell.trashItem(absolutePath);
    isTrashed = true;
    if (mode !== 'moveToMain' && rewriteLinksToText) {
      const result = await rewriteLinksToDeletedFiles(vaultPath, files, prefix);
      result.updatedPaths.forEach((item) => updatedPaths.add(item));
      result.failedPaths.forEach((item) => failedPaths.add(item));
      linkCount = result.linkCount;
    }
  } finally {
    await indexerController.reindexPaths([
      ...(isTrashed ? files.map((file) => file.path) : []),
      ...moved.map((item) => item.to),
      ...updatedPaths,
    ]);
  }

  return {
    status: 'deleted',
    path: folderPath,
    moved,
    deleted: mode === 'delete' ? files.map((file) => file.path) : [],
    updatedPaths: [...updatedPaths],
    failedPaths: [...failedPaths],
    linkCount,
  };
}

/**
 * Deletes a section of a campaign with all its content: the folder goes to the system Trash (recoverable) and
 * the section leaves the campaign's settings. With `rewriteLinks`, links from notes outside it to its files are
 * handled like a file delete (plain text, embeds removed). The special sections cannot be deleted.
 */
async function deleteSection(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const campaign = requireString(body.campaign, 'payload.campaign');
  const key = requireString(body.section, 'payload.section');
  const rewriteLinksToText =
    normalizeOptionalBooleanFlag(body.rewriteLinks, 'payload.rewriteLinks') !== 0;
  if (!sectionModel.isPlainFolderSegment(campaign) || !sectionModel.isPlainFolderSegment(key)) {
    throw new Error('Not a section of a campaign.');
  }
  if (campaign.includes('/') || key.includes('/')) {
    throw new Error('Not a section of a campaign.');
  }

  requireIndexOpen();
  const vaultPath = vaultController.getReadyVaultPath();
  const section = sectionModel
    .listCampaignSections(vaultPath, campaign)
    .find((item) => item.key === key);
  if (!section) {
    throw new Error(`Not a section: ${campaign}/${key}`);
  }
  if (section.isSpecial) {
    throw new Error(`The ${key} section cannot be deleted.`);
  }

  const folderPath = `${campaign}/${key}`;
  const absolutePath = resolveInsideVault(vaultPath, folderPath);
  const prefix = `${folderPath}/`;
  const files = vaultIndexModel
    .listScopeFiles(campaign)
    .filter((file) => file.path.startsWith(prefix));
  let links = { updatedPaths: [], failedPaths: [], linkCount: 0 };
  let isTrashed = false;
  try {
    // The Trash comes first: if it fails nothing was rewritten or changed (links are rewritten from the index).
    if (fs.existsSync(absolutePath)) {
      await shell.trashItem(absolutePath);
    }
    isTrashed = true;

    // Custom sections leave `custom`; a preset is marked `removed` (it would come back as a default otherwise).
    const stored = sectionModel.readCampaignSectionSettings(vaultPath, campaign);
    const rows = sectionModel.listCampaignSections(vaultPath, campaign);
    sectionModel.saveCampaignSectionSettings(vaultPath, campaign, {
      hidden: stored.hidden,
      order: stored.order,
      labels: stored.labels,
      removed: section.isCustom ? stored.removed : [...stored.removed, key],
      custom: rows
        .filter((row) => row.isCustom && row.key !== key)
        .map(({ key: rowKey, type, label, icon, description }) => ({
          key: rowKey,
          type,
          label,
          icon,
          description,
        })),
    });

    if (rewriteLinksToText) {
      links = await rewriteLinksToDeletedFiles(vaultPath, files, prefix);
    }
  } finally {
    await indexerController.reindexPaths([
      ...(isTrashed ? files.map((file) => file.path) : []),
      ...links.updatedPaths,
    ]);
  }

  return {
    status: 'deleted',
    path: folderPath,
    deleted: files.map((file) => file.path),
    updatedPaths: links.updatedPaths,
    failedPaths: links.failedPaths,
    linkCount: links.linkCount,
  };
}

/**
 * Deletes a folder the Review page lists (an unknown folder of a campaign, or one nested too deep): the folder
 * goes to the system Trash (recoverable) with everything in it. With `rewriteLinks`, links from notes outside it
 * are handled like a file delete (plain text, embeds removed). Sections and their sub-folders are refused:
 * they have their own delete.
 */
async function deleteStrayFolder(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const folderPath = requirePath(body, 'folder').replace(/\/+$/, '');
  const rewriteLinksToText =
    normalizeOptionalBooleanFlag(body.rewriteLinks, 'payload.rewriteLinks') !== 0;

  requireIndexOpen();
  const vaultPath = vaultController.getReadyVaultPath();
  if (!isStrayFolder(vaultPath, folderPath)) {
    throw new Error(`Not a folder the Review page can delete: ${folderPath}`);
  }

  const absolutePath = resolveInsideVault(vaultPath, folderPath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`Not a folder: ${folderPath}`);
  }

  const scope = vaultIndexModel.getCampaignSlug(folderPath);
  const prefix = `${folderPath}/`;
  const files = vaultIndexModel
    .listScopeFiles(scope)
    .filter((file) => file.path.startsWith(prefix));
  let links = { updatedPaths: [], failedPaths: [], linkCount: 0 };
  let isTrashed = false;
  try {
    await shell.trashItem(absolutePath);
    isTrashed = true;
    if (rewriteLinksToText) {
      links = await rewriteLinksToDeletedFiles(vaultPath, files, prefix);
    }
  } finally {
    await indexerController.reindexPaths([
      ...(isTrashed ? files.map((file) => file.path) : []),
      ...links.updatedPaths,
    ]);
  }

  return {
    status: 'deleted',
    path: folderPath,
    deleted: files.map((file) => file.path),
    updatedPaths: links.updatedPaths,
    failedPaths: links.failedPaths,
    linkCount: links.linkCount,
  };
}

/**
 * Deletes a note or an asset: the file goes to the system Trash (recoverable). With `rewriteLinks`, the links
 * the index resolved to it are rewritten in every other note first — a note's links become their plain text,
 * an asset's embeds are removed (its plain links become text). Without it they stay, reported as broken.
 */
async function deleteFile(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const rewriteLinksToText =
    normalizeOptionalBooleanFlag(body.rewriteLinks, 'payload.rewriteLinks') !== 0;

  requireIndexOpen();
  const vaultPath = vaultController.getReadyVaultPath();
  const absolutePath = resolveInsideVault(vaultPath, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`Not found: ${relativePath}`);
  }

  const isNote = vaultIndexModel.getFileKind(relativePath) === 'md';
  const rawsBySource = groupRawsBySource(vaultIndexModel.listIncomingLinks(relativePath));
  let result = { updatedPaths: [], failedPaths: [], linkCount: 0 };
  let isTrashed = false;
  try {
    await shell.trashItem(absolutePath);
    isTrashed = true;
    if (rewriteLinksToText) {
      result = await rewriteIncomingLinks(
        vaultPath,
        rawsBySource,
        relativePath,
        (content, sourcePath, raws) =>
          rewriteLinks(
            content,
            (link) => (raws?.has(link.raw) ? { text: getDeletedLinkText(link, isNote) } : null),
            { sourcePath },
          ),
      );
    }
  } finally {
    await indexerController.reindexPaths([
      ...(isTrashed ? [relativePath] : []),
      ...result.updatedPaths,
    ]);
  }

  const { updatedPaths, failedPaths, linkCount } = result;
  return { path: relativePath, updatedPaths, failedPaths, linkCount };
}

/**
 * An image of the assets was renamed or moved: the maps of its scope that show it follow, so they do not end up
 * with a missing image. A map changed meanwhile is skipped (its file is left as it is). Returns the paths written.
 */
async function rewriteMapImages(vaultPath, oldPath, newPath) {
  const scope = vaultIndexModel.getCampaignSlug(oldPath);
  const mapPaths = vaultIndexModel
    .listScopeFiles(scope)
    .map((file) => file.path)
    .filter((filePath) => /(^|\/)maps\/(.+\/)?[^/]+\.json$/i.test(filePath));
  const updated = [];
  for (const mapPath of mapPaths) {
    try {
      const file = await mapModel.readMap(vaultPath, mapPath);
      if (file.parseError || file.map.image !== oldPath) {
        continue;
      }

      const result = await mapModel.writeMap(
        vaultPath,
        mapPath,
        { ...file.map, image: newPath },
        file.contentHash,
      );
      if (result.status === 'saved') {
        updated.push(mapPath);
      }
    } catch (error) {
      console.warn('[maps] Could not follow the renamed image in', mapPath, error);
    }
  }

  return updated;
}

/**
 * Renames an asset (image, PDF, audio…): the new name gives the slug, the extension stays, the folder too.
 * With `updateLinks`, the links and embeds resolving to it are rewritten like a note rename's.
 */
async function renameAsset(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const name = requireString(body.name, 'payload.name', { maxLength: DOCUMENT_TITLE_MAX_LENGTH });
  const updateLinks = normalizeOptionalBooleanFlag(body.updateLinks, 'payload.updateLinks') !== 0;
  if (vaultIndexModel.getFileKind(relativePath) === 'md') {
    throw new Error(`Not an asset: ${relativePath}`);
  }

  const extension = path.posix.extname(relativePath);
  // A name typed with the extension (`map.png`) keeps it once, not twice.
  const typedName = name.toLocaleLowerCase().endsWith(extension.toLocaleLowerCase())
    ? name.slice(0, -extension.length)
    : name;
  const slug = toSlug(typedName);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  requireIndexOpen();
  const vaultPath = vaultController.getReadyVaultPath();
  const oldName = path.posix.basename(relativePath);
  const newName = `${slug}${extension.toLocaleLowerCase()}`;
  const newPath = path.posix.join(path.posix.dirname(relativePath), newName);
  if (newPath === relativePath) {
    return { path: relativePath, updatedPaths: [], failedPaths: [], linkCount: 0 };
  }

  const rawsBySource = groupRawsBySource(vaultIndexModel.listIncomingLinks(relativePath));
  await documentModel.moveVaultFile(vaultPath, relativePath, newPath);
  const { updatedPaths, failedPaths, linkCount } = updateLinks
    ? await rewriteIncomingLinks(
        vaultPath,
        rawsBySource,
        relativePath,
        (content, sourcePath, raws) =>
          rewriteRenamedLinks(content, sourcePath, raws, oldName, newName),
      )
    : { updatedPaths: [], failedPaths: [], linkCount: 0 };

  const mapPaths = await rewriteMapImages(vaultPath, relativePath, newPath);
  await indexerController.reindexPaths([relativePath, newPath, ...updatedPaths, ...mapPaths]);
  return { path: newPath, updatedPaths, failedPaths, linkCount };
}

/** Writes a rewritten note only if it did not change since it was read; throws on a conflict. */
async function writeRewrittenNote(vaultPath, document, rewritten) {
  const result = await documentModel.writeDocument(
    vaultPath,
    document.path,
    rewritten.content,
    document.contentHash,
  );
  if (result.status !== 'saved') {
    throw new Error(`The note changed meanwhile, try again: ${document.path}`);
  }
}

/** Removes a link from a note, leaving its text (label, or what it pointed to) in place. */
async function unlink(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const raw = requireString(body.raw, 'payload.raw', { trim: false });

  const vaultPath = vaultController.getReadyVaultPath();
  const document = await documentModel.readDocument(vaultPath, relativePath);
  const rewritten = rewriteLinks(
    document.content,
    (link) => (link.raw === raw ? { text: getLinkPlainText(link) } : null),
    { sourcePath: relativePath },
  );

  if (rewritten.count > 0) {
    await writeRewrittenNote(vaultPath, document, rewritten);
    if (indexerController.isOpen()) {
      await indexerController.reindexPaths([relativePath]);
    }
  }

  return { path: relativePath, linkCount: rewritten.count };
}

/**
 * Creates the note a broken link points to, in the chosen folder. The new file gets the kebab-case name of
 * its title; when that differs from what the link says, the link is rewritten to it (its text kept as alias).
 */
async function createFromLink(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const sourcePath = requirePath(body, 'sourcePath');
  const raw = requireString(body.raw, 'payload.raw', { trim: false });
  const folderPath = requirePath(body, 'folder');
  const title = requireString(body.title, 'payload.title', {
    maxLength: DOCUMENT_TITLE_MAX_LENGTH,
  });
  const type = toSlug(
    requireString(body.type, 'payload.type', { maxLength: DOCUMENT_TYPE_MAX_LENGTH }),
  );

  const slug = toSlug(title);
  if (slug.length === 0) {
    throw new Error('payload.title must contain at least one letter or number.');
  }

  const vaultPath = vaultController.getReadyVaultPath();
  const source = await documentModel.readDocument(vaultPath, sourcePath);
  const link = parseMarkdownDocument(source.content, { sourcePath }).links.find(
    (item) => item.raw === raw,
  );
  if (!link) {
    throw new Error(`Link not found in ${sourcePath}: ${raw}`);
  }

  const section =
    normalizeOptionalString(body.section, 'payload.section', { allowNull: true }) ?? null;
  const created = await documentModel.createDocument(vaultPath, {
    folderPath,
    slug,
    title,
    type,
    section,
  });

  if (link.targetName.toLocaleLowerCase() !== slug) {
    const rewritten = rewriteLinks(
      source.content,
      (item) => {
        if (item.raw !== raw) {
          return null;
        }

        const renamed = renameLinkTarget(item, item.targetName, slug);
        if (renamed === null || item.syntax === 'markdown' || item.label) {
          return renamed;
        }

        return `${renamed}|${getLinkPlainText(item)}`;
      },
      { sourcePath },
    );
    if (rewritten.count > 0) {
      await writeRewrittenNote(vaultPath, source, rewritten);
    }
  }

  if (indexerController.isOpen()) {
    await indexerController.reindexPaths([sourcePath, created.path]);
  }

  return created;
}

const TEMPLATES_DIR_NAME = '_templates';
const ASSETS_DIR_NAME = 'assets';
const NOTES_DIR_NAME = 'notes';
const ENCOUNTERS_DIR_NAME = 'encounters';

/** A copy target: a campaign (`lost-mine`) or a compendium system (`compendium/my-system`). */
async function requireCopyTarget(vaultPath, target) {
  const segments = target.split('/');
  if (segments[0] === compendiumModel.COMPENDIUM_DIR_NAME && segments.length === 2) {
    if (
      !compendiumModel.isSystemDirName(segments[1]) ||
      !(await compendiumModel.readSystem(vaultPath, segments[1]))
    ) {
      throw new Error(`Compendium system not found: ${segments[1]}`);
    }
    return target;
  }

  if (
    segments.length !== 1 ||
    !vaultModel.isCampaignDirName(target) ||
    !(await campaignModel.readCampaign(vaultPath, target))
  ) {
    throw new Error(`Campaign not found: ${target}`);
  }
  return target;
}

/**
 * Where a copy goes in the target. `section` is its folder: templates stay templates, encounters (`.json`
 * of an Encounters section) go to encounters, any other non-note file to assets, notes keep the section
 * they have in the source (a section the target lacks is reported on its Review page), else `notes/`.
 * `subfolder` is the sub-folder (one level) the source keeps the file in; `canHaveSubfolder` is false for
 * templates and notes outside a section.
 */
async function getCopyLocation(vaultPath, relativePath, target) {
  const segments = relativePath.split('/');
  if (segments.slice(0, -1).includes(TEMPLATES_DIR_NAME)) {
    return { section: TEMPLATES_DIR_NAME, subfolder: null, canHaveSubfolder: false };
  }

  const sourceFolder = sectionModel.parseSectionFolder(path.posix.dirname(relativePath));
  const extension = path.posix.extname(relativePath).toLocaleLowerCase();
  if (extension !== MARKDOWN_EXTENSION) {
    const isEncounter =
      extension === encounterModel.ENCOUNTER_EXTENSION &&
      sourceFolder?.section === ENCOUNTERS_DIR_NAME;
    const isMap =
      extension === mapModel.MAP_EXTENSION && sourceFolder?.section === mapModel.MAPS_SECTION_KEY;
    const section = isEncounter
      ? ENCOUNTERS_DIR_NAME
      : isMap
        ? mapModel.MAPS_SECTION_KEY
        : ASSETS_DIR_NAME;
    return {
      section,
      subfolder: sourceFolder?.section === section ? sourceFolder.subfolder : null,
      canHaveSubfolder: true,
    };
  }

  // A note keeps the folder it has in its source; one outside any section goes to `notes/`.
  if (!sourceFolder) {
    return { section: NOTES_DIR_NAME, subfolder: null, canHaveSubfolder: false };
  }

  return {
    section: sourceFolder.section,
    subfolder: sourceFolder.subfolder,
    canHaveSubfolder: true,
  };
}

/** Folder inside the target: the section, plus the sub-folder when there is one. */
function toCopyFolder(location, subfolder) {
  return subfolder ? `${location.section}/${subfolder}` : location.section;
}

/**
 * The sub-folder a copy would come with (the source keeps the file in one) and what the target already has:
 * whether it has that sub-folder, and a file of the same name in it. Null when the source file is not in one.
 */
async function describeCopySubfolder(vaultPath, relativePath, target, location) {
  if (!location.subfolder) {
    return null;
  }

  const existing = await documentModel.listSubfolders(vaultPath, `${target}/${location.section}`);
  const isExisting = existing.includes(location.subfolder);
  const filePath = `${target}/${location.section}/${location.subfolder}/${path.posix.basename(relativePath)}`;
  return {
    name: location.subfolder,
    section: location.section,
    exists: isExisting,
    fileExists: isExisting && fs.existsSync(resolveInsideVault(vaultPath, filePath)),
  };
}

const LINKED_COPY_MAX_FILES = 200;

/**
 * Files a copy would leave behind: everything the file links to, transitively, that the target does not
 * already have (by link name). Files the target has stop the cascade: their own links resolve there.
 */
function collectMissingLinkedFiles(sourcePath, target) {
  const visited = new Set([sourcePath]);
  const pending = [sourcePath];
  const missing = [];

  while (pending.length > 0 && missing.length < LINKED_COPY_MAX_FILES) {
    for (const link of vaultIndexModel.listOutgoingLinks(pending.shift())) {
      const linkedPath = link.resolvedPath;
      if (!linkedPath || visited.has(linkedPath)) {
        continue;
      }

      visited.add(linkedPath);
      if (vaultIndexModel.hasFileNamed(target, vaultIndexModel.getFileName(linkedPath))) {
        continue;
      }

      missing.push({
        path: linkedPath,
        title: link.resolvedTitle ?? path.posix.basename(linkedPath),
      });
      if (vaultIndexModel.getFileKind(linkedPath) === 'md') {
        pending.push(linkedPath);
      }
    }
  }

  return missing;
}

/**
 * What copying a file to a target involves: its linked files the target is missing, and the sub-folder the
 * file sits in (with what the target already has of it), so the user can choose how to place it.
 */
async function copyPlan(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const target = requireString(body.target, 'payload.target');
  const vaultPath = vaultController.getReadyVaultPath();
  await requireCopyTarget(vaultPath, target);

  const location = await getCopyLocation(vaultPath, relativePath, target);
  return {
    linked: indexerController.isOpen() ? collectMissingLinkedFiles(relativePath, target) : [],
    subfolder: await describeCopySubfolder(vaultPath, relativePath, target, location),
  };
}

/**
 * A copied map brings its image along: the image is copied into the target's assets (kept when the target
 * already has a file of that name) and the copy points at it, so it never depends on the source's folder.
 * Returns the image path written in the copy, null when there was nothing to do.
 */
async function copyMapImage(vaultPath, sourcePath, targetPath, target) {
  const source = await mapModel.readMap(vaultPath, sourcePath);
  if (source.parseError || !source.map.image) {
    return null;
  }

  const imageLocation = await getCopyLocation(vaultPath, source.map.image, target);
  const imageTarget = `${target}/${toCopyFolder(imageLocation, imageLocation.subfolder)}/${path.posix.basename(source.map.image)}`;
  if (imageTarget !== source.map.image && fs.existsSync(resolveInsideVault(vaultPath, source.map.image))) {
    await documentModel.copyVaultFile(vaultPath, source.map.image, imageTarget);
  }

  const copied = await mapModel.readMap(vaultPath, targetPath);
  if (copied.parseError) {
    return null;
  }

  const result = await mapModel.writeMap(
    vaultPath,
    targetPath,
    { ...copied.map, image: imageTarget },
    copied.contentHash,
  );
  return result.status === 'saved' ? imageTarget : null;
}

/**
 * Copies a note, asset, encounter or template into a campaign or a compendium system (the original stays).
 * The section comes from the file kind or note type and is created on demand; `subfolder` is the sub-folder
 * of that section it goes into (none: the section itself; ignored where there are no sub-folders), created
 * on demand. Linked files keep their own sub-folders. Never overwrites: a taken name returns
 * `{ status: 'exists' }` so the user can pick another `fileName` (without extension).
 */
async function copy(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const target = requireString(body.target, 'payload.target');
  const fileName = normalizeOptionalString(body.fileName, 'payload.fileName', { allowNull: true });
  const includeLinked =
    normalizeOptionalBooleanFlag(body.includeLinked, 'payload.includeLinked') === 1;
  const chosenSubfolder = normalizeOptionalString(body.subfolder, 'payload.subfolder', {
    allowNull: true,
  });

  const vaultPath = vaultController.getReadyVaultPath();
  await requireCopyTarget(vaultPath, target);

  const location = await getCopyLocation(vaultPath, relativePath, target);
  let subfolder = null;
  if (chosenSubfolder && location.canHaveSubfolder) {
    subfolder = toSlug(chosenSubfolder);
    if (subfolder.length === 0) {
      throw new Error('payload.subfolder must contain at least one letter or number.');
    }
  }

  const extension = path.posix.extname(relativePath);
  const baseName = fileName ? toSlug(fileName) : path.posix.basename(relativePath, extension);
  if (baseName.length === 0) {
    throw new Error('payload.fileName must contain at least one letter or number.');
  }

  const targetPath = `${target}/${toCopyFolder(location, subfolder)}/${baseName}${extension}`;
  if (targetPath === relativePath) {
    return { status: 'exists', path: targetPath };
  }

  const linkedFiles =
    includeLinked && indexerController.isOpen()
      ? collectMissingLinkedFiles(relativePath, target)
      : [];
  const result = await documentModel.copyVaultFile(vaultPath, relativePath, targetPath);
  if (result.status !== 'copied') {
    return { ...result, linkedPaths: [] };
  }

  const linkedPaths = [];
  try {
    if (location.section === mapModel.MAPS_SECTION_KEY && extension.toLocaleLowerCase() === mapModel.MAP_EXTENSION) {
      const imagePath = await copyMapImage(vaultPath, relativePath, targetPath, target);
      if (imagePath) {
        linkedPaths.push(imagePath);
      }
    }

    for (const linkedFile of linkedFiles) {
      const linkedExtension = path.posix.extname(linkedFile.path);
      const linkedLocation = await getCopyLocation(vaultPath, linkedFile.path, target);
      const linkedTargetPath = `${target}/${toCopyFolder(linkedLocation, linkedLocation.subfolder)}/${path.posix.basename(linkedFile.path, linkedExtension)}${linkedExtension}`;
      try {
        const linkedResult = await documentModel.copyVaultFile(
          vaultPath,
          linkedFile.path,
          linkedTargetPath,
        );
        if (linkedResult.status === 'copied') {
          linkedPaths.push(linkedTargetPath);
        }
      } catch (error) {
        // One linked file failing must not undo or hide the copies that already happened.
        console.warn('[electron] Failed to copy a linked file ->', linkedFile.path, error);
      }
    }
  } finally {
    // The main copy exists on disk even when a later step threw: the index must follow it.
    if (indexerController.isOpen()) {
      await indexerController.reindexPaths([targetPath, ...linkedPaths]);
    }
  }

  return { ...result, linkedPaths };
}

module.exports = {
  brokenLinks,
  copy,
  copyMapImage,
  copyPlan,
  createFolder,
  createFromLink,
  create,
  deleteFile,
  deleteFolder,
  deleteSection,
  deleteStrayFolder,
  linkTargets,
  links,
  list,
  move,
  openFile,
  read,
  rename,
  renameAsset,
  renameFolder,
  reveal,
  saveCopy,
  unlink,
  write,
};
