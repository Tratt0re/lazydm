const { campaignModel, sectionModel, vaultIndexModel, workspaceModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const { trashVaultItem, resolveInsideVault } = require('../utils/file-utils');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

const CAMPAIGN_NAME_MAX_LENGTH = 80;
const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 500;

async function list() {
  return { rows: await campaignModel.listCampaigns(vaultController.getReadyVaultPath()) };
}

async function get(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const slug = requireString(body.slug, 'payload.slug');
  const campaign = await campaignModel.readCampaign(vaultController.getReadyVaultPath(), slug);
  if (!campaign) {
    throw new Error(`Campaign not found: ${slug}`);
  }

  return campaign;
}

async function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const name = requireString(body.name, 'payload.name', { maxLength: CAMPAIGN_NAME_MAX_LENGTH });
  const description =
    normalizeOptionalString(body.description, 'payload.description', {
      allowEmpty: true,
      maxLength: CAMPAIGN_DESCRIPTION_MAX_LENGTH,
    }) || null;

  const slug = toSlug(name);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  const vaultPath = vaultController.getReadyVaultPath();
  if (campaignModel.campaignFolderExists(vaultPath, slug)) {
    throw new Error(`A folder named "${slug}" already exists in the vault.`);
  }

  const campaign = await campaignModel.createCampaign(vaultPath, { slug, name, description });
  // Starting sections: the chosen presets (no list = all of them, like campaigns before presets).
  if (Array.isArray(body.presets)) {
    sectionModel.initCampaignSections(vaultPath, slug, body.presets);
  }

  return campaign;
}

/** An existing campaign's slug from the payload; throws for anything else (also `..`, hidden or nested names). */
async function requireExistingCampaign(body, vaultPath) {
  const slug = requireString(body.slug, 'payload.slug');
  if (!sectionModel.isPlainFolderSegment(slug) || slug.includes('/')) {
    throw new Error(`Not a campaign: ${slug}`);
  }
  if (!(await campaignModel.readCampaign(vaultPath, slug))) {
    throw new Error(`Campaign not found: ${slug}`);
  }

  return slug;
}

/** Changes the name and description of a campaign; its folder (slug) stays. */
async function update(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const name = requireString(body.name, 'payload.name', { maxLength: CAMPAIGN_NAME_MAX_LENGTH });
  const description =
    normalizeOptionalString(body.description, 'payload.description', {
      allowEmpty: true,
      maxLength: CAMPAIGN_DESCRIPTION_MAX_LENGTH,
    }) || null;
  const vaultPath = vaultController.getReadyVaultPath();
  const slug = await requireExistingCampaign(body, vaultPath);

  const campaign = await campaignModel.updateCampaign(vaultPath, slug, { name, description });
  if (indexerController.isOpen()) {
    await indexerController.reindexPaths([`${slug}/campaign.md`]);
  }

  return campaign;
}

/** Number of files a delete would remove, for the confirmation. */
async function countFiles(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const slug = await requireExistingCampaign(body, vaultPath);
  return { count: indexerController.isOpen() ? vaultIndexModel.listScopeFiles(slug).length : 0 };
}

/**
 * Deletes a campaign: its folder goes to the system Trash (recoverable), then its entries leave the vault config,
 * its saved tabs go and the index forgets its files. The Trash comes first, so a failure changes nothing else.
 */
async function remove(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const slug = await requireExistingCampaign(body, vaultPath);
  if (!indexerController.isOpen()) {
    throw new Error('The vault index is not open yet.');
  }

  const files = vaultIndexModel.listScopeFiles(slug);
  await trashVaultItem(resolveInsideVault(vaultPath, slug));
  try {
    campaignModel.forgetCampaignSettings(vaultPath, slug);
    workspaceModel.deleteWorkspace(slug);
  } finally {
    await indexerController.reindexPaths(files.map((file) => file.path));
  }

  return { slug, deleted: files.length };
}

module.exports = {
  countFiles,
  create,
  get,
  list,
  remove,
  update,
};
