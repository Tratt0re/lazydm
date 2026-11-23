const { quickReferenceBuiltinModel, quickReferenceModel } = require('../models');
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

/** The language of the built-in words: one the app speaks, English otherwise. */
function readLanguage(body) {
  return quickReferenceBuiltinModel.toLanguage(
    normalizeOptionalString(body.language, 'payload.language', { allowNull: true }),
  );
}

/**
 * Opens a campaign's sheet: the file as it is, or, when it has none and its game system ships rules, the file
 * just made from them in `language`. Never touches a file that exists.
 */
function open(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return quickReferenceBuiltinModel.seedQuickReference(
    vaultController.getReadyVaultPath(),
    requireCampaign(body),
    readLanguage(body),
  );
}

/** Adds the rules of a built-in system to the file without replacing any (*Start from…*). */
function addBuiltin(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return quickReferenceBuiltinModel.addBuiltinRules(
    vaultController.getReadyVaultPath(),
    requireCampaign(body),
    requireString(body.system, 'payload.system'),
    readLanguage(body),
    normalizeOptionalString(body.expectedHash, 'payload.expectedHash', { allowNull: true }) ?? null,
  );
}

/** Puts one built-in rule back to its words. */
function resetRule(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return quickReferenceBuiltinModel.resetBuiltinRule(
    vaultController.getReadyVaultPath(),
    requireCampaign(body),
    requireString(body.rule, 'payload.rule'),
    readLanguage(body),
    normalizeOptionalString(body.expectedHash, 'payload.expectedHash', { allowNull: true }) ?? null,
  );
}

module.exports = {
  addBuiltin,
  open,
  read,
  resetRule,
  write,
};
