const { compendiumModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

const SYSTEM_NAME_MAX_LENGTH = 80;
const SYSTEM_DESCRIPTION_MAX_LENGTH = 500;

function requireSystemSlug(body) {
  const slug = requireString(body.slug, 'payload.slug');
  if (slug.includes('/') || slug.includes('\\') || !compendiumModel.isSystemDirName(slug)) {
    throw new Error(`payload.slug is not a compendium system: ${slug}`);
  }

  return slug;
}

async function requireExistingSystem(vaultPath, slug) {
  const system = await compendiumModel.readSystem(vaultPath, slug);
  if (!system) {
    throw new Error(`Compendium system not found: ${slug}`);
  }

  return system;
}

async function list() {
  return { rows: await compendiumModel.listSystems(vaultController.getReadyVaultPath()) };
}

async function get(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return requireExistingSystem(vaultController.getReadyVaultPath(), requireSystemSlug(body));
}

async function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const name = requireString(body.name, 'payload.name', { maxLength: SYSTEM_NAME_MAX_LENGTH });
  const description =
    normalizeOptionalString(body.description, 'payload.description', {
      allowEmpty: true,
      maxLength: SYSTEM_DESCRIPTION_MAX_LENGTH,
    }) || null;

  const slug = toSlug(name);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  const vaultPath = vaultController.getReadyVaultPath();
  if (compendiumModel.systemFolderExists(vaultPath, slug)) {
    throw new Error(`A compendium folder named "${slug}" already exists.`);
  }

  return compendiumModel.createSystem(vaultPath, { slug, name, description });
}

/** Number of files a delete would remove, for the confirmation. */
async function countFiles(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const slug = requireSystemSlug(body);
  await requireExistingSystem(vaultPath, slug);
  return { count: await compendiumModel.countSystemFiles(vaultPath, slug) };
}

/** Permanently deletes a system with everything in it. */
async function remove(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const slug = requireSystemSlug(body);
  await requireExistingSystem(vaultPath, slug);

  await compendiumModel.deleteSystem(vaultPath, slug);
  if (indexerController.isOpen()) {
    await indexerController.reindexPaths([compendiumModel.getSystemPath(slug)]);
  }

  return { slug };
}

module.exports = {
  countFiles,
  create,
  get,
  list,
  remove,
};
