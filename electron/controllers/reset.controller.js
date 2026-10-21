const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { closeDatabase, createDatabase, getDatabasePath } = require('../database/db');
const { initSchema } = require('../database/schema');
const { runMigrations } = require('../database/migrations');
const { clearSettingsStore } = require('../utils/settings-store');
const vaultController = require('./vault.controller');

/** Per-vault index databases: caches, rebuilt from the vault files, so a reset can drop them. */
function getIndexDirectory() {
  return path.join(app.getPath('userData'), 'data', 'index');
}

function openFreshDatabase() {
  const db = createDatabase();
  initSchema(db);
  runMigrations(db);
}

/**
 * Forgets the open vault and every device-local setting, and starts again from an empty app database.
 * The vault folder and its notes are never touched. The indexer, the cloud check and any pending vault start
 * are stopped first, so nothing keeps using the database that is about to be replaced.
 */
function factoryReset(_payload, _event) {
  try {
    vaultController.close();
    const dbPath = getDatabasePath();
    closeDatabase();
    clearSettingsStore();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    fs.rmSync(getIndexDirectory(), { recursive: true, force: true });
    openFreshDatabase();
    return { ok: true };
  } catch (err) {
    // Never leave the app without an open database: the next call would fail everywhere.
    try {
      openFreshDatabase();
    } catch (recoveryError) {
      console.error('[electron] Could not reopen the database after a failed reset:', recoveryError);
    }
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}

module.exports = { factoryReset };
