const { campaignModel, sectionModel, templateModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

const TEMPLATE_NAME_MAX_LENGTH = 80;
const EMPTY_TEMPLATE = '---\ntitle: "{{title}}"\n---\n# {{title}}\n';

/** A note type with a section somewhere in the vault (custom sections included) that can have a template. */
function requireNoteType(value, label = 'payload.type') {
  const type = requireString(value, label);
  const types = sectionModel.listNoteTypes(vaultController.getReadyVaultPath());
  if (!types.includes(type) || templateModel.NON_TEMPLATE_NOTE_TYPES.includes(type)) {
    throw new Error(`${label} has no template: ${type}`);
  }

  return type;
}

/** A built-in system (`generic`, `dnd5e`, `pf2e`); missing means the default one. */
function requireSystem(value) {
  if (value == null) {
    return templateModel.DEFAULT_SYSTEM;
  }

  const system = requireString(value, 'payload.system');
  if (!templateModel.isBuiltInSystem(system)) {
    throw new Error(`payload.system is not a built-in system: ${system}`);
  }

  return system;
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
    systems: Object.fromEntries(
      templateModel.TEMPLATE_NOTE_TYPES.map((type) => [type, templateModel.listSystemsOfType(type)]),
    ),
  };
}

/** Text of the built-in template of a note type (read-only, placeholders not filled). */
function builtIn(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const type = requireNoteType(body.type);
  const system = requireSystem(body.system);
  return { type, system, content: templateModel.getBuiltInTemplate(type, system) };
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
  const system = requireSystem(body.system);
  const content = type ? templateModel.getBuiltInTemplate(type, system) : EMPTY_TEMPLATE;
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
  const system = requireSystem(body.system);
  // A system variant gets its own file name, so it never takes the place of the default one.
  const slug = system === templateModel.DEFAULT_SYSTEM ? type : `${type}-${system}`;
  const templatePath = await templateModel.createTemplate(
    vaultController.getReadyVaultPath(),
    slug,
    templateModel.getBuiltInTemplate(type, system),
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
