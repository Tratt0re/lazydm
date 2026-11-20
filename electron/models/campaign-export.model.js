const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const yazl = require('yazl');
const { resolveInsideVault } = require('../utils/file-utils');
const { byName, comparable, isInside, takeFreeName } = require('../utils/path-utils');
const { ZIP_LIMITS } = require('../utils/zip-limits');
const { safeEntryPath } = require('../utils/zip-paths');
const bundleModel = require('./campaign-bundle.model');
const templateModel = require('./template.model');

/** Sections whose `.json` files are part of a campaign (encounters and maps); any other `.json` is not. */
const JSON_SECTIONS = Object.freeze(['encounters', 'maps']);
/** The party roster may hold the table's real names: it never leaves the Codex (design-principles §6g). */
const PARTY_ROSTER_PATH = 'encounters/_party.json';
/** Every file of a zip carries this date, so two exports of the same campaign are the same bytes. */
const FIXED_ENTRY_DATE = new Date(2000, 0, 1);
const FILE_MODE = 0o100644;

/** Why a file of the campaign is not in the zip. */
const SKIP_REASONS = Object.freeze({
  type: 'type',
  tooLarge: 'too-large',
  name: 'name',
  symlink: 'symlink',
  duplicate: 'duplicate',
  reserved: 'reserved',
});

/** What `collectCampaignFiles` cannot go on without: the campaign is too big to put in one zip. */
class ExportLimitError extends Error {
  constructor(what) {
    super(`The campaign is too big to export (${what}).`);
    this.name = 'ExportLimitError';
    this.code = 'limit';
  }
}

function kindOfFile(rel, name, isMedia) {
  const extension = path.posix.extname(name).toLowerCase();
  if (extension === '.md') {
    return 'text';
  }
  if (extension === '.json') {
    return JSON_SECTIONS.includes(rel.split('/')[0]) ? 'text' : null;
  }

  return isMedia(name) ? 'media' : null;
}

/**
 * The files of a campaign that go into its zip, by campaign-relative path in code-point order, and the ones left
 * out with the reason. Hidden files and folders and the party roster are left out without a mention (they are not a
 * loss the user needs to hear about); everything else that is skipped is listed.
 *
 * Only plain files are taken: a link, or anything that is not a file, is skipped. A file the importer would refuse
 * (a type it does not take, a name `safeEntryPath` rejects, a size over the caps, a name that differs from another
 * one only in case) is skipped here too, so what is exported can always be imported.
 *
 * `isMedia(name)` is the app's media test (`asset.controller`). Throws `ExportLimitError` past the entry or total
 * size cap.
 */
async function collectCampaignFiles(vaultPath, slug, isMedia, limits = ZIP_LIMITS) {
  const root = resolveInsideVault(vaultPath, slug);
  const files = [];
  const skipped = [];
  const seen = new Set();
  let visited = 0;
  let totalBytes = 0;

  async function walk(relativeDirectory) {
    const directory = relativeDirectory ? path.join(root, relativeDirectory) : root;
    const names = (await fs.promises.readdir(directory)).sort(byName);
    for (const name of names) {
      if (name.startsWith('.')) {
        continue;
      }

      visited += 1;
      if (visited > limits.maxEntries) {
        throw new ExportLimitError('too many files');
      }

      const rel = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const absolute = path.join(directory, name);
      const stat = await fs.promises.lstat(absolute);
      if (stat.isSymbolicLink()) {
        skipped.push({ path: rel, reason: SKIP_REASONS.symlink });
        continue;
      }
      if (stat.isDirectory()) {
        await walk(rel);
        continue;
      }
      if (!stat.isFile() || comparable(rel) === PARTY_ROSTER_PATH) {
        continue;
      }
      if (rel === bundleModel.MANIFEST_FILE_NAME) {
        skipped.push({ path: rel, reason: SKIP_REASONS.reserved });
        continue;
      }

      const kind = kindOfFile(rel, name, isMedia);
      if (kind === null) {
        skipped.push({ path: rel, reason: SKIP_REASONS.type });
        continue;
      }

      const limit = kind === 'media' ? limits.maxMediaBytes : limits.maxTextBytes;
      if (stat.size > limit) {
        skipped.push({ path: rel, reason: SKIP_REASONS.tooLarge });
        continue;
      }

      try {
        safeEntryPath(`${slug}/${rel}`);
      } catch {
        skipped.push({ path: rel, reason: SKIP_REASONS.name });
        continue;
      }

      if (seen.has(comparable(rel))) {
        skipped.push({ path: rel, reason: SKIP_REASONS.duplicate });
        continue;
      }

      totalBytes += stat.size;
      if (totalBytes > limits.maxTotalBytes) {
        throw new ExportLimitError('too many bytes');
      }

      seen.add(comparable(rel));
      files.push({ rel, absolute, size: stat.size });
    }
  }

  await walk('');
  return { files, skipped, totalBytes };
}

/**
 * The templates a campaign uses that live outside its own `_templates/` (the Codex root, a compendium system): each
 * one is copied into the zip's `_templates/`, and the manifest points at the copy. `takenNames` are the file names
 * already in the campaign's `_templates/` (lower case); a name taken gets a `-2` suffix. Built-in choices stay
 * references, and a choice whose file is gone is left out (`buildManifest` lists it as dropped).
 */
function collectExternalTemplates(vaultPath, slug, takenNames) {
  const taken = new Set(takenNames);
  const ownPrefix = `${slug}/${bundleModel.BUNDLE_TEMPLATES_DIR}/`;
  const map = new Map();
  const files = [];

  for (const choice of Object.values(templateModel.readCampaignRules(vaultPath, slug))) {
    if (
      templateModel.isBuiltInTemplateChoice(choice) ||
      choice.startsWith(ownPrefix) ||
      map.has(choice) ||
      !templateModel.templateExists(vaultPath, choice)
    ) {
      continue;
    }

    const base = path.posix.basename(choice, '.md');
    const zipRel = `${bundleModel.BUNDLE_TEMPLATES_DIR}/${takeFreeName(taken, base, '.md')}.md`;
    try {
      safeEntryPath(`${slug}/${zipRel}`);
    } catch {
      continue;
    }

    map.set(choice, zipRel);
    files.push({ rel: zipRel, absolute: resolveInsideVault(vaultPath, choice) });
  }

  return { map, files };
}

/**
 * Checks where a zip is to be written: an absolute path ending in `.zip`, in a folder that exists. With
 * `allowInsideVault: false` (the MCP tool) the Codex is off limits, and with `overwrite: false` the file must not
 * exist yet. Returns the path.
 */
async function assertDestination(destination, { vaultPath, allowInsideVault, overwrite }) {
  if (typeof destination !== 'string' || !path.isAbsolute(destination)) {
    throw new Error('The destination must be an absolute path.');
  }
  if (path.extname(destination).toLowerCase() !== '.zip') {
    throw new Error('The destination must end with .zip.');
  }

  let parent;
  try {
    parent = await fs.promises.realpath(path.dirname(destination));
  } catch {
    throw new Error('The destination folder does not exist.');
  }
  if (!(await fs.promises.stat(parent)).isDirectory()) {
    throw new Error('The destination folder does not exist.');
  }
  if (!allowInsideVault && isInside(await fs.promises.realpath(vaultPath), parent)) {
    throw new Error('The destination must be outside the Codex.');
  }

  const target = path.join(parent, path.basename(destination));
  if (!overwrite && fs.existsSync(target)) {
    throw new Error('A file with that name already exists.');
  }
  if (fs.existsSync(target) && (await fs.promises.lstat(target)).isDirectory()) {
    throw new Error('The destination is a folder.');
  }

  return target;
}

/** Streams every entry into a `yazl` zip written to `tempPath`; on any error the stream is closed and it rejects. */
async function writeZip(tempPath, slug, manifest, files) {
  const zip = new yazl.ZipFile();
  const output = fs.createWriteStream(tempPath, { flags: 'wx' });
  const written = pipeline(zip.outputStream, output);
  const fail = (error) => zip.outputStream.destroy(error);
  zip.on('error', fail);

  const options = { mtime: FIXED_ENTRY_DATE, mode: FILE_MODE };
  zip.addBuffer(
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    `${slug}/${bundleModel.MANIFEST_FILE_NAME}`,
    options,
  );
  for (const file of files) {
    zip.addReadStreamLazy(`${slug}/${file.rel}`, options, (callback) => {
      const stream = fs.createReadStream(file.absolute);
      stream.on('error', fail);
      callback(null, stream);
    });
  }
  zip.end();

  await written;
}

/**
 * Exports the campaign `slug` as a zip at `destination` (checked by `assertDestination`). The zip is written to a
 * temporary file next to it and moved into place when it is complete, so a failure leaves nothing half-written.
 * Read-only on the Codex. Returns `{ path, files, bytes, skipped, droppedTemplates }`.
 */
async function exportCampaign(
  vaultPath,
  slug,
  destination,
  { isMedia, appVersion = null, allowInsideVault = true, overwrite = true },
) {
  const target = await assertDestination(destination, { vaultPath, allowInsideVault, overwrite });

  const collected = await collectCampaignFiles(vaultPath, slug, isMedia);
  const ownTemplates = collected.files
    .filter((file) => file.rel.startsWith(`${bundleModel.BUNDLE_TEMPLATES_DIR}/`))
    .map((file) => path.posix.basename(file.rel).toLowerCase());
  const external = collectExternalTemplates(vaultPath, slug, ownTemplates);
  const { manifest, dropped } = await bundleModel.buildManifest(vaultPath, slug, {
    templateMap: external.map,
    appVersion,
  });

  const files = [...collected.files, ...external.files];
  const tempPath = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}-${Date.now()}.part`,
  );
  try {
    await writeZip(tempPath, slug, manifest, files);
    if (!overwrite && fs.existsSync(target)) {
      throw new Error('A file with that name already exists.');
    }

    await fs.promises.rename(tempPath, target);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  }

  return {
    path: target,
    files: files.length + 1,
    bytes: (await fs.promises.stat(target)).size,
    skipped: collected.skipped,
    droppedTemplates: dropped.length,
  };
}

module.exports = {
  ExportLimitError,
  PARTY_ROSTER_PATH,
  SKIP_REASONS,
  assertDestination,
  collectCampaignFiles,
  collectExternalTemplates,
  exportCampaign,
};
