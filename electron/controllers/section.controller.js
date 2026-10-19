const { campaignModel, sectionModel, vaultIndexModel } = require('../models');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const { ensurePlainObject, requireString } = require('./utils');

async function requireCampaign(vaultPath, value) {
  const slug = requireString(value, 'payload.campaign');
  if (slug.includes('/') || !(await campaignModel.readCampaign(vaultPath, slug))) {
    throw new Error(`Campaign not found: ${slug}`);
  }

  return slug;
}

/** Sections of a campaign with the number of files each folder holds (shown for hidden sections). */
function withFileCounts(campaign, sections) {
  return sections.map((section) => ({
    ...section,
    fileCount: indexerController.isOpen()
      ? vaultIndexModel.listFolderFiles(`${campaign}/${section.key}`).length
      : 0,
  }));
}

/** Every section of a campaign (hidden ones included), in its sidebar order. */
async function list(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const campaign = await requireCampaign(vaultPath, body.campaign);
  return { rows: withFileCounts(campaign, sectionModel.listCampaignSections(vaultPath, campaign)) };
}

/** Default sections: those of a new campaign, and the folders a compendium system can have. */
function defaults() {
  return {
    campaign: sectionModel.DEFAULT_SECTIONS,
    presets: sectionModel.SECTION_PRESETS,
    compendium: [...sectionModel.DEFAULT_SECTIONS, ...sectionModel.COMPENDIUM_EXTRA_SECTIONS],
  };
}

/** Saves a campaign's section settings (hidden, order, labels, custom sections) and returns its sections. */
async function save(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const campaign = await requireCampaign(vaultPath, body.campaign);
  const settings = ensurePlainObject(body.settings, 'payload.settings');
  return {
    rows: withFileCounts(
      campaign,
      sectionModel.saveCampaignSectionSettings(vaultPath, campaign, settings),
    ),
  };
}

module.exports = {
  defaults,
  list,
  save,
};
