const { battleRuleModel, campaignModel, templateModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

const BATTLE_RULE_NAME_MAX_LENGTH = 80;

async function requireCampaign(vaultPath, value) {
  const slug = requireString(value, 'payload.campaign');
  if (slug.includes('/') || !(await campaignModel.readCampaign(vaultPath, slug))) {
    throw new Error(`Campaign not found: ${slug}`);
  }

  return slug;
}

function requireRulePath(vaultPath, value, label = 'payload.path') {
  const rulePath = requireString(value, label);
  if (!battleRuleModel.battleRuleExists(vaultPath, rulePath)) {
    throw new Error(`Battle rule not found: ${rulePath}`);
  }

  return rulePath;
}

/** Rule files of the vault, its systems and campaigns, plus the built-in ones (`builtIn` is the default). */
async function list() {
  return {
    rows: await battleRuleModel.listBattleRules(vaultController.getReadyVaultPath()),
    builtIn: battleRuleModel.DEFAULT_BATTLE_RULE,
    builtIns: Object.entries(battleRuleModel.BUILT_IN_RULES).map(([ref, rule]) => ({ ref, rule })),
  };
}

function read(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  return battleRuleModel.readBattleRuleFile(vaultPath, requireRulePath(vaultPath, body.path));
}

function write(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const expectedHash =
    normalizeOptionalString(body.expectedHash, 'payload.expectedHash', { allowNull: true }) ?? null;
  return battleRuleModel.writeBattleRuleFile(
    vaultPath,
    requireRulePath(vaultPath, body.path),
    ensurePlainObject(body.rule, 'payload.rule'),
    expectedHash,
  );
}

/** New vault-level rule, started from a built-in (also how *Customize* copies one out). */
async function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const name = requireString(body.name, 'payload.name', { maxLength: BATTLE_RULE_NAME_MAX_LENGTH });
  const slug = toSlug(name);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  const from = normalizeOptionalString(body.from, 'payload.from', { allowNull: true }) ?? undefined;
  if (from !== undefined && !battleRuleModel.isBuiltInRuleRef(from)) {
    throw new Error(`payload.from is not a built-in rule: ${from}`);
  }

  const path = await battleRuleModel.createBattleRuleFile(
    vaultController.getReadyVaultPath(),
    slug,
    name,
    from,
  );
  return { path };
}

/** Deletes a rule file; campaigns that used it go back to the built-in. */
async function remove(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const path = requireRulePath(vaultPath, body.path);
  await battleRuleModel.deleteBattleRuleFile(vaultPath, path);
  return { path };
}

async function getChoice(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const campaign = await requireCampaign(vaultPath, body.campaign);
  return { rule: battleRuleModel.readCampaignChoice(vaultPath, campaign) };
}

/** Rule a campaign's encounters follow by default: a rule path, a built-in reference (`builtin`, `builtin:dnd5e`…), or null for the default. */
async function setChoice(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const campaign = await requireCampaign(vaultPath, body.campaign);
  const rule = normalizeOptionalString(body.rule, 'payload.rule', { allowNull: true }) ?? null;
  const value =
    rule === null || battleRuleModel.isBuiltInRuleRef(rule)
      ? rule
      : requireRulePath(vaultPath, rule, 'payload.rule');
  return { rule: battleRuleModel.setCampaignChoice(vaultPath, campaign, value) };
}

/**
 * Frontmatter keys a rule can read and a formula can use: those of the templates it names (`template`: a
 * template path or `builtin:<type>`). Placeholders (`{{date}}`) are filled by the template parser first.
 */
async function attributes(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const template = requireString(body.template, 'payload.template');
  return { keys: await templateModel.readTemplateKeys(vaultPath, template) };
}

module.exports = {
  attributes,
  create,
  getChoice,
  list,
  read,
  remove,
  setChoice,
  write,
};
