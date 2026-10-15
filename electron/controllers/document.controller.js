const fs = require('node:fs');
const path = require('node:path');
const { shell } = require('electron');
const { resolveInsideVault } = require('../utils/file-utils');
const {
  campaignModel,
  compendiumModel,
  documentModel,
  sectionModel,
  vaultIndexModel,
  vaultModel,
} = require('../models');
const {
  getLinkPlainText,
  parseMarkdownDocument,
  removeFrontmatterField,
  renameLinkTarget,
  replaceDocumentTitle,
  rewriteLinks,
  setFrontmatterField,
} = require('../utils/markdown-parse');
const { toSlug } = require('../utils/string-sanitize');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const {
  ensurePlainObject,
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

/**
 * New sub-folder of a section: one level deep, in a section that holds notes. The folder name is the
 * sub-type its notes get (`enemies/humans/` → `subtype: humans`).
 */
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

/** `type` and `subtype` of a note's frontmatter (no sub-type removes it), the rest of the file kept. */
function withTypeAndSubtype(content, type, subtype) {
  const typed = setFrontmatterField(content, 'type', type);
  return subtype
    ? setFrontmatterField(typed, 'subtype', subtype)
    : removeFrontmatterField(typed, 'subtype');
}

/** Review fix: sets a note's type and sub-type (frontmatter only; conflict-checked like a save). */
async function setType(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const type = requireString(body.type, 'payload.type', {
    maxLength: DOCUMENT_TYPE_MAX_LENGTH,
  }).toLocaleLowerCase();
  const subtype =
    normalizeOptionalString(body.subtype, 'payload.subtype', { allowNull: true }) || null;
  const vaultPath = vaultController.getReadyVaultPath();
  const current = await documentModel.readDocument(vaultPath, relativePath);
  const content = withTypeAndSubtype(current.content, type, subtype);
  if (content === current.content) {
    return { path: relativePath };
  }

  const result = await documentModel.writeDocument(
    vaultPath,
    relativePath,
    content,
    current.contentHash,
  );
  if (result.status !== 'saved') {
    throw new Error(`${relativePath} changed meanwhile, so it was not updated.`);
  }

  await indexerController.reindexPaths([relativePath]);
  return { path: relativePath };
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
 * Moves a note file and updates it: `type` / `subtype` follow a note section (special sections keep them),
 * relative links are recomputed from the new folder. The rewrite is conflict-checked like a save.
 */
async function moveNoteFile(vaultPath, relativePath, newPath, section, subfolder) {
  const current = await documentModel.readDocument(vaultPath, relativePath);
  const resolvedByRaw = new Map(
    vaultIndexModel
      .listOutgoingLinks(relativePath)
      .filter((link) => link.resolvedPath)
      .map((link) => [link.raw, link.resolvedPath === relativePath ? newPath : link.resolvedPath]),
  );
  const typed = section.isSpecial
    ? current.content
    : withTypeAndSubtype(current.content, section.type, subfolder);
  const ownContent = rewriteLinks(
    typed,
    (link) =>
      link.syntax === 'markdown' && resolvedByRaw.has(link.raw)
        ? toMarkdownHref(path.posix.dirname(newPath), resolvedByRaw.get(link.raw), link.raw)
        : null,
    { sourcePath: relativePath },
  ).content;

  await documentModel.renameDocumentFile(vaultPath, relativePath, newPath);
  if (ownContent !== current.content) {
    await documentModel.writeDocument(vaultPath, newPath, ownContent, current.contentHash);
  }
}

/**
 * Moves a file (note or asset) into a section (or sub-folder) of its own campaign or system: it keeps its
 * name; a note's `type` / `subtype` follow the destination and its own relative links are recomputed; every
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
  if (isNote) {
    await moveNoteFile(vaultPath, relativePath, newPath, section, location.subfolder);
  } else {
    await documentModel.moveVaultFile(vaultPath, relativePath, newPath);
  }

  const updatedPaths = [];
  const failedPaths = [];
  let linkCount = 0;
  for (const [sourcePath, raws] of rawsBySource) {
    if (sourcePath === relativePath) {
      continue;
    }

    try {
      const source = await documentModel.readDocument(vaultPath, sourcePath);
      const rewritten = rewriteLinks(
        source.content,
        (link) => (raws.has(link.raw) ? retargetMovedLink(link, sourcePath, newPath, scope) : null),
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

  await indexerController.reindexPaths([relativePath, newPath, ...updatedPaths]);
  return { path: newPath, updatedPaths, failedPaths, linkCount };
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

/** Sub-type of a note created in `folderPath`: the sub-folder of its section, if it is in one. */
function getSubtypeOfFolder(folderPath) {
  const location = sectionModel.parseSectionFolder(folderPath);
  return location && !sectionModel.SPECIAL_SECTION_KEYS.includes(location.section)
    ? location.subfolder
    : null;
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
    subtype: getSubtypeOfFolder(folderPath),
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
    rows: vaultIndexModel.listScopeFiles(scope).filter((file) => file.path !== sourcePath),
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
  }

  if (ownContent !== current.content) {
    await documentModel.writeDocument(vaultPath, newPath, ownContent, current.contentHash);
  }

  const { updatedPaths, failedPaths, linkCount } =
    updateLinks && isNameChanged
      ? await rewriteIncomingLinks(vaultPath, rawsBySource, relativePath, (content, sourcePath, raws) =>
          rewriteRenamedLinks(content, sourcePath, raws, oldName, slug),
        )
      : { updatedPaths: [], failedPaths: [], linkCount: 0 };

  await indexerController.reindexPaths([relativePath, newPath, ...updatedPaths]);

  return { path: newPath, updatedPaths, failedPaths, linkCount };
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
    ? await rewriteIncomingLinks(vaultPath, rawsBySource, relativePath, (content, sourcePath, raws) =>
        rewriteRenamedLinks(content, sourcePath, raws, oldName, newName),
      )
    : { updatedPaths: [], failedPaths: [], linkCount: 0 };

  await indexerController.reindexPaths([relativePath, newPath, ...updatedPaths]);
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
    subtype: getSubtypeOfFolder(folderPath),
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
const UNTYPED_NOTES_DIR_NAME = 'notes';

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
 * Folder of the target the copy goes to: templates stay templates, files go to assets, notes follow their
 * type — the target's section for it (a campaign's custom sections included), else the folder the source
 * scope keeps that type in (reported on the target's Review page), else `notes/`.
 */
async function getCopyFolder(vaultPath, relativePath, target) {
  const segments = relativePath.split('/');
  if (segments.slice(0, -1).includes(TEMPLATES_DIR_NAME)) {
    return TEMPLATES_DIR_NAME;
  }

  if (path.posix.extname(relativePath).toLocaleLowerCase() !== MARKDOWN_EXTENSION) {
    return ASSETS_DIR_NAME;
  }

  const document = await documentModel.readDocument(vaultPath, relativePath);
  const sourceScope = vaultIndexModel.getCampaignSlug(relativePath);
  const sectionFolder =
    sectionModel.findSectionKeyForType(vaultPath, target, document.type) ??
    sectionModel.findSectionKeyForType(vaultPath, sourceScope, document.type);
  if (!sectionFolder) {
    return UNTYPED_NOTES_DIR_NAME;
  }

  // The sub-folder (sub-type) comes along: `enemies/humans/x.md` → `<target>/enemies/humans/`.
  const subfolder = sectionModel.parseSectionFolder(path.posix.dirname(relativePath))?.subfolder;
  return subfolder ? `${sectionFolder}/${subfolder}` : sectionFolder;
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

/** What copying a file to a target would also need: its linked files the target is missing. */
async function copyPlan(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const target = requireString(body.target, 'payload.target');
  await requireCopyTarget(vaultController.getReadyVaultPath(), target);

  return {
    linked: indexerController.isOpen() ? collectMissingLinkedFiles(relativePath, target) : [],
  };
}

/**
 * Copies a note, asset or template into a campaign or a compendium system (the original stays). The
 * folder comes from the note type and is created on demand. Never overwrites: a taken name returns
 * `{ status: 'exists' }` so the user can pick another `fileName` (without extension).
 */
async function copy(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const relativePath = requirePath(body);
  const target = requireString(body.target, 'payload.target');
  const fileName = normalizeOptionalString(body.fileName, 'payload.fileName', { allowNull: true });
  const includeLinked =
    normalizeOptionalBooleanFlag(body.includeLinked, 'payload.includeLinked') === 1;

  const vaultPath = vaultController.getReadyVaultPath();
  await requireCopyTarget(vaultPath, target);

  const extension = path.posix.extname(relativePath);
  const baseName = fileName ? toSlug(fileName) : path.posix.basename(relativePath, extension);
  if (baseName.length === 0) {
    throw new Error('payload.fileName must contain at least one letter or number.');
  }

  const folder = await getCopyFolder(vaultPath, relativePath, target);
  const targetPath = `${target}/${folder}/${baseName}${extension}`;
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
  for (const linkedFile of linkedFiles) {
    const extension = path.posix.extname(linkedFile.path);
    const linkedTargetPath = `${target}/${await getCopyFolder(vaultPath, linkedFile.path, target)}/${path.posix.basename(linkedFile.path, extension)}${extension}`;
    const linkedResult = await documentModel.copyVaultFile(
      vaultPath,
      linkedFile.path,
      linkedTargetPath,
    );
    if (linkedResult.status === 'copied') {
      linkedPaths.push(linkedTargetPath);
    }
  }

  if (indexerController.isOpen()) {
    await indexerController.reindexPaths([targetPath, ...linkedPaths]);
  }

  return { ...result, linkedPaths };
}

module.exports = {
  brokenLinks,
  copy,
  copyPlan,
  createFolder,
  createFromLink,
  create,
  linkTargets,
  links,
  list,
  move,
  read,
  rename,
  renameAsset,
  reveal,
  saveCopy,
  setType,
  unlink,
  write,
};
