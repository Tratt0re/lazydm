const fs = require('node:fs');
const path = require('node:path');
const { createBaseModel } = require('./base-model');
const { resolveInsideVault, safeWriteFileAtomic } = require('../utils/file-utils');

const VAULT_CONFIG_DIR_NAME = '.lazydm';
const VAULT_CONFIG_FILE_NAME = 'vault.json';
const VAULT_CONFIG_SCHEMA_VERSION = 1;
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

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
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
  return fs.readdirSync(directoryPath).filter((entryName) => !entryName.startsWith('.')).length === 0;
}

module.exports = {
  ...vaultBaseModel,
  createDefaultVaultConfig,
  ensureVaultStructure,
  getByPath,
  hasVaultConfig,
  isDirectoryEmpty,
  readVaultConfig,
  writeVaultConfig,
};
