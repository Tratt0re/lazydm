const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const INDEX_SCHEMA_FILE_PATH = path.join(__dirname, 'index-schemas', '000_vault_index.sql');
const INDEX_SCHEMA_VERSION = 1;
const INDEX_SCHEMA_VERSION_KEY = 'schema_version';

let indexDb = null;
let indexDbVaultId = null;

function getVaultIndexDatabasePath(vaultId) {
  if (typeof vaultId !== 'string' || vaultId.trim().length === 0) {
    throw new Error('vaultId must be a non-empty string.');
  }

  const indexDir = path.join(app.getPath('userData'), 'data', 'index');
  fs.mkdirSync(indexDir, { recursive: true });
  return path.join(indexDir, `${vaultId.trim()}.sqlite`);
}

function readSchemaVersion(database) {
  try {
    const row = database
      .prepare('SELECT value FROM index_meta WHERE key = ?')
      .get(INDEX_SCHEMA_VERSION_KEY);
    return Number(row?.value);
  } catch (_) {
    return Number.NaN;
  }
}

function removeDatabaseFiles(databasePath) {
  for (const filePath of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function connect(databasePath) {
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  return database;
}

function initIndexSchema(database) {
  database.exec(fs.readFileSync(INDEX_SCHEMA_FILE_PATH, 'utf8'));
  database
    .prepare(
      `INSERT INTO index_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(INDEX_SCHEMA_VERSION_KEY, String(INDEX_SCHEMA_VERSION));
}

/**
 * Opens the rebuildable index database of a vault. A file with another schema version
 * is deleted and recreated: the index never migrates, it is rebuilt from the vault files.
 */
function openVaultIndexDatabase(vaultId) {
  if (indexDb && indexDbVaultId === vaultId) {
    return indexDb;
  }

  closeVaultIndexDatabase();

  const databasePath = getVaultIndexDatabasePath(vaultId);
  let database = connect(databasePath);
  const existingVersion = readSchemaVersion(database);

  if (Number.isInteger(existingVersion) && existingVersion !== INDEX_SCHEMA_VERSION) {
    database.close();
    removeDatabaseFiles(databasePath);
    database = connect(databasePath);
    console.log('[electron] Vault index schema changed, rebuilding ->', databasePath);
  }

  initIndexSchema(database);
  indexDb = database;
  indexDbVaultId = vaultId;

  console.log('[electron] Vault index ready ->', databasePath);
  return indexDb;
}

function getVaultIndexDatabase() {
  if (!indexDb) {
    throw new Error('Vault index not initialized. Call openVaultIndexDatabase() first.');
  }

  return indexDb;
}

function closeVaultIndexDatabase() {
  if (!indexDb) {
    return;
  }

  indexDb.close();
  indexDb = null;
  indexDbVaultId = null;

  console.log('[electron] Vault index closed');
}

module.exports = {
  closeVaultIndexDatabase,
  getVaultIndexDatabase,
  getVaultIndexDatabasePath,
  openVaultIndexDatabase,
};
