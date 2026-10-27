const fs = require('node:fs');
const path = require('node:path');
const { resolveInsideVault } = require('../utils/file-utils');
const {
  parseMarkdownDocument,
  rewriteLinks,
  setFrontmatterField,
} = require('../utils/markdown-parse');
const { toSlug } = require('../utils/string-sanitize');
const campaignModel = require('../models/campaign.model');
const documentModel = require('../models/document.model');
const sectionModel = require('../models/section.model');
const { isCampaignDirName } = require('../models/vault.model');

const MARKDOWN_EXTENSION = '.md';
/** Source key of the notes lying directly in the source folder. */
const ROOT_KEY = '.';
const MAX_ENTRIES = 50000;
const MAX_DEPTH = 12;
const MAX_NOTES = 5000;
const MAX_MEDIA = 5000;
const MAX_NOTE_BYTES = 2 * 1024 * 1024;
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_NOTE_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 1024 * 1024 * 1024;
const MAX_LISTED = 20;
const CAMPAIGN_NAME_MAX_LENGTH = 80;
const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 500;

/** Sections a source folder can be mapped to: the note sections (encounters, maps and assets are special). */
const TARGET_SECTIONS = Object.freeze(sectionModel.SECTION_PRESETS.map((section) => section.key));

/** Paths compare without case on macOS and Windows, where `Vault` and `vault` are the same folder. */
function comparable(value) {
  return process.platform === 'linux' ? value : value.toLowerCase();
}

/** Code-point order, so a listing reads the same on every computer (`localeCompare` follows the locale). */
function byName(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isInside(parent, child) {
  const relative = path.relative(comparable(parent), comparable(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The source folder as its real path, or an error. A source inside the Codex, or one that contains it, is refused
 * (an import reads another place and writes a new campaign), and so is the root of a drive.
 */
async function assertSource(sourcePath, vaultPath) {
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
    throw new Error('sourcePath must be an absolute path to a folder on this computer.');
  }

  let realSource;
  try {
    realSource = await fs.promises.realpath(sourcePath);
  } catch {
    throw new Error(`Folder not found: ${sourcePath}`);
  }
  if (!(await fs.promises.stat(realSource)).isDirectory()) {
    throw new Error('sourcePath is not a folder.');
  }
  if (path.parse(realSource).root === realSource) {
    throw new Error('Pick the folder of the notes, not the root of a drive.');
  }

  const realVault = await fs.promises.realpath(vaultPath);
  if (isInside(realVault, realSource) || isInside(realSource, realVault)) {
    throw new Error('The folder is inside the Codex, or contains it. Pick a folder outside of it.');
  }

  return realSource;
}

/**
 * Lists the notes and media of the source folder. Hidden entries (`.obsidian`, `.git`), symbolic links and
 * `node_modules` are skipped; every other file type is counted, not read. Throws past the caps.
 */
async function walkSource(root, isMedia) {
  const result = {
    notes: [],
    media: [],
    unsupported: {},
    skippedHidden: 0,
    skippedSymlinks: 0,
    tooLarge: [],
    tooLargeCount: 0,
    tooDeep: 0,
  };
  const stack = [{ abs: root, rel: '', depth: 0 }];
  let visited = 0;

  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir.depth > MAX_DEPTH) {
      result.tooDeep += 1;
      continue;
    }

    const dirents = await fs.promises.readdir(dir.abs, { withFileTypes: true });
    for (const dirent of dirents) {
      visited += 1;
      if (visited > MAX_ENTRIES) {
        throw new Error(`More than ${MAX_ENTRIES} entries: pick a smaller folder.`);
      }
      if (dirent.name.startsWith('.') || dirent.name === 'node_modules') {
        result.skippedHidden += 1;
        continue;
      }
      if (dirent.isSymbolicLink()) {
        result.skippedSymlinks += 1;
        continue;
      }

      const rel = dir.rel ? `${dir.rel}/${dirent.name}` : dirent.name;
      const abs = path.join(dir.abs, dirent.name);
      if (dirent.isDirectory()) {
        stack.push({ abs, rel, depth: dir.depth + 1 });
        continue;
      }
      if (!dirent.isFile()) {
        continue;
      }

      const extension = path.extname(dirent.name).toLowerCase();
      const isNote = extension === MARKDOWN_EXTENSION;
      if (!isNote && !isMedia(dirent.name)) {
        const key = extension || '(no extension)';
        result.unsupported[key] = (result.unsupported[key] ?? 0) + 1;
        continue;
      }

      const { size } = await fs.promises.stat(abs);
      if (size === 0 || size > (isNote ? MAX_NOTE_BYTES : MAX_MEDIA_BYTES)) {
        result.tooLargeCount += 1;
        if (result.tooLarge.length < MAX_LISTED) {
          result.tooLarge.push(rel);
        }
        continue;
      }

      const entry = { rel, abs, size, top: rel.includes('/') ? rel.split('/')[0] : ROOT_KEY };
      (isNote ? result.notes : result.media).push(entry);
      if (result.notes.length > MAX_NOTES || result.media.length > MAX_MEDIA) {
        throw new Error(
          `More than ${MAX_NOTES} notes or ${MAX_MEDIA} media files: pick a smaller folder.`,
        );
      }
    }
  }

  result.notes.sort((a, b) => byName(a.rel, b.rel));
  result.media.sort((a, b) => byName(a.rel, b.rel));
  return result;
}

function assertSize(entries, limit, what) {
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total > limit) {
    throw new Error(`The ${what} are larger than ${limit / 1024 / 1024} MB together.`);
  }
}

function noteBaseName(rel) {
  return path.posix.basename(rel, path.posix.extname(rel));
}

/** Sub-folder levels below the top-level folder of a note: 0 = directly in it, 1 = one level (all LazyDM uses). */
function subfolderLevels(rel) {
  return Math.max(0, rel.split('/').length - 2);
}

/**
 * What a source folder looks like, without copying anything: folders with counts and sample notes, which link
 * styles it uses, what cannot be imported. The agent reads this to decide the folder → section mapping.
 */
async function scanSource({ sourcePath }, deps) {
  const realSource = await assertSource(sourcePath, deps.vaultPath);
  const walk = await walkSource(realSource, deps.isMedia);
  assertSize(walk.notes, MAX_TOTAL_NOTE_BYTES, 'notes');

  const folders = new Map();
  const bucket = (key) => {
    if (!folders.has(key)) {
      folders.set(key, {
        name: key,
        notes: 0,
        media: 0,
        notesDeeperThanOneSubfolder: 0,
        samples: [],
      });
    }
    return folders.get(key);
  };
  const links = { wikilinks: 0, markdownLinks: 0, embeds: 0 };
  let notesWithFrontmatter = 0;
  const slugOwners = new Map();

  for (const note of walk.notes) {
    const folder = bucket(note.top);
    folder.notes += 1;
    if (subfolderLevels(note.rel) > 1) {
      folder.notesDeeperThanOneSubfolder += 1;
    }
    if (folder.samples.length < 3) {
      folder.samples.push(note.rel);
    }

    const slug = toSlug(noteBaseName(note.rel)) || 'note';
    slugOwners.set(slug, [...(slugOwners.get(slug) ?? []), note.rel]);

    const parsed = parseMarkdownDocument(await fs.promises.readFile(note.abs, 'utf8'), {
      sourcePath: note.rel,
    });
    if (Object.keys(parsed.frontmatter).length > 0) {
      notesWithFrontmatter += 1;
    }
    for (const link of parsed.links) {
      if (link.kind === 'embed') {
        links.embeds += 1;
      } else if (link.syntax === 'markdown') {
        links.markdownLinks += 1;
      } else {
        links.wikilinks += 1;
      }
    }
  }
  for (const media of walk.media) {
    bucket(media.top).media += 1;
  }

  return {
    source: realSource,
    totals: {
      notes: walk.notes.length,
      media: walk.media.length,
      notesWithFrontmatter,
      unsupportedFiles: walk.unsupported,
      skippedHiddenEntries: walk.skippedHidden,
      skippedSymlinks: walk.skippedSymlinks,
      emptyOrTooLargeFiles: walk.tooLargeCount,
      foldersNestedTooDeep: walk.tooDeep,
    },
    emptyOrTooLargeExamples: walk.tooLarge,
    folders: [...folders.values()].sort((a, b) => byName(a.name, b.name)),
    links,
    sameNameAfterSlug: [...slugOwners.entries()]
      .filter(([, files]) => files.length > 1)
      .slice(0, MAX_LISTED)
      .map(([name, files]) => ({ name, files: files.slice(0, 5) })),
    targetSections: TARGET_SECTIONS,
    howToMap:
      'Call import_campaign with a mapping from each folder name above (and "." for notes lying directly in the ' +
      'source) to one of targetSections. Folders left out are skipped and listed. LazyDM keeps one sub-folder ' +
      'level inside a section: deeper folders are flattened into it. Run it with dryRun true first.',
  };
}

function validateMapping(mapping, folderNames) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('mapping must be an object: { "<source folder>": "<section>" }.');
  }

  const entries = Object.entries(mapping);
  if (entries.length === 0) {
    throw new Error('mapping is empty: map at least one folder to a section.');
  }
  for (const [folder, section] of entries) {
    if (!folderNames.has(folder)) {
      throw new Error(
        `"${folder}" is not a folder of the source. Folders: ${[...folderNames].join(', ') || '(none)'}.`,
      );
    }
    if (!TARGET_SECTIONS.includes(section)) {
      throw new Error(`"${section}" is not a section. Use one of: ${TARGET_SECTIONS.join(', ')}.`);
    }
  }

  return new Map(entries);
}

/** `a b/c.md` → `a%20b/c.md`, parentheses escaped like the app does for its own markdown links. */
function toMarkdownHref(fromDir, targetPath, oldRaw) {
  const hashIndex = oldRaw.indexOf('#');
  const suffix = hashIndex < 0 ? '' : oldRaw.slice(hashIndex);
  const relative = path.posix.relative(fromDir, targetPath);
  return `${encodeURI(relative).replace(/\(/g, '%28').replace(/\)/g, '%29')}${suffix}`;
}

/** Finds the source file a link points to: by path first, then (wikilinks only) by path suffix and by name. */
function createLinkResolver(notes, media) {
  const byRel = new Map();
  const byFileName = new Map();
  for (const entry of [...notes, ...media]) {
    const lowerRel = entry.rel.toLowerCase();
    byRel.set(lowerRel, entry);
    const fileName = path.posix.basename(lowerRel);
    byFileName.set(fileName, [...(byFileName.get(fileName) ?? []), entry]);
  }
  const mediaExtensions = new Set(
    media.map((entry) => path.posix.extname(entry.rel).toLowerCase()),
  );

  return function resolve(link) {
    const target = (link.targetPath ?? '').toLowerCase().replace(/^\/+/, '');
    if (!target) {
      return null;
    }

    const extension = path.posix.extname(target);
    const candidates =
      extension === MARKDOWN_EXTENSION || mediaExtensions.has(extension)
        ? [target]
        : [target, `${target}${MARKDOWN_EXTENSION}`];
    for (const candidate of candidates) {
      if (byRel.has(candidate)) {
        return byRel.get(candidate);
      }
    }
    if (link.syntax === 'markdown') {
      return null;
    }

    for (const candidate of candidates) {
      const sameName = byFileName.get(path.posix.basename(candidate)) ?? [];
      const bySuffix = sameName.filter((entry) =>
        entry.rel.toLowerCase().endsWith(`/${candidate}`),
      );
      const pool = bySuffix.length > 0 ? bySuffix : sameName;
      if (pool.length > 0) {
        return [...pool].sort((a, b) => a.rel.length - b.rel.length)[0];
      }
    }

    return null;
  };
}

/** `name`, `name-2`, `name-3`… until it is free in `taken`, which is updated. */
function takeFreeName(taken, base, extension) {
  let candidate = base;
  let counter = 2;
  while (taken.has(`${candidate}${extension}`.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  taken.add(`${candidate}${extension}`.toLowerCase());
  return candidate;
}

/**
 * Works out the whole import without writing anything: where each note and media file goes, the rewritten content
 * of each note, and what is skipped.
 */
async function planImport({ sourcePath, name, description, mapping, includeAllMedia }, deps) {
  const campaignName = typeof name === 'string' ? name.trim() : '';
  if (campaignName.length === 0 || campaignName.length > CAMPAIGN_NAME_MAX_LENGTH) {
    throw new Error(`name is required (at most ${CAMPAIGN_NAME_MAX_LENGTH} characters).`);
  }
  const slug = toSlug(campaignName);
  if (slug.length === 0 || !isCampaignDirName(slug)) {
    throw new Error('name must give a folder name (letters or numbers, not a reserved name).');
  }
  if (campaignModel.campaignFolderExists(deps.vaultPath, slug)) {
    throw new Error(`A folder named "${slug}" already exists in the Codex. Pick another name.`);
  }
  const campaignDescription =
    typeof description === 'string' && description.trim().length > 0
      ? description.trim().slice(0, CAMPAIGN_DESCRIPTION_MAX_LENGTH)
      : null;

  const realSource = await assertSource(sourcePath, deps.vaultPath);
  const walk = await walkSource(realSource, deps.isMedia);
  const sectionOfFolder = validateMapping(mapping, new Set(walk.notes.map((note) => note.top)));
  const resolve = createLinkResolver(walk.notes, walk.media);
  const mediaEntries = new Set(walk.media);

  const selected = walk.notes.filter((note) => sectionOfFolder.has(note.top));
  const unmapped = {};
  for (const note of walk.notes) {
    if (!sectionOfFolder.has(note.top)) {
      unmapped[note.top] = (unmapped[note.top] ?? 0) + 1;
    }
  }
  assertSize(selected, MAX_TOTAL_NOTE_BYTES, 'notes');

  // Pass 1: where every selected note goes, and which media they use.
  const takenByFolder = new Map();
  const placements = new Map();
  const renamed = [];
  let flattened = 0;
  const contents = new Map();
  const usedMedia = new Map();
  for (const note of selected) {
    const section = sectionOfFolder.get(note.top);
    const folderSegments = note.top === ROOT_KEY ? [] : note.rel.split('/').slice(1, -1);
    const subfolder = folderSegments.length > 0 ? toSlug(folderSegments[0]) : '';
    if (folderSegments.length > 1) {
      flattened += 1;
    }

    const folder = `${slug}/${section}${subfolder ? `/${subfolder}` : ''}`;
    if (!takenByFolder.has(folder)) {
      takenByFolder.set(folder, new Set());
    }
    const originalBase = noteBaseName(note.rel);
    const finalBase = takeFreeName(
      takenByFolder.get(folder),
      toSlug(originalBase) || 'note',
      MARKDOWN_EXTENSION,
    );
    if (finalBase !== originalBase) {
      renamed.push({ from: note.rel, to: `${folder}/${finalBase}${MARKDOWN_EXTENSION}` });
    }

    placements.set(note.rel, {
      kind: 'note',
      entry: note,
      originalBase,
      finalBase,
      section,
      fileName: `${finalBase}${MARKDOWN_EXTENSION}`,
      path: `${folder}/${finalBase}${MARKDOWN_EXTENSION}`,
    });

    const content = await fs.promises.readFile(note.abs, 'utf8');
    contents.set(note.rel, content);
    for (const link of parseMarkdownDocument(content, { sourcePath: note.rel }).links) {
      const target = resolve(link);
      if (target && mediaEntries.has(target)) {
        usedMedia.set(target.rel, target);
      }
    }
  }

  const mediaToCopy = includeAllMedia === true ? walk.media : [...usedMedia.values()];
  assertSize(mediaToCopy, MAX_TOTAL_MEDIA_BYTES, 'media files');
  const takenAssets = new Set();
  for (const entry of [...mediaToCopy].sort((a, b) => byName(a.rel, b.rel))) {
    const extension = path.posix.extname(entry.rel).toLowerCase();
    const base = toSlug(path.posix.basename(entry.rel, path.posix.extname(entry.rel))) || 'asset';
    const finalBase = takeFreeName(takenAssets, base, extension);
    placements.set(entry.rel, {
      kind: 'media',
      entry,
      finalBase,
      section: 'assets',
      fileName: `${finalBase}${extension}`,
      path: `${slug}/assets/${finalBase}${extension}`,
    });
  }

  // How a wikilink names a target: its bare name when no other imported file has it, else its scope path.
  const nameUses = new Map();
  for (const placed of placements.values()) {
    const key = `${placed.kind}:${(placed.kind === 'note' ? placed.finalBase : placed.fileName).toLowerCase()}`;
    nameUses.set(key, (nameUses.get(key) ?? 0) + 1);
  }
  const linkNameOf = (placed) => {
    const bare = placed.kind === 'note' ? placed.finalBase : placed.fileName;
    if (nameUses.get(`${placed.kind}:${bare.toLowerCase()}`) === 1) {
      return bare;
    }
    const scopePath = placed.path.slice(slug.length + 1);
    return placed.kind === 'note' ? scopePath.slice(0, -MARKDOWN_EXTENSION.length) : scopePath;
  };

  // Pass 2: the links of each note follow the new names and places.
  let rewrittenLinks = 0;
  let linksLeftAsWritten = 0;
  const notes = [];
  for (const note of selected) {
    const placed = placements.get(note.rel);
    const rewritten = rewriteLinks(
      contents.get(note.rel),
      (link) => {
        if (!link.targetPath) {
          return null;
        }

        const target = resolve(link);
        const targetPlaced = target ? placements.get(target.rel) : null;
        if (!targetPlaced) {
          linksLeftAsWritten += 1;
          return null;
        }
        if (link.syntax === 'markdown') {
          return toMarkdownHref(path.posix.dirname(placed.path), targetPlaced.path, link.raw);
        }

        const oldName = path.posix.basename(link.targetPath).replace(/\.md$/i, '');
        const newName = linkNameOf(targetPlaced);
        // The link keeps showing what it showed: a note's old name becomes the label once the file name is a slug.
        const shownAs =
          link.label ??
          (link.kind !== 'embed' &&
          oldName.toLowerCase() !== path.posix.basename(newName).toLowerCase()
            ? oldName
            : null);
        const raw = `${newName}${link.heading ? `#${link.heading}` : ''}${shownAs !== null ? `|${shownAs}` : ''}`;
        return raw === link.raw ? null : raw;
      },
      { sourcePath: note.rel },
    );
    rewrittenLinks += rewritten.count;

    // The file name is a slug now: the readable name moves into the title when the note shows none.
    let content = rewritten.content;
    const parsed = parseMarkdownDocument(content, { sourcePath: placed.path });
    if (!parsed.title && !parsed.frontmatterError) {
      content = setFrontmatterField(content, 'title', placed.originalBase);
    }
    notes.push({ ...placed, content });
  }

  const mediaPlaced = [...placements.values()].filter((placed) => placed.kind === 'media');
  const bySection = {};
  for (const note of notes) {
    bySection[note.section] = (bySection[note.section] ?? 0) + 1;
  }

  return {
    slug,
    name: campaignName,
    description: campaignDescription,
    notes,
    media: mediaPlaced,
    summary: {
      campaign: { slug, name: campaignName },
      notes: notes.length,
      mediaCopied: mediaPlaced.length,
      bySection,
      linksRewritten: rewrittenLinks,
      linksLeftAsWritten,
      foldersFlattenedToOneLevel: flattened,
      renamedBecauseTaken: renamed.slice(0, MAX_LISTED),
      renamedBecauseTakenCount: renamed.length,
      skipped: {
        foldersNotMapped: unmapped,
        mediaNotCopied: walk.media.length - mediaPlaced.length,
        unsupportedFiles: walk.unsupported,
        hiddenEntries: walk.skippedHidden,
        symlinks: walk.skippedSymlinks,
        emptyOrTooLargeFiles: walk.tooLargeCount,
      },
    },
  };
}

/**
 * Creates the new campaign and writes the planned files. Nothing is overwritten (the campaign is new). If a
 * write fails, the campaign folder made by this call is removed again, so no half import is left.
 */
async function executePlan(plan, deps) {
  const { vaultPath } = deps;
  // Outside the try: a folder that already exists is somebody else's, and must never be removed below.
  await campaignModel.createCampaign(vaultPath, {
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
  });
  const written = [`${plan.slug}/campaign.md`];

  try {
    for (const note of plan.notes) {
      const result = await documentModel.writeVaultFile(
        vaultPath,
        note.path,
        Buffer.from(note.content, 'utf8'),
      );
      if (result.status !== 'written') {
        throw new Error(`Could not write ${note.path}: the file exists.`);
      }
      written.push(note.path);
    }
    for (const media of plan.media) {
      // The source may have changed since the scan: only a plain file is copied, never a link someone put there.
      if (!(await fs.promises.lstat(media.entry.abs)).isFile()) {
        throw new Error(`${media.entry.rel} changed while importing.`);
      }

      const target = resolveInsideVault(vaultPath, media.path);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.copyFile(media.entry.abs, target, fs.constants.COPYFILE_EXCL);
      written.push(media.path);
    }
  } catch (error) {
    await fs.promises.rm(resolveInsideVault(vaultPath, plan.slug), {
      recursive: true,
      force: true,
    });
    throw error;
  }

  await deps.reindex(written);
  return { ...plan.summary, written: written.length };
}

/** Imports a source folder as a new campaign; with `dryRun` it only reports what would happen. */
async function importCampaign(input, deps) {
  const plan = await planImport(input, deps);
  if (input.dryRun === true) {
    return { dryRun: true, ...plan.summary };
  }

  return { dryRun: false, ...(await executePlan(plan, deps)) };
}

module.exports = {
  TARGET_SECTIONS,
  importCampaign,
  scanSource,
};
