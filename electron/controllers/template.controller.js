const { campaignModel, templateModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

const TEMPLATE_NAME_MAX_LENGTH = 80;
const EMPTY_TEMPLATE = '---\ntitle: "{{title}}"\n---\n# {{title}}\n';

function requireNoteType(value, label = 'payload.type') {
  const type = requireString(value, label);
  if (!templateModel.TEMPLATE_NOTE_TYPES.includes(type)) {
    throw new Error(`${label} has no template: ${type}`);
  }

  return type;
}

async function requireCampaign(vaultPath, value) {
  const slug = requireString(value, 'payload.campaign');
  if (slug.includes('/') || !(await campaignModel.readCampaign(vaultPath, slug))) {
    throw new Error(`Campaign not found: ${slug}`);
  }

  return slug;
}

function requireTemplatePath(vaultPath, value) {
  const templatePath = requireString(value, 'payload.path');
  if (!templateModel.templateExists(vaultPath, templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  return templatePath;
}

async function reindex(paths) {
  if (indexerController.isOpen()) {
    await indexerController.reindexPaths(paths);
  }
}

/** Templates of the vault, its systems and campaigns, plus the note types that have a built-in. */
async function list() {
  return {
    rows: await templateModel.listTemplates(vaultController.getReadyVaultPath()),
    types: templateModel.TEMPLATE_NOTE_TYPES,
  };
}

/** Text of the built-in template of a note type (read-only, placeholders not filled). */
function builtIn(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const type = requireNoteType(body.type);
  return { type, content: templateModel.BUILT_IN_TEMPLATES[type] };
}

async function getRules(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const campaign = await requireCampaign(vaultPath, body.campaign);
  return { rules: templateModel.readCampaignRules(vaultPath, campaign) };
}

/** Template a campaign uses for a note type: a template path, `builtin`, or null for automatic. */
async function setRule(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const campaign = await requireCampaign(vaultPath, body.campaign);
  const type = requireNoteType(body.type);
  const template =
    normalizeOptionalString(body.template, 'payload.template', { allowNull: true }) ?? null;
  const value =
    template === null || template === templateModel.BUILT_IN_RULE
      ? template
      : requireTemplatePath(vaultPath, template);

  return { rules: templateModel.setCampaignRule(vaultPath, campaign, type, value) };
}

/** New vault-level template, empty or started from the built-in of a note type. */
async function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const name = requireString(body.name, 'payload.name', { maxLength: TEMPLATE_NAME_MAX_LENGTH });
  const slug = toSlug(name);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  const type = body.type == null ? null : requireNoteType(body.type);
  const content = type ? templateModel.BUILT_IN_TEMPLATES[type] : EMPTY_TEMPLATE;
  const templatePath = await templateModel.createTemplate(
    vaultController.getReadyVaultPath(),
    slug,
    content,
  );
  await reindex([templatePath]);
  return { path: templatePath };
}

/** Copies the built-in of a type into `_templates/<type>.md` (or a free name) so it can be edited. */
async function customize(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const type = requireNoteType(body.type);
  const templatePath = await templateModel.createTemplate(
    vaultController.getReadyVaultPath(),
    type,
    templateModel.BUILT_IN_TEMPLATES[type],
  );
  await reindex([templatePath]);
  return { path: templatePath };
}

/** Deletes a template file; campaigns that used it go back to automatic for that type. */
async function remove(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const templatePath = requireTemplatePath(vaultPath, body.path);
  await templateModel.deleteTemplate(vaultPath, templatePath);
  await reindex([templatePath]);
  return { path: templatePath };
}

module.exports = {
  builtIn,
  create,
  customize,
  getRules,
  list,
  remove,
  setRule,
};
