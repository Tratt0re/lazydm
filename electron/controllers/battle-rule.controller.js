const { battleRuleModel, campaignModel, templateModel } = require('../models');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

async function requireCampaign(vaultPath, value) {
  const slug = requireString(value, 'payload.campaign');
  if (slug.includes('/') || !(await campaignModel.readCampaign(vaultPath, slug))) {
    throw new Error(`Campaign not found: ${slug}`);
  }

  return slug;
}

/** The built-in rules (`builtIn` is the default). Rule files are no longer read, so there are no other rows. */
async function list() {
  return {
    builtIn: battleRuleModel.DEFAULT_BATTLE_RULE,
    builtIns: Object.entries(battleRuleModel.BUILT_IN_RULES).map(([ref, rule]) => ({ ref, rule })),
  };
}

async function getChoice(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const campaign = await requireCampaign(vaultPath, body.campaign);
  // `system`: the campaign's game system, whose layout applies while it has no choice of its own.
  const system = (await campaignModel.readCampaign(vaultPath, campaign))?.system ?? null;
  return { rule: battleRuleModel.readCampaignChoice(vaultPath, campaign), system };
}

/** Rule a campaign's encounters follow by default: a built-in reference (`builtin`, `builtin:dnd5e`…), or null for the default. */
async function setChoice(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const campaign = await requireCampaign(vaultPath, body.campaign);
  const rule = normalizeOptionalString(body.rule, 'payload.rule', { allowNull: true }) ?? null;
  if (rule !== null && !battleRuleModel.isBuiltInRuleRef(rule)) {
    throw new Error(`payload.rule is not a built-in tracker layout: ${rule}`);
  }

  return { rule: battleRuleModel.setCampaignChoice(vaultPath, campaign, rule) };
}

/**
 * Frontmatter keys a rule can read: those of the template it names (`builtin:<type>@<system>` or a template path).
 * Not an IPC channel any more (the app has no layout editor): the MCP's `get_encounter_rule` reports them.
 */
async function attributes(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const template = requireString(body.template, 'payload.template');
  return { keys: await templateModel.readTemplateKeys(vaultPath, template) };
}

module.exports = {
  attributes,
  getChoice,
  list,
  setChoice,
};
