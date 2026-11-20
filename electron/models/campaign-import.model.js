const path = require('node:path');
const { parseMarkdownDocument } = require('../utils/markdown-parse');
const { ZIP_LIMITS } = require('../utils/zip-limits');
const {
  ENTRY_SKIPS,
  ZIP_REFUSALS,
  ZipRefusedError,
  openZip,
  readEntryBuffer,
} = require('../utils/zip-reader');
const bundleModel = require('./campaign-bundle.model');

/** How many skipped files a preview lists; the rest are only counted. */
const MAX_LISTED_SKIPS = 20;
/** Sections whose `.json` files belong to a campaign (the same two the export takes). */
const JSON_SECTIONS = Object.freeze(['encounters', 'maps']);
const PARTY_ROSTER_PATH = 'encounters/_party.json';
const CARD_FILE = 'campaign.md';
const AGENT_RULES_FILE = 'agents.md';
const TEMPLATES_PREFIX = `${bundleModel.BUNDLE_TEMPLATES_DIR}/`;

/** Why a file of the zip is not taken. A hidden file is never listed (it is not a loss the user needs to hear of). */
const IMPORT_SKIPS = Object.freeze({
  type: 'type',
  tooLarge: 'too-large',
  name: 'name',
  party: 'party',
});

/**
 * Where a file of the zip goes, from its path inside the campaign folder: the manifest, the card, the agent rules,
 * a template, an encounter, a map, a note or an asset; or null for a file this app does not take.
 */
function kindOfEntry(rel, isMedia) {
  if (rel === bundleModel.MANIFEST_FILE_NAME) {
    return 'manifest';
  }
  if (rel === CARD_FILE) {
    return 'card';
  }
  if (rel === AGENT_RULES_FILE) {
    return 'agents';
  }

  const extension = path.posix.extname(rel).toLowerCase();
  const segments = rel.split('/');
  if (extension === '.md') {
    return rel.startsWith(TEMPLATES_PREFIX) && segments.length === 2 ? 'template' : 'note';
  }
  if (extension === '.json') {
    return JSON_SECTIONS.includes(segments[0]) && segments.length > 1 ? segments[0] : null;
  }

  return isMedia(path.posix.basename(rel)) ? 'asset' : null;
}

/** A plain string from a card's frontmatter, or null; the card is untrusted, so nothing else is taken. */
function readCardField(card, key) {
  const value = card?.frontmatter?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * What a campaign zip holds, without writing anything (design-principles §6g): the campaign's name, game system and
 * description, counts per kind, what would be left out and why, and warnings about its settings. Throws a
 * `ZipRefusedError` when the zip as a whole cannot be taken: not a zip, a hostile path, a link, more than one
 * top-level folder, a manifest from a newer version…
 *
 * The result is a preview, not a promise: the import reads the zip again and checks everything again.
 */
async function scanBundle(zipPath, { isMedia, limits = ZIP_LIMITS }) {
  const archive = await openZip(zipPath, limits);
  try {
    return await describeArchive(archive, isMedia, limits);
  } finally {
    archive.close();
  }
}

async function describeArchive(archive, isMedia, limits) {
  const taken = [];
  const skipped = [];
  const folders = new Set();

  for (const entry of archive.entries) {
    const segments = entry.name.split('/');
    folders.add(segments[0].normalize('NFC').toLowerCase());
    if (entry.isDirectory) {
      continue;
    }
    if (segments.length < 2) {
      throw new ZipRefusedError(ZIP_REFUSALS.noFolder);
    }

    const rel = segments.slice(1).join('/');
    if (entry.skipReason === ENTRY_SKIPS.hidden) {
      continue;
    }
    if (entry.skipReason !== null) {
      skipped.push({ path: rel, reason: IMPORT_SKIPS.name });
      continue;
    }
    if (rel === PARTY_ROSTER_PATH) {
      skipped.push({ path: rel, reason: IMPORT_SKIPS.party });
      continue;
    }

    const kind = kindOfEntry(rel, isMedia);
    if (kind === null) {
      skipped.push({ path: rel, reason: IMPORT_SKIPS.type });
      continue;
    }

    const cap = kind === 'asset' ? limits.maxMediaBytes : limits.maxTextBytes;
    if (entry.uncompressedSize > cap) {
      skipped.push({ path: rel, reason: IMPORT_SKIPS.tooLarge });
      continue;
    }

    taken.push({ rel, kind, entry });
  }

  if (folders.size > 1) {
    throw new ZipRefusedError(ZIP_REFUSALS.multipleFolders);
  }

  const folderName = archive.entries.find((entry) => !entry.isDirectory)?.name.split('/')[0];
  if (!folderName) {
    throw new ZipRefusedError(ZIP_REFUSALS.noFolder);
  }

  const warnings = [];
  let manifest = null;
  const manifestFile = taken.find((file) => file.kind === 'manifest');
  if (manifestFile) {
    const raw = await readEntryBuffer(archive, manifestFile.entry, {
      maxBytes: limits.maxTextBytes,
    });
    try {
      const parsed = bundleModel.parseManifest(raw);
      manifest = parsed.manifest;
      warnings.push(...parsed.warnings);
    } catch (error) {
      if (!(error instanceof bundleModel.ManifestError)) {
        throw error;
      }
      if (error.code === bundleModel.MANIFEST_ERRORS.newerVersion) {
        throw new ZipRefusedError(ZIP_REFUSALS.newerVersion);
      }

      warnings.push({ code: 'manifest-unreadable', field: 'manifest' });
    }
  }

  let card = null;
  const cardFile = taken.find((file) => file.kind === 'card');
  if (cardFile) {
    const text = (
      await readEntryBuffer(archive, cardFile.entry, { maxBytes: limits.maxTextBytes })
    ).toString('utf8');
    card = parseMarkdownDocument(text, { sourcePath: `${folderName}/${CARD_FILE}` });
  }

  const count = (kind) => taken.filter((file) => file.kind === kind).length;
  return {
    folderName,
    title: manifest?.title ?? readCardField(card, 'title') ?? folderName,
    description: manifest?.description ?? readCardField(card, 'description'),
    system: manifest?.system ?? readCardField(card, 'system') ?? 'generic',
    hasManifest: manifest !== null,
    formatVersion: manifest?.formatVersion ?? null,
    counts: {
      notes: count('note'),
      assets: count('asset'),
      encounters: count('encounters'),
      maps: count('maps'),
      templates: count('template'),
    },
    hasAgentRules: count('agents') > 0,
    skipped: skipped.slice(0, MAX_LISTED_SKIPS),
    skippedTotal: skipped.length,
    warnings,
    files: taken.length,
    bytes: taken.reduce((sum, file) => sum + file.entry.uncompressedSize, 0),
  };
}

module.exports = {
  IMPORT_SKIPS,
  MAX_LISTED_SKIPS,
  kindOfEntry,
  scanBundle,
};
