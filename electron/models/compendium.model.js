const fs = require('node:fs');
const YAML = require('yaml');
const { resolveInsideVault, safeWriteFileAtomic, trashVaultItem } = require('../utils/file-utils');
const { parseMarkdownDocument } = require('../utils/markdown-parse');
const { listVaultFiles } = require('./vault.model');

const COMPENDIUM_DIR_NAME = 'compendium';
const SYSTEM_FILE_NAME = 'system.md';
const SYSTEM_NOTE_TYPE = 'system';

function getSystemPath(slug) {
  return `${COMPENDIUM_DIR_NAME}/${slug}`;
}

function isSystemDirName(dirName) {
  return !dirName.startsWith('.') && !dirName.startsWith('_');
}

function toOptionalString(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Folders a system currently has (they appear when something is created or copied into them). */
async function listSystemFolders(rootPath, slug) {
  const entries = await fs.promises.readdir(resolveInsideVault(rootPath, getSystemPath(slug)), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/** A system of the compendium: a cross-campaign folder with a `system.md` card (name optional). */
async function readSystem(rootPath, slug) {
  const systemPath = resolveInsideVault(rootPath, getSystemPath(slug));
  if (!fs.existsSync(systemPath) || !fs.statSync(systemPath).isDirectory()) {
    return null;
  }

  const cardPath = resolveInsideVault(rootPath, `${getSystemPath(slug)}/${SYSTEM_FILE_NAME}`);
  const document = fs.existsSync(cardPath)
    ? parseMarkdownDocument(await fs.promises.readFile(cardPath, 'utf8'), {
        sourcePath: `${getSystemPath(slug)}/${SYSTEM_FILE_NAME}`,
      })
    : null;

  return {
    slug,
    path: getSystemPath(slug),
    name: toOptionalString(document?.frontmatter.title) ?? document?.title ?? slug,
    description: toOptionalString(document?.frontmatter.description),
    created: toOptionalString(document?.frontmatter.created),
    folders: await listSystemFolders(rootPath, slug),
  };
}

async function listSystems(rootPath) {
  const compendiumPath = resolveInsideVault(rootPath, COMPENDIUM_DIR_NAME);
  if (!fs.existsSync(compendiumPath)) {
    return [];
  }

  const entries = await fs.promises.readdir(compendiumPath, { withFileTypes: true });
  const systems = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSystemDirName(entry.name)) {
      continue;
    }

    try {
      systems.push(await readSystem(rootPath, entry.name));
    } catch (error) {
      console.warn('[electron] Failed to read compendium system ->', entry.name, error);
    }
  }

  return systems.filter(Boolean).sort((left, right) => left.name.localeCompare(right.name));
}

function systemFolderExists(rootPath, slug) {
  return fs.existsSync(resolveInsideVault(rootPath, getSystemPath(slug)));
}

/** Creates `compendium/<slug>/` with its `system.md` card only; section folders appear on demand. */
async function createSystem(rootPath, { slug, name, description }) {
  await fs.promises.mkdir(resolveInsideVault(rootPath, getSystemPath(slug)), { recursive: true });
  const frontmatter = {
    type: SYSTEM_NOTE_TYPE,
    title: name,
    ...(description ? { description } : {}),
    created: new Date().toISOString().slice(0, 10),
  };
  const body = description ? `# ${name}\n\n${description}\n` : `# ${name}\n`;
  safeWriteFileAtomic(
    resolveInsideVault(rootPath, `${getSystemPath(slug)}/${SYSTEM_FILE_NAME}`),
    `---\n${YAML.stringify(frontmatter)}---\n${body}`,
  );

  return readSystem(rootPath, slug);
}

async function countSystemFiles(rootPath, slug) {
  return (await listVaultFiles(rootPath, getSystemPath(slug))).length;
}

/** Sends a system folder and everything in it to the system Trash (recoverable). */
async function deleteSystem(rootPath, slug) {
  await trashVaultItem(resolveInsideVault(rootPath, getSystemPath(slug)));
}

module.exports = {
  COMPENDIUM_DIR_NAME,
  countSystemFiles,
  createSystem,
  deleteSystem,
  getSystemPath,
  isSystemDirName,
  listSystems,
  readSystem,
  systemFolderExists,
};
