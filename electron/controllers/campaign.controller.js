const { campaignModel, sectionModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const vaultController = require('./vault.controller');
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

module.exports = {
  create,
  get,
  list,
};
