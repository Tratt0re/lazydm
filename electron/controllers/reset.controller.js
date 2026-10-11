const fs = require('node:fs');
const { closeDatabase, createDatabase, getDatabasePath } = require('../database/db');
const { initSchema } = require('../database/schema');
const { runMigrations } = require('../database/migrations');
const { clearSettingsStore } = require('../utils/settings-store');

function factoryReset(_event, _payload) {
  try {
    const dbPath = getDatabasePath();
    closeDatabase();
    clearSettingsStore();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    const db = createDatabase();
    initSchema(db);
    runMigrations(db);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}

module.exports = { factoryReset };
