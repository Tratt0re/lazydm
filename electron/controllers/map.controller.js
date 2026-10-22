const { mapModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

function requirePath(body, key = 'path') {
  return requireString(body[key], `payload.${key}`);
}

function read(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return mapModel.readMap(vaultController.getReadyVaultPath(), requirePath(body));
}

function write(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const expectedHash =
    normalizeOptionalString(body.expectedHash, 'payload.expectedHash', { allowNull: true }) ?? null;

  return mapModel.writeMap(
    vaultController.getReadyVaultPath(),
    requirePath(body),
    ensurePlainObject(body.map, 'payload.map'),
    expectedHash,
  );
}

function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const name = requireString(body.name, 'payload.name', {
    maxLength: mapModel.MAP_NAME_MAX_LENGTH,
  });
  const slug = toSlug(name);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  // The image is a file of the scope's assets/; the model rejects anything that is not an image path in the vault.
  const image = requireString(body.image, 'payload.image');
  if (!mapModel.normalizeMap({ image }, name).image) {
    throw new Error('payload.image must be the vault path of an image.');
  }

  return mapModel.createMap(vaultController.getReadyVaultPath(), {
    folderPath: requirePath(body, 'folder'),
    slug,
    name,
    image,
  });
}

module.exports = {
  create,
  read,
  write,
};
