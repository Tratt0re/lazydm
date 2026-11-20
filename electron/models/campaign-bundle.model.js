const campaignModel = require('./campaign.model');
const sectionModel = require('./section.model');
const templateModel = require('./template.model');
const battleRuleModel = require('./battle-rule.model');
const { ZIP_LIMITS } = require('../utils/zip-limits');

/** The manifest of a campaign zip (design-principles §6g): `lazydm.json`, at the root of the campaign folder. */
const MANIFEST_FILE_NAME = 'lazydm.json';
/** Highest `formatVersion` this app reads and writes. A newer zip is refused, never half-read. */
const MANIFEST_FORMAT_VERSION = 1;
/** Folder of the zip that holds the campaign's templates. */
const BUNDLE_TEMPLATES_DIR = '_templates';

const TITLE_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;
const SECTION_LABEL_MAX_LENGTH = 40;
const SECTION_DESCRIPTION_MAX_LENGTH = 200;
const CUSTOM_SECTIONS_MAX = 30;
const KEYS_MAX = 60;

/** A folder, note type or icon name: lowercase, no leading `_` or `.`, so `__proto__` can never match. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** A template the zip carries: directly in its own `_templates/`. */
const BUNDLE_TEMPLATE_PATTERN = /^_templates\/[^/\\._][^/\\]{0,100}\.md$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARACTERS_ALL = /[\u0000-\u001f\u007f]/g;

/** Why a manifest is refused as a whole. Everything else is clamped and reported as a warning. */
const MANIFEST_ERRORS = Object.freeze({
  tooLarge: 'too-large',
  invalidJson: 'invalid-json',
  notObject: 'not-object',
  noVersion: 'no-version',
  newerVersion: 'newer-version',
});

class ManifestError extends Error {
  constructor(code) {
    super(`Refused campaign manifest (${code}).`);
    this.name = 'ManifestError';
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Text from outside: a string without control characters, trimmed and cut; null when nothing is left. */
function toText(value, maxLength) {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.replace(CONTROL_CHARACTERS_ALL, ' ').trim().slice(0, maxLength);
  return text.length > 0 ? text : null;
}

/** A well-formed key that is not the name of something every object has (`constructor`, `toString`…). */
function toKey(value) {
  return typeof value === 'string' && KEY_PATTERN.test(value) && !(value in Object.prototype)
    ? value
    : null;
}

function toKeyList(value, field, warnings) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ code: 'invalid-field', field });
    return [];
  }

  const keys = [];
  for (const item of value.slice(0, KEYS_MAX)) {
    const key = toKey(item);
    if (key === null) {
      warnings.push({ code: 'invalid-entry', field });
    } else if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

function parseLabels(value, warnings) {
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    warnings.push({ code: 'invalid-field', field: 'sections.labels' });
    return {};
  }

  const labels = {};
  for (const [key, label] of Object.entries(value).slice(0, KEYS_MAX)) {
    const text = toText(label, SECTION_LABEL_MAX_LENGTH);
    if (toKey(key) === null || text === null) {
      warnings.push({ code: 'invalid-entry', field: 'sections.labels' });
    } else {
      labels[key] = text;
    }
  }
  return labels;
}

function parseCustomSections(value, warnings) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ code: 'invalid-field', field: 'sections.custom' });
    return [];
  }
  if (value.length > CUSTOM_SECTIONS_MAX) {
    warnings.push({ code: 'too-many', field: 'sections.custom' });
  }

  const sections = [];
  for (const item of value.slice(0, CUSTOM_SECTIONS_MAX)) {
    const label = isPlainObject(item) ? toText(item.label, SECTION_LABEL_MAX_LENGTH) : null;
    const key = isPlainObject(item) ? toKey(item.key) : null;
    if (label === null || key === null || sections.some((section) => section.key === key)) {
      warnings.push({ code: 'invalid-entry', field: 'sections.custom' });
      continue;
    }

    sections.push({
      key,
      type: toKey(item.type) ?? key,
      label,
      icon: toKey(item.icon) ?? 'folder',
      description: toText(item.description, SECTION_DESCRIPTION_MAX_LENGTH) ?? '',
    });
  }
  return sections;
}

function parseTemplateChoices(value, warnings) {
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    warnings.push({ code: 'invalid-field', field: 'templates' });
    return {};
  }

  const choices = {};
  for (const [type, choice] of Object.entries(value).slice(0, KEYS_MAX)) {
    const isChoiceValid =
      typeof choice === 'string' &&
      (templateModel.isBuiltInTemplateChoice(choice) ||
        (BUNDLE_TEMPLATE_PATTERN.test(choice) && !CONTROL_CHARACTERS.test(choice)));
    if (toKey(type) === null || !isChoiceValid) {
      warnings.push({ code: 'invalid-entry', field: 'templates' });
    } else {
      choices[type] = choice;
    }
  }
  return choices;
}

/**
 * Reads the text of a `lazydm.json`. Throws a `ManifestError` when the file cannot be used at all (too big, not
 * JSON, not an object, no or a newer `formatVersion`). Everything else is checked field by field: what is wrong is
 * dropped and reported in `warnings` (`{ code, field }`), and keys this app does not know are ignored. The result has
 * the same shape `buildManifest` writes, and nothing from the input is kept as it came.
 */
function parseManifest(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > ZIP_LIMITS.maxTextBytes) {
    throw new ManifestError(MANIFEST_ERRORS.tooLarge);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ManifestError(MANIFEST_ERRORS.invalidJson);
  }
  if (!isPlainObject(parsed)) {
    throw new ManifestError(MANIFEST_ERRORS.notObject);
  }
  if (!Number.isInteger(parsed.formatVersion) || parsed.formatVersion < 1) {
    throw new ManifestError(MANIFEST_ERRORS.noVersion);
  }
  if (parsed.formatVersion > MANIFEST_FORMAT_VERSION) {
    throw new ManifestError(MANIFEST_ERRORS.newerVersion);
  }

  const warnings = [];
  const sections = isPlainObject(parsed.sections) ? parsed.sections : {};
  if (parsed.sections !== undefined && !isPlainObject(parsed.sections)) {
    warnings.push({ code: 'invalid-field', field: 'sections' });
  }

  let system = 'generic';
  if (parsed.system !== undefined && parsed.system !== null) {
    if (typeof parsed.system === 'string' && templateModel.isBuiltInSystem(parsed.system)) {
      system = parsed.system;
    } else {
      warnings.push({ code: 'unknown-system', field: 'system' });
    }
  }

  let battleRule = null;
  if (parsed.battleRule !== undefined && parsed.battleRule !== null) {
    if (battleRuleModel.isBuiltInRuleRef(parsed.battleRule)) {
      battleRule = parsed.battleRule;
    } else {
      warnings.push({ code: 'invalid-field', field: 'battleRule' });
    }
  }

  return {
    manifest: {
      formatVersion: parsed.formatVersion,
      title: toText(parsed.title, TITLE_MAX_LENGTH),
      description: toText(parsed.description, DESCRIPTION_MAX_LENGTH),
      system,
      sections: {
        hidden: toKeyList(sections.hidden, 'sections.hidden', warnings),
        order: toKeyList(sections.order, 'sections.order', warnings),
        removed: toKeyList(sections.removed, 'sections.removed', warnings),
        labels: parseLabels(sections.labels, warnings),
        custom: parseCustomSections(sections.custom, warnings),
      },
      templates: parseTemplateChoices(parsed.templates, warnings),
      battleRule,
    },
    warnings,
  };
}

/**
 * The manifest of a campaign in the Codex: what the campaign owns (card, sections, template choices, tracker
 * layout) and nothing about the computer or the person (no paths, theme, language, MCP, tabs, index).
 *
 * Template choices are written relative to the zip: a choice pointing into the campaign's own `_templates/` becomes
 * `_templates/<name>.md`; one pointing elsewhere (the Codex root, a compendium system) becomes what `templateMap`
 * (vault path → zip path, built by the export) says. A choice with no place in the zip is left out and listed in
 * `dropped`. `builtin` references stay as they are.
 */
async function buildManifest(
  vaultPath,
  slug,
  { templateMap = new Map(), appVersion = null, now = new Date() } = {},
) {
  const campaign = await campaignModel.readCampaign(vaultPath, slug);
  if (!campaign) {
    throw new Error(`Campaign "${slug}" does not exist.`);
  }

  const ownPrefix = `${slug}/${BUNDLE_TEMPLATES_DIR}/`;
  const templates = {};
  const dropped = [];
  for (const [type, choice] of Object.entries(templateModel.readCampaignRules(vaultPath, slug))) {
    if (templateModel.isBuiltInTemplateChoice(choice)) {
      templates[type] = choice;
    } else if (choice.startsWith(ownPrefix)) {
      templates[type] = `${BUNDLE_TEMPLATES_DIR}/${choice.slice(ownPrefix.length)}`;
    } else if (templateMap.has(choice)) {
      templates[type] = templateMap.get(choice);
    } else {
      dropped.push(choice);
    }
  }

  const settings = sectionModel.readCampaignSectionSettings(vaultPath, slug);
  return {
    manifest: {
      formatVersion: MANIFEST_FORMAT_VERSION,
      app: { name: 'lazydm', version: typeof appVersion === 'string' ? appVersion : null },
      exportedAt: now.toISOString().slice(0, 10),
      title: campaign.name,
      description: campaign.description,
      system: campaign.system ?? 'generic',
      sections: {
        hidden: settings.hidden,
        order: settings.order,
        removed: settings.removed,
        labels: settings.labels,
        custom: settings.custom,
      },
      templates,
      battleRule: battleRuleModel.readCampaignChoice(vaultPath, slug),
    },
    dropped,
  };
}

/**
 * Writes the settings of a parsed manifest for the campaign `slug` into the vault config, through the setters the
 * app itself uses. Run it after the campaign's files are written: a custom section keeps its own folder name only
 * when the folder exists, and a template choice needs its file. What cannot be applied is skipped and returned in
 * `warnings`; the campaign is usable either way. The campaign card (title, description, system) is the file
 * `campaign.md`, not part of this.
 */
function applyManifest(vaultPath, slug, manifest) {
  const warnings = [];

  const { hidden, order, removed, labels, custom } = manifest.sections;
  try {
    sectionModel.saveCampaignSectionSettings(vaultPath, slug, {
      hidden,
      order,
      removed,
      labels,
      custom,
    });
  } catch {
    warnings.push({ code: 'sections-rejected', field: 'sections' });
  }

  const types = new Set([
    ...templateModel.TEMPLATE_NOTE_TYPES,
    ...templateModel.listCampaignTemplateTypes(vaultPath, slug),
  ]);
  for (const [type, choice] of Object.entries(manifest.templates)) {
    if (!types.has(type)) {
      warnings.push({ code: 'unknown-note-type', field: 'templates' });
    } else if (templateModel.isBuiltInTemplateChoice(choice)) {
      templateModel.setCampaignRule(vaultPath, slug, type, choice);
    } else if (templateModel.templateExists(vaultPath, `${slug}/${choice}`)) {
      templateModel.setCampaignRule(vaultPath, slug, type, `${slug}/${choice}`);
    } else {
      warnings.push({ code: 'template-missing', field: 'templates' });
    }
  }

  if (manifest.battleRule !== null) {
    battleRuleModel.setCampaignChoice(vaultPath, slug, manifest.battleRule);
  }

  return { warnings };
}

module.exports = {
  BUNDLE_TEMPLATES_DIR,
  MANIFEST_ERRORS,
  MANIFEST_FILE_NAME,
  MANIFEST_FORMAT_VERSION,
  ManifestError,
  applyManifest,
  buildManifest,
  parseManifest,
  toText,
};
