const fs = require('node:fs');
const path = require('node:path');
const { resolveInsideVault, safeWriteFileAtomic, trashVaultItem } = require('../utils/file-utils');
const { listCampaigns, readCampaign, NOTE_TYPE_DIR_NAMES } = require('./campaign.model');
const { COMPENDIUM_DIR_NAME, listSystems, readSystem } = require('./compendium.model');
const { listCampaignNoteTypes } = require('./section.model');
const { parseMarkdownDocument } = require('../utils/markdown-parse');
const { readVaultConfig, writeVaultConfig } = require('./vault.model');

const TEMPLATES_DIR_NAME = '_templates';
const MARKDOWN_EXTENSION = '.md';
/** Rule value of a campaign that picked the built-in template of a type. */
const BUILT_IN_RULE = 'builtin';
/** Types whose section is not a note folder (encounters and maps are special files): no template. */
const NON_TEMPLATE_NOTE_TYPES = Object.freeze(['encounter', 'map']);

/** Note types that have a template (encounters and maps are special files, not notes). */
const TEMPLATE_NOTE_TYPES = Object.freeze(
  Object.keys(NOTE_TYPE_DIR_NAMES).filter((type) => !NON_TEMPLATE_NOTE_TYPES.includes(type)),
);

function frontmatter(fields = []) {
  const lines = ['title: "{{title}}"', ...fields.map((field) => `${field}:`)];
  return `---\n${lines.join('\n')}\n---\n# {{title}}\n`;
}

/** Templates shipped with the app, used when the vault has none for a type. Read-only. */
const BUILT_IN_TEMPLATES = Object.freeze({
  scene: `${frontmatter(['session', 'location'])}
## Setup

## What happens

## Outcomes
`,
  character: `${frontmatter(['role', 'affiliation', 'status'])}
## Appearance

## Personality

## Goals

## Secrets
`,
  enemy: `${frontmatter(['cr', 'hp', 'ac', 'initiative_mod'])}
## Description

## Stats

## Abilities

## Tactics
`,
  spell: `${frontmatter(['level', 'school', 'casting_time', 'range', 'duration'])}
## Description

## At higher levels
`,
  item: `${frontmatter(['rarity', 'attunement'])}
## Description

## Properties

## History
`,
  quest: `${frontmatter(['status', 'giver', 'reward'])}
## Hook

## Objectives

- [ ]

## Rewards
`,
  location: `${frontmatter(['region'])}
## Overview

## Points of interest

## Inhabitants

## Secrets
`,
  world: `${frontmatter(['category'])}
## Overview

## Details
`,
  handout: `${frontmatter()}
> What the players receive.
`,
  session: `---
title: "{{title}}"
date: {{date}}
number:
---
# {{title}}

## Recap

## Plan

## Notes

## Loot & XP
`,
});

/** The system of the base templates above; the others only vary the types a game needs (enemy, NPC, spell). */
const DEFAULT_SYSTEM = 'generic';
const ABILITY_SCORES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/**
 * Per-system variants of the built-in templates. Keys are empty and ready to fill; the ones the base templates
 * already had (`hp`, `ac`, `cr`, `initiative_mod`…) keep their names, so notes written before keep working.
 * A type a system has no variant of uses the base template. Data only: nothing outside this table knows a game.
 */
const SYSTEM_TEMPLATES = Object.freeze({
  dnd5e: Object.freeze({
    enemy: `${frontmatter([
      'cr',
      'size',
      'creature_type',
      'alignment',
      'ac',
      'hp',
      'hit_dice',
      'speed',
      'initiative_mod',
      ...ABILITY_SCORES,
      'saves',
      'skills',
      'senses',
      'languages',
      'resistances',
      'immunities',
      'vulnerabilities',
      'condition_immunities',
      'legendary',
    ])}
## Description

## Traits

## Actions

## Reactions

## Legendary actions

## Tactics
`,
    character: `${frontmatter([
      'race',
      'class',
      'role',
      'affiliation',
      'status',
      'attitude',
      'ac',
      'hp',
      'initiative_mod',
      ...ABILITY_SCORES,
    ])}
## Appearance

## Personality

## Goals

## Secrets

## Stat block
`,
    spell: `${frontmatter([
      'level',
      'school',
      'casting_time',
      'range',
      'duration',
      'components',
      'concentration',
      'ritual',
      'classes',
      'damage',
      'save',
      'attack',
    ])}
## Description

## At higher levels
`,
  }),
  pf2e: Object.freeze({
    enemy: `${frontmatter([
      'level',
      'rarity',
      'size',
      'creature_type',
      'traits',
      'ac',
      'hp',
      'speed',
      'initiative_mod',
      'perception',
      'fortitude',
      'reflex',
      'will',
      ...ABILITY_SCORES,
      'skills',
      'senses',
      'languages',
      'resistances',
      'immunities',
      'weaknesses',
    ])}
## Description

## Abilities

## Actions

## Reactions

## Tactics
`,
    character: `${frontmatter([
      'ancestry',
      'class',
      'level',
      'role',
      'affiliation',
      'status',
      'attitude',
      'ac',
      'hp',
      'initiative_mod',
      'perception',
      'fortitude',
      'reflex',
      'will',
    ])}
## Appearance

## Personality

## Goals

## Secrets

## Stat block
`,
    spell: `${frontmatter([
      'rank',
      'traditions',
      'traits',
      'cast',
      'range',
      'area',
      'targets',
      'defense',
      'duration',
    ])}
## Description

## Heightened
`,
  }),
});

/** The built-in systems, the default first. */
const BUILT_IN_SYSTEMS = Object.freeze([DEFAULT_SYSTEM, ...Object.keys(SYSTEM_TEMPLATES)]);

function isBuiltInSystem(system) {
  return BUILT_IN_SYSTEMS.includes(system);
}

/** The systems with their own variant of a note type's template (the default is not listed). */
function listSystemsOfType(type) {
  return Object.keys(SYSTEM_TEMPLATES).filter((system) => type in SYSTEM_TEMPLATES[system]);
}

/**
 * Built-in text of a note type in a system. A system without its own variant of the type (or an unknown one) gives
 * the base template; types without one (custom sections) get the bare frontmatter.
 */
function getBuiltInTemplate(type, system = DEFAULT_SYSTEM) {
  return SYSTEM_TEMPLATES[system]?.[type] ?? BUILT_IN_TEMPLATES[type] ?? frontmatter();
}

/** Note types a campaign can pick a template for: its sections' types (custom ones included). */
function listCampaignTemplateTypes(rootPath, campaignSlug) {
  return listCampaignNoteTypes(rootPath, campaignSlug).filter(
    (type) => !NON_TEMPLATE_NOTE_TYPES.includes(type),
  );
}

/** `_templates/x.md`, `<campaign>/_templates/x.md` or `compendium/<system>/_templates/x.md`. */
function isTemplatePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.endsWith(MARKDOWN_EXTENSION)) {
    return false;
  }

  const segments = relativePath.split('/');
  if (segments.some((segment) => segment.length === 0 || segment.startsWith('.'))) {
    return false;
  }

  if (segments.length === 2) {
    return segments[0] === TEMPLATES_DIR_NAME;
  }

  if (segments.length === 3) {
    return segments[1] === TEMPLATES_DIR_NAME && segments[0] !== COMPENDIUM_DIR_NAME;
  }

  return (
    segments.length === 4 &&
    segments[0] === COMPENDIUM_DIR_NAME &&
    segments[2] === TEMPLATES_DIR_NAME
  );
}

async function listTemplateFiles(rootPath, folderPath) {
  const absolutePath = resolveInsideVault(rootPath, folderPath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION) && !entry.name.startsWith('.'),
    )
    .map((entry) => `${folderPath}/${entry.name}`)
    .sort((left, right) => left.localeCompare(right));
}

function toTemplateRow(templatePath, source) {
  return {
    path: templatePath,
    name: path.posix.basename(templatePath, MARKDOWN_EXTENSION),
    ...source,
  };
}

/** Every template of the vault: vault-level first, then each compendium system, then each campaign. */
async function listTemplates(rootPath) {
  const rows = (await listTemplateFiles(rootPath, TEMPLATES_DIR_NAME)).map((templatePath) =>
    toTemplateRow(templatePath, { source: 'vault', scope: null, scopeName: null }),
  );

  for (const system of await listSystems(rootPath)) {
    const files = await listTemplateFiles(rootPath, `${system.path}/${TEMPLATES_DIR_NAME}`);
    rows.push(
      ...files.map((templatePath) =>
        toTemplateRow(templatePath, {
          source: 'system',
          scope: system.path,
          scopeName: system.name,
        }),
      ),
    );
  }

  for (const campaign of await listCampaigns(rootPath)) {
    const files = await listTemplateFiles(rootPath, `${campaign.slug}/${TEMPLATES_DIR_NAME}`);
    rows.push(
      ...files.map((templatePath) =>
        toTemplateRow(templatePath, {
          source: 'campaign',
          scope: campaign.slug,
          scopeName: campaign.name,
        }),
      ),
    );
  }

  return rows;
}

/** Template choices of a campaign (`.lazydm/vault.json` → `templates.campaigns.<slug>`): type → path or `builtin`. */
function readCampaignRules(rootPath, campaignSlug) {
  const rules = readVaultConfig(rootPath)?.templates?.campaigns?.[campaignSlug];
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    return {};
  }

  const types = new Set([
    ...TEMPLATE_NOTE_TYPES,
    ...listCampaignTemplateTypes(rootPath, campaignSlug),
  ]);
  return Object.fromEntries(
    Object.entries(rules).filter(
      ([type, value]) => types.has(type) && (value === BUILT_IN_RULE || isTemplatePath(value)),
    ),
  );
}

/** Updates the vault config with `update(campaigns)` on its `templates.campaigns` map (empty entries dropped). */
function updateCampaignRules(rootPath, update) {
  const config = readVaultConfig(rootPath) ?? {};
  const templates =
    config.templates && typeof config.templates === 'object' ? config.templates : {};
  const campaigns = { ...(templates.campaigns ?? {}) };
  update(campaigns);
  for (const [slug, rules] of Object.entries(campaigns)) {
    if (!rules || Object.keys(rules).length === 0) {
      delete campaigns[slug];
    }
  }

  writeVaultConfig(rootPath, { ...config, templates: { ...templates, campaigns } });
}

/** Sets (or clears, with null) the template a campaign uses for a note type. */
function setCampaignRule(rootPath, campaignSlug, type, value) {
  updateCampaignRules(rootPath, (campaigns) => {
    const rules = { ...(campaigns[campaignSlug] ?? {}) };
    if (value === null) {
      delete rules[type];
    } else {
      rules[type] = value;
    }

    campaigns[campaignSlug] = rules;
  });

  return readCampaignRules(rootPath, campaignSlug);
}

/** Removes the choices pointing at a deleted template, so those types go back to automatic. */
function clearRulesForTemplate(rootPath, templatePath) {
  if (!readVaultConfig(rootPath)?.templates?.campaigns) {
    return;
  }

  updateCampaignRules(rootPath, (campaigns) => {
    for (const [slug, rules] of Object.entries(campaigns)) {
      campaigns[slug] = Object.fromEntries(
        Object.entries(rules ?? {}).filter(([, value]) => value !== templatePath),
      );
    }
  });
}

function templateExists(rootPath, templatePath) {
  return isTemplatePath(templatePath) && fs.existsSync(resolveInsideVault(rootPath, templatePath));
}

/** Campaign slug or `compendium/<system>` of a folder, or null outside both. */
function getScopeOfFolder(folderPath) {
  const segments = folderPath.split('/').filter(Boolean);
  if (segments[0] === COMPENDIUM_DIR_NAME) {
    return segments.length > 1
      ? { kind: 'system', slug: segments[1], path: `${COMPENDIUM_DIR_NAME}/${segments[1]}` }
      : null;
  }

  return segments.length > 0 ? { kind: 'campaign', slug: segments[0], path: segments[0] } : null;
}

/**
 * Template text for a new note in `folderPath`: the campaign's choice for the type, else the scope's own
 * `_templates/<type>.md` (compendium systems), else the vault's `_templates/<type>.md`, else the built-in.
 * Null when the type has no template at all.
 */
async function resolveTemplate(rootPath, { folderPath, type }) {
  const scope = getScopeOfFolder(folderPath);
  const candidates = [];

  if (scope?.kind === 'campaign') {
    const rule = readCampaignRules(rootPath, scope.slug)[type];
    if (rule === BUILT_IN_RULE) {
      return getBuiltInTemplate(type);
    }

    if (rule) {
      candidates.push(rule);
    }
  } else if (scope?.kind === 'system') {
    candidates.push(`${scope.path}/${TEMPLATES_DIR_NAME}/${type}${MARKDOWN_EXTENSION}`);
  }

  candidates.push(`${TEMPLATES_DIR_NAME}/${type}${MARKDOWN_EXTENSION}`);
  for (const candidate of candidates) {
    if (templateExists(rootPath, candidate)) {
      return fs.promises.readFile(resolveInsideVault(rootPath, candidate), 'utf8');
    }
  }

  return BUILT_IN_TEMPLATES[type] ?? null;
}

const BUILT_IN_REF_PREFIX = 'builtin:';

/** `builtin:<type>` (the default system) or `builtin:<type>@<system>` → `{ type, system }`. */
function parseBuiltInRef(ref) {
  const [type, system] = ref.slice(BUILT_IN_REF_PREFIX.length).split('@');
  return { type, system: system || DEFAULT_SYSTEM };
}

/**
 * The frontmatter keys a template declares (`ac`, `hp`, `cr`…), except the ones every note has. `template` is a
 * template path or `builtin:<type>`. These are the attributes a battle rule can read from an entity's note.
 */
async function readTemplateKeys(rootPath, template) {
  let content;
  if (template.startsWith(BUILT_IN_REF_PREFIX)) {
    const { type, system } = parseBuiltInRef(template);
    content = getBuiltInTemplate(type, system);
  } else if (templateExists(rootPath, template)) {
    content = await fs.promises.readFile(resolveInsideVault(rootPath, template), 'utf8');
  } else {
    throw new Error(`Template not found: ${template}`);
  }

  const { frontmatter } = parseMarkdownDocument(content, { sourcePath: 'template.md' });
  return Object.keys(frontmatter ?? {}).filter((key) => !['title', 'tags'].includes(key));
}

/** Display name of the campaign or system a folder belongs to, for `{{campaign}}`. */
async function readScopeName(rootPath, folderPath) {
  const scope = getScopeOfFolder(folderPath);
  if (!scope) {
    return '';
  }

  const card =
    scope.kind === 'system'
      ? await readSystem(rootPath, scope.slug)
      : await readCampaign(rootPath, scope.slug);
  return card?.name ?? scope.slug;
}

function toLocalDateString(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function replacePlaceholders(text, values, escape) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) =>
    Object.hasOwn(values, name) ? escape(values[name]) : match,
  );
}

/** Escapes a value for a YAML double-quoted string, so a title like `Klarg "the Bugbear"` keeps the frontmatter valid. */
function escapeForYaml(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Fills `{{title}}`, `{{date}}`, `{{time}}`, `{{campaign}}`, `{{section}}` and `{{type}}`; unknown
 * placeholders stay as written. Inside the frontmatter values are escaped for YAML strings.
 */
function applyPlaceholders(template, values, now = new Date()) {
  const allValues = {
    date: toLocalDateString(now),
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    ...values,
  };

  const frontmatterMatch = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(template);
  if (!frontmatterMatch) {
    return replacePlaceholders(template, allValues, (value) => value);
  }

  const head = frontmatterMatch[0];
  return (
    replacePlaceholders(head, allValues, escapeForYaml) +
    replacePlaceholders(template.slice(head.length), allValues, (value) => value)
  );
}

/** A free `_templates/<name>.md` path (`name-2`, `name-3`… when taken). */
function getFreeTemplatePath(rootPath, slug) {
  for (let index = 1; ; index++) {
    const candidate = `${TEMPLATES_DIR_NAME}/${index === 1 ? slug : `${slug}-${index}`}${MARKDOWN_EXTENSION}`;
    if (!fs.existsSync(resolveInsideVault(rootPath, candidate))) {
      return candidate;
    }
  }
}

/** Writes a new vault-level template and returns its path. */
async function createTemplate(rootPath, slug, content) {
  const templatePath = getFreeTemplatePath(rootPath, slug);
  const absolutePath = resolveInsideVault(rootPath, templatePath);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  safeWriteFileAtomic(absolutePath, content);
  return templatePath;
}

async function deleteTemplate(rootPath, templatePath) {
  await trashVaultItem(resolveInsideVault(rootPath, templatePath));
  clearRulesForTemplate(rootPath, templatePath);
}

module.exports = {
  BUILT_IN_RULE,
  BUILT_IN_SYSTEMS,
  BUILT_IN_TEMPLATES,
  DEFAULT_SYSTEM,
  NON_TEMPLATE_NOTE_TYPES,
  TEMPLATE_NOTE_TYPES,
  TEMPLATES_DIR_NAME,
  applyPlaceholders,
  createTemplate,
  deleteTemplate,
  getBuiltInTemplate,
  isBuiltInSystem,
  isTemplatePath,
  listSystemsOfType,
  listTemplates,
  parseBuiltInRef,
  readCampaignRules,
  readScopeName,
  readTemplateKeys,
  resolveTemplate,
  setCampaignRule,
  templateExists,
};
