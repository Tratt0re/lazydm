const { dialog } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { appMetaModel, vaultMigrationModel, vaultModel } = require('../models');
const {
  assertReadableDirectory,
  assertWritableDirectory,
  resolveInsideVault,
} = require('../utils/file-utils');
const cloudReadinessController = require('./cloud-readiness.controller');
const indexerController = require('./indexer.controller');
const { ensurePlainObject, requireString } = require('./utils');

const CURRENT_VAULT_ID_KEY = 'current_vault_id';
const VAULT_STATUS = Object.freeze({
  none: 'none',
  missing: 'missing',
  ready: 'ready',
});

function toVaultDto(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    path: row.path,
    name: row.name,
    createdAtMs: row.created_at_ms,
    lastOpenedAtMs: row.last_opened_at_ms,
  };
}

function resolveFolderPath(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return requireString(body.folderPath, 'payload.folderPath');
}

function readCurrentVaultId() {
  const row = appMetaModel.getByKey(CURRENT_VAULT_ID_KEY);
  return typeof row?.value === 'string' && row.value.length > 0 ? row.value : null;
}

function saveCurrentVaultId(vaultId) {
  const existing = appMetaModel.getByKey(CURRENT_VAULT_ID_KEY);
  if (!existing) {
    appMetaModel.create({ key: CURRENT_VAULT_ID_KEY, value: vaultId });
  } else {
    appMetaModel.updateByKey(CURRENT_VAULT_ID_KEY, { value: vaultId });
  }
}

function isUsableVaultFolder(folderPath) {
  try {
    assertWritableDirectory(folderPath, 'vault.path');
    return vaultModel.hasVaultConfig(folderPath);
  } catch (_) {
    return false;
  }
}

function getCurrent() {
  const vaultId = readCurrentVaultId();
  const row = vaultId ? vaultModel.getById(vaultId) : null;
  if (!row) {
    return { status: VAULT_STATUS.none, vault: null };
  }

  const status = isUsableVaultFolder(row.path) ? VAULT_STATUS.ready : VAULT_STATUS.missing;
  return { status, vault: toVaultDto(row) };
}

/** Root folder of the open vault; throws when no usable vault is open. */
function getReadyVaultPath() {
  const { status, vault } = getCurrent();
  if (status !== VAULT_STATUS.ready || !vault) {
    throw new Error('No vault is open.');
  }

  return vault.path;
}

async function selectFolder() {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return {
    folderPath: result.filePaths[0],
  };
}

function inspect(payload) {
  const folderPath = resolveInsideVault(
    assertReadableDirectory(resolveFolderPath(payload), 'payload.folderPath'),
  );
  const config = vaultModel.readVaultConfig(folderPath);

  let isWritable = true;
  try {
    assertWritableDirectory(folderPath, 'payload.folderPath');
  } catch (_) {
    isWritable = false;
  }

  return {
    folderPath,
    name: typeof config?.name === 'string' ? config.name : path.basename(folderPath),
    isVault: config !== null,
    isEmpty: vaultModel.isDirectoryEmpty(folderPath),
    isWritable,
  };
}

function open(payload) {
  const folderPath = resolveInsideVault(
    assertWritableDirectory(resolveFolderPath(payload), 'payload.folderPath'),
  );
  const existingConfig = vaultModel.readVaultConfig(folderPath);
  const config = existingConfig ?? vaultModel.createDefaultVaultConfig(path.basename(folderPath));

  vaultModel.ensureVaultStructure(folderPath);
  if (!existingConfig) {
    vaultModel.writeVaultConfig(folderPath, config);
  }

  const nowMs = Date.now();
  const name =
    typeof config.name === 'string' && config.name.trim().length > 0
      ? config.name
      : path.basename(folderPath);
  const existingRow = vaultModel.getByPath(folderPath);
  let vaultId = existingRow?.id;

  if (existingRow) {
    vaultModel.updateById(vaultId, { name, last_opened_at_ms: nowMs });
  } else {
    vaultId = randomUUID();
    vaultModel.create({
      id: vaultId,
      path: folderPath,
      name,
      created_at_ms: nowMs,
      last_opened_at_ms: nowMs,
    });
  }

  saveCurrentVaultId(vaultId);
  const vault = toVaultDto(vaultModel.getById(vaultId));
  startSession(vault);

  return { status: VAULT_STATUS.ready, vault };
}

/**
 * Waits for the cloud client to download the vault notes, brings an older vault to the current format, then
 * indexes the vault. Runs in the background.
 */
function startSession(vault) {
  void cloudReadinessController.prepare(vault).then(async () => {
    if (readCurrentVaultId() !== vault.id) {
      return;
    }

    try {
      const report = await vaultMigrationModel.migrateVault(vault.path);
      if (report) {
        console.info('[electron] Vault migrated ->', report);
      }
    } catch (error) {
      // Not marked as migrated: the next start tries again. The vault still opens.
      console.error('[electron] Vault migration failed ->', error);
    }

    if (readCurrentVaultId() === vault.id) {
      indexerController.start(vault);
    }
  });
}

function close() {
  cloudReadinessController.cancel();
  indexerController.stop();
  if (readCurrentVaultId()) {
    appMetaModel.deleteByKey(CURRENT_VAULT_ID_KEY);
  }

  return { status: VAULT_STATUS.none, vault: null };
}

module.exports = {
  close,
  getCurrent,
  getReadyVaultPath,
  inspect,
  open,
  selectFolder,
  startSession,
};
