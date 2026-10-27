const fs = require('node:fs');
const path = require('node:path');
const { createBaseModel } = require('./base-model');
const { resolveInsideVault, safeWriteFileAtomic } = require('../utils/file-utils');

const VAULT_CONFIG_DIR_NAME = '.lazydm';
const VAULT_CONFIG_FILE_NAME = 'vault.json';
/** Vault format version: older vaults are migrated when opened (see vault-migration.model.js). */
const VAULT_CONFIG_SCHEMA_VERSION = 2;
const VAULT_DEFAULT_DIR_NAMES = Object.freeze(['_templates', 'compendium']);

const vaultBaseModel = createBaseModel('vaults');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getByPath(vaultPath) {
  const [row] = vaultBaseModel.list({ path: vaultPath }, { limit: 1 });
  return row ?? null;
}

function getVaultConfigPath(rootPath) {
  return resolveInsideVault(rootPath, path.join(VAULT_CONFIG_DIR_NAME, VAULT_CONFIG_FILE_NAME));
}

function hasVaultConfig(rootPath) {
  return fs.existsSync(getVaultConfigPath(rootPath));
}

function readVaultConfig(rootPath) {
  const configPath = getVaultConfigPath(rootPath);
  if (!fs.existsSync(configPath)) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`Vault config is not valid JSON: ${configPath} (${error.message})`, {
      cause: error,
    });
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Vault config is not a JSON object: ${configPath}`);
  }

  return parsed;
}

function writeVaultConfig(rootPath, config) {
  if (!isPlainObject(config)) {
    throw new Error('config must be a plain object.');
  }

  safeWriteFileAtomic(getVaultConfigPath(rootPath), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function createDefaultVaultConfig(name) {
  return {
    schemaVersion: VAULT_CONFIG_SCHEMA_VERSION,
    name,
    createdAtMs: Date.now(),
  };
}

function ensureVaultStructure(rootPath) {
  for (const dirName of [VAULT_CONFIG_DIR_NAME, ...VAULT_DEFAULT_DIR_NAMES]) {
    fs.mkdirSync(resolveInsideVault(rootPath, dirName), { recursive: true });
  }
}

function isDirectoryEmpty(directoryPath) {
  return (
    fs.readdirSync(directoryPath).filter((entryName) => !entryName.startsWith('.')).length === 0
  );
}

/** A top-level folder holds a campaign unless it is hidden or vault-level (`_templates`, `compendium`…). */
function isCampaignDirName(dirName) {
  return (
    !dirName.startsWith('.') &&
    !dirName.startsWith('_') &&
    !VAULT_DEFAULT_DIR_NAMES.includes(dirName)
  );
}

/** Hidden entries (`.lazydm`, `.obsidian`, `.git`, `.DS_Store`, iCloud `.name.icloud` placeholders…) are not vault content. */
function isIgnoredVaultPath(relativePath) {
  return relativePath.split('/').some((segment) => segment.startsWith('.'));
}

function toVaultRelativePath(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).split(path.sep).join('/');
}

/**
 * A cloud placeholder whose content is not downloaded yet: it reports a size but occupies no disk block.
 * Reliable for File Provider drives on macOS (iCloud, Box, Dropbox, OneDrive, Google Drive).
 * Never true on Windows: NTFS keeps small files inside the file table, so a note that is fully local
 * can report no blocks. A placeholder there is fetched when it is read, so nothing is waited for.
 */
function isDatalessStats(stats, platform = process.platform) {
  return platform !== 'win32' && stats.size > 0 && stats.blocks === 0;
}

/**
 * Lists every content file of the vault (or of one of its folders) with the stats the index reconciles on.
 *
 * @returns {Promise<{ path: string, size: number, mtimeMs: number, isDataless: boolean }[]>} Vault-relative POSIX paths.
 */
async function listVaultFiles(rootPath, relativeDir = '') {
  const files = [];
  const realRootPath = resolveInsideVault(rootPath);
  const pendingDirs = [resolveInsideVault(realRootPath, relativeDir)];

  while (pendingDirs.length > 0) {
    const directoryPath = pendingDirs.pop();
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const absolutePath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(absolutePath);
      } else if (entry.isFile()) {
        const stats = await fs.promises.stat(absolutePath);
        files.push({
          path: toVaultRelativePath(realRootPath, absolutePath),
          size: stats.size,
          mtimeMs: Math.trunc(stats.mtimeMs),
          isDataless: isDatalessStats(stats),
        });
      }
    }
  }

  return files;
}

module.exports = {
  ...vaultBaseModel,
  VAULT_CONFIG_SCHEMA_VERSION,
  createDefaultVaultConfig,
  ensureVaultStructure,
  getByPath,
  hasVaultConfig,
  isCampaignDirName,
  isDatalessStats,
  isDirectoryEmpty,
  isIgnoredVaultPath,
  listVaultFiles,
  readVaultConfig,
  writeVaultConfig,
};
