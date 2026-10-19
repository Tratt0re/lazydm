const { encounterModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

function requirePath(body, key = 'path') {
  return requireString(body[key], `payload.${key}`);
}

function read(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return encounterModel.readEncounter(vaultController.getReadyVaultPath(), requirePath(body));
}

function write(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const expectedHash =
    normalizeOptionalString(body.expectedHash, 'payload.expectedHash', { allowNull: true }) ?? null;

  return encounterModel.writeEncounter(
    vaultController.getReadyVaultPath(),
    requirePath(body),
    ensurePlainObject(body.encounter, 'payload.encounter'),
    expectedHash,
  );
}

function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const name = requireString(body.name, 'payload.name', {
    maxLength: encounterModel.ENCOUNTER_NAME_MAX_LENGTH,
  });
  const slug = toSlug(name);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  return encounterModel.createEncounter(vaultController.getReadyVaultPath(), {
    folderPath: requirePath(body, 'folder'),
    slug,
    name,
  });
}

module.exports = {
  create,
  read,
  write,
};
