const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { resolveInsideVault, safeWriteFileAtomic } = require('../utils/file-utils');
const { parseMarkdownDocument } = require('../utils/markdown-parse');
const { takeFreeName } = require('../utils/path-utils');
const { toSlug } = require('../utils/string-sanitize');
const { ZIP_LIMITS } = require('../utils/zip-limits');
const {
  ENTRY_SKIPS,
  ZIP_REFUSALS,
  ZipRefusedError,
  openEntryStream,
  openZip,
  readEntryBuffer,
} = require('../utils/zip-reader');
const bundleModel = require('./campaign-bundle.model');
const campaignModel = require('./campaign.model');
const documentModel = require('./document.model');
const encounterModel = require('./encounter.model');
const mapModel = require('./map.model');
const templateModel = require('./template.model');

/** How many skipped files a preview lists; the rest are only counted. */
const MAX_LISTED_SKIPS = 20;
/** Sections whose `.json` files belong to a campaign (the same two the export takes). */
const JSON_SECTIONS = Object.freeze(['encounters', 'maps']);
const PARTY_ROSTER_PATH = 'encounters/_party.json';
const CARD_FILE = 'campaign.md';
const AGENT_RULES_FILE = 'agents.md';
const TEMPLATES_PREFIX = `${bundleModel.BUNDLE_TEMPLATES_DIR}/`;
const NAME_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;
const FALLBACK_SLUG = 'imported-campaign';
/** Top-level folders of a Codex that are not campaigns: a new campaign never takes these names. */
const RESERVED_FOLDERS = Object.freeze(['_templates', 'compendium']);
/** Tries to find a free folder when another process creates one in the meantime. */
const CREATE_ATTEMPTS = 5;

/** Why a file of the zip is not taken. A hidden file is never listed (it is not a loss the user needs to hear of). */
const IMPORT_SKIPS = Object.freeze({
  type: 'type',
  tooLarge: 'too-large',
  name: 'name',
  party: 'party',
  invalid: 'invalid',
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
 * Checks a zip as a whole and sorts its files: the ones this app takes (`taken`, each with its kind and entry), the
 * ones it leaves out (`skipped`, with a reason), the manifest and the card it holds. Throws a `ZipRefusedError` for
 * what makes the zip unusable: more than one top-level folder, files outside a folder, a manifest from a newer
 * version. Reads only the manifest and the card; nothing is written.
 */
async function inspectArchive(archive, isMedia, limits) {
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

  let cardText = null;
  let card = null;
  const cardFile = taken.find((file) => file.kind === 'card');
  if (cardFile) {
    cardText = (
      await readEntryBuffer(archive, cardFile.entry, { maxBytes: limits.maxTextBytes })
    ).toString('utf8');
    card = parseMarkdownDocument(cardText, { sourcePath: `${folderName}/${CARD_FILE}` });
  }

  // The game system must be one the app ships: anything else is generic, and the preview says so.
  let system = manifest?.system ?? 'generic';
  if (!manifest) {
    const cardSystem = readCardField(card, 'system');
    if (cardSystem !== null && templateModel.isBuiltInSystem(cardSystem)) {
      system = cardSystem;
    } else if (cardSystem !== null) {
      warnings.push({ code: 'unknown-system', field: 'system' });
    }
  }

  const title =
    manifest?.title ??
    bundleModel.toText(readCardField(card, 'title'), NAME_MAX_LENGTH) ??
    folderName;
  const description =
    manifest?.description ??
    bundleModel.toText(readCardField(card, 'description'), DESCRIPTION_MAX_LENGTH);

  return {
    folderName,
    taken,
    skipped,
    manifest,
    warnings,
    cardText,
    title,
    description,
    system,
  };
}

function countsOf(taken) {
  const count = (kind) => taken.filter((file) => file.kind === kind).length;
  return {
    notes: count('note'),
    assets: count('asset'),
    encounters: count('encounters'),
    maps: count('maps'),
    templates: count('template'),
  };
}

function toPreview(info) {
  return {
    folderName: info.folderName,
    title: info.title,
    description: info.description,
    system: info.system,
    hasManifest: info.manifest !== null,
    formatVersion: info.manifest?.formatVersion ?? null,
    counts: countsOf(info.taken),
    hasAgentRules: info.taken.some((file) => file.kind === 'agents'),
    skipped: info.skipped.slice(0, MAX_LISTED_SKIPS),
    skippedTotal: info.skipped.length,
    warnings: info.warnings,
    files: info.taken.length,
    bytes: info.taken.reduce((sum, file) => sum + file.entry.uncompressedSize, 0),
  };
}

/**
 * What a campaign zip holds, without writing anything (design-principles §6g): the campaign's name, game system and
 * description, counts per kind, what would be left out and why, and warnings about its settings. Throws a
 * `ZipRefusedError` when the zip as a whole cannot be taken.
 *
 * The result is a preview, not a promise: the import reads the zip again and checks everything again.
 */
async function scanBundle(zipPath, { isMedia, limits = ZIP_LIMITS }) {
  const archive = await openZip(zipPath, limits);
  try {
    return toPreview(await inspectArchive(archive, isMedia, limits));
  } finally {
    archive.close();
  }
}

/** The names already taken at the top of the Codex, lower case, plus the folders no campaign may have. */
async function takenFolderNames(vaultPath) {
  const names = await fs.promises.readdir(vaultPath);
  return new Set([...names, ...RESERVED_FOLDERS].map((name) => name.toLowerCase()));
}

/**
 * Creates the new campaign's folder and card under a free name: the slug of `displayName`, `-2`, `-3`… when taken.
 * Never uses an existing folder: `createCampaign` fails when the folder exists, so another process creating the
 * same name in the meantime only makes this try the next one.
 */
async function createFreeCampaign(vaultPath, displayName, folderName, card) {
  const base = toSlug(displayName) || toSlug(folderName) || FALLBACK_SLUG;
  const taken = await takenFolderNames(vaultPath);
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
    const slug = takeFreeName(taken, base, '');
    try {
      await campaignModel.createCampaign(vaultPath, { slug, name: displayName, ...card });
      return slug;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  throw new Error('Could not find a free name for the campaign.');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * An encounter or a map as the app itself would read it: parsed, then normalised (unknown fields dropped, ids made
 * unique, paths and sizes checked). null when the file is not a JSON object, so it is skipped and listed.
 */
function normalizeJsonFile(kind, rel, buffer) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) {
    return null;
  }

  const fallbackName = path.posix.basename(rel, '.json');
  const value =
    kind === 'encounters'
      ? encounterModel.normalizeEncounter(parsed, fallbackName)
      : mapModel.normalizeMap(parsed, fallbackName);
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Writes one file of the zip into the new campaign. Returns false when it was skipped (an unusable JSON). */
async function writeEntry(archive, vaultPath, slug, file, { limits, budget }) {
  const vaultRel = `${slug}/${file.rel}`;
  if (file.kind === 'asset') {
    const target = resolveInsideVault(vaultPath, vaultRel);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const stream = await openEntryStream(archive, file.entry, {
      maxBytes: limits.maxMediaBytes,
      budget,
    });
    await pipeline(stream, fs.createWriteStream(target, { flags: 'wx' }));
    return true;
  }

  let bytes = await readEntryBuffer(archive, file.entry, { maxBytes: limits.maxTextBytes, budget });
  if (file.kind === 'encounters' || file.kind === 'maps') {
    bytes = normalizeJsonFile(file.kind, file.rel, bytes);
    if (bytes === null) {
      return false;
    }
  }

  const result = await documentModel.writeVaultFile(vaultPath, vaultRel, bytes);
  if (result.status !== 'written') {
    throw new Error(`Could not write ${vaultRel}: the file exists.`);
  }
  return true;
}

/**
 * Puts the zip's own card in place of the plain one `createCampaign` made (it may carry a cover or an overview),
 * then sets the name, description and system, which stay the importer's: the user may have renamed the campaign in
 * the preview, and the system must be one the app ships.
 */
async function writeCard(vaultPath, slug, info, displayName, system) {
  safeWriteFileAtomic(resolveInsideVault(vaultPath, `${slug}/${CARD_FILE}`), info.cardText);
  const card = await campaignModel.readCampaign(vaultPath, slug);
  await campaignModel.updateCampaign(vaultPath, slug, {
    name: displayName,
    description: info.description,
    icon: card?.icon ?? null,
    system,
  });
}

/**
 * Imports a campaign zip as a **new** campaign (design-principles §6g): never merged into one that exists, never
 * overwriting anything. `name` (optional) is the campaign's name; otherwise the zip's title. The folder is the slug
 * of the name, with `-2`, `-3`… when taken.
 *
 * The zip is opened and checked again here, whatever a scan said, because the file may have changed since. Every
 * byte is counted as it is read. If anything fails after the campaign folder was created, the folder is removed and
 * so are its settings, then the error is thrown (a `ZipRefusedError` when the zip was bad). `reindex(paths)` is
 * called with every vault path written.
 *
 * Returns `{ slug, name, files, skipped, skippedTotal, warnings, counts }`.
 */
async function importBundle(
  vaultPath,
  zipPath,
  { name = null, isMedia, reindex, limits = ZIP_LIMITS },
) {
  const archive = await openZip(zipPath, limits);
  try {
    const info = await inspectArchive(archive, isMedia, limits);
    const displayName = bundleModel.toText(name, NAME_MAX_LENGTH) ?? info.title;
    const system = info.system === 'generic' ? null : info.system;

    // Outside the try below: a folder that already existed is somebody else's and must never be removed.
    const slug = await createFreeCampaign(vaultPath, displayName, info.folderName, {
      description: info.description,
      system,
    });
    const written = [`${slug}/${CARD_FILE}`];
    const skipped = [...info.skipped];
    const warnings = [...info.warnings];
    const budget = { remaining: limits.maxTotalBytes };

    try {
      for (const file of info.taken) {
        if (file.kind === 'manifest') {
          continue;
        }
        if (file.kind === 'card') {
          await writeCard(vaultPath, slug, info, displayName, system);
        } else if (await writeEntry(archive, vaultPath, slug, file, { limits, budget })) {
          written.push(`${slug}/${file.rel}`);
        } else {
          skipped.push({ path: file.rel, reason: IMPORT_SKIPS.invalid });
        }
      }

      // Last: a template choice needs its file, and a custom section keeps its folder only when it exists.
      if (info.manifest) {
        warnings.push(...bundleModel.applyManifest(vaultPath, slug, info.manifest).warnings);
      }
    } catch (error) {
      await fs.promises.rm(resolveInsideVault(vaultPath, slug), { recursive: true, force: true });
      campaignModel.forgetCampaignSettings(vaultPath, slug);
      throw error;
    }

    await reindex(written);
    return {
      slug,
      name: displayName,
      files: written.length,
      skipped: skipped.slice(0, MAX_LISTED_SKIPS),
      skippedTotal: skipped.length,
      warnings,
      counts: countsOf(info.taken),
    };
  } finally {
    archive.close();
  }
}

module.exports = {
  IMPORT_SKIPS,
  MAX_LISTED_SKIPS,
  importBundle,
  kindOfEntry,
  scanBundle,
};
