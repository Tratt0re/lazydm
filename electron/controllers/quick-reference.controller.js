const { quickReferenceModel } = require('../models');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

function requireCampaign(body) {
  return requireString(body.campaign, 'payload.campaign');
}

/** The quick reference of a campaign: the clean data, its warnings and the hash the next save must carry. */
function read(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return quickReferenceModel.readQuickReference(
    vaultController.getReadyVaultPath(),
    requireCampaign(body),
  );
}

/** Saves the sheet when the file still is what the page loaded (`expectedHash`, null for a file not created yet). */
function write(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const expectedHash =
    normalizeOptionalString(body.expectedHash, 'payload.expectedHash', { allowNull: true }) ?? null;

  return quickReferenceModel.writeQuickReference(
    vaultController.getReadyVaultPath(),
    requireCampaign(body),
    ensurePlainObject(body.data, 'payload.data'),
    expectedHash,
  );
}

module.exports = {
  read,
  write,
};
