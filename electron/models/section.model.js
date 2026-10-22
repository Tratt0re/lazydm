const fs = require('node:fs');
const { resolveInsideVault } = require('../utils/file-utils');
const { toSlug } = require('../utils/string-sanitize');
const { readVaultConfig, writeVaultConfig } = require('./vault.model');

/**
 * Default sections of a campaign, in sidebar order: folder (also the route segment), note type (null for
 * assets: no notes), icon (ArcTechUI icon name). The single list both Electron and Angular use.
 */
const DEFAULT_SECTIONS = Object.freeze([
  { key: 'scenes', type: 'scene', icon: 'clapperboard' },
  { key: 'characters', type: 'character', icon: 'users' },
  { key: 'enemies', type: 'enemy', icon: 'skull' },
  { key: 'spells', type: 'spell', icon: 'sparkles' },
  { key: 'items', type: 'item', icon: 'backpack' },
  { key: 'quests', type: 'quest', icon: 'scroll-text' },
  { key: 'locations', type: 'location', icon: 'map-pin' },
  { key: 'world', type: 'world', icon: 'globe' },
  { key: 'encounters', type: 'encounter', icon: 'swords', isSpecial: true },
  { key: 'maps', type: 'map', icon: 'map', isSpecial: true },
  { key: 'handouts', type: 'handout', icon: 'mail-open' },
  { key: 'sessions', type: 'session', icon: 'calendar' },
  { key: 'assets', type: null, icon: 'image', isSpecial: true },
]);

/**
 * Sections that do not hold plain notes (encounters are special files, assets are any other file): no
 * *New note*, and their sub-folders only organise files — they are not sub-types.
 */
const SPECIAL_SECTION_KEYS = Object.freeze(
  DEFAULT_SECTIONS.filter((section) => section.isSpecial).map((section) => section.key),
);

/** Sections a new campaign can start with (the default sections that hold notes); the special ones are always there. */
const SECTION_PRESETS = Object.freeze(DEFAULT_SECTIONS.filter((section) => !section.isSpecial));

/** Folders a compendium system can have besides the default sections: notes whose type has no section. */
const COMPENDIUM_EXTRA_SECTIONS = Object.freeze([{ key: 'notes', type: null, icon: 'file-text' }]);

/** Folder names a custom section cannot take (other folders and routes of a campaign). */
const RESERVED_SECTION_KEYS = Object.freeze(['notes', 'broken-links', 'review', 'monsters']);
/** Note types a custom section cannot take (cards, and renamed types still read under their new name). */
const RESERVED_NOTE_TYPES = Object.freeze(['campaign', 'system', 'monster']);
const SECTION_LABEL_MAX_LENGTH = 40;
const SECTION_DESCRIPTION_MAX_LENGTH = 200;
const CUSTOM_SECTIONS_MAX = 30;
const DEFAULT_CUSTOM_ICON = 'folder';
const COMPENDIUM_DIR_NAME = 'compendium';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toStringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function toLabel(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, SECTION_LABEL_MAX_LENGTH)
    : null;
}

function toDescription(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, SECTION_DESCRIPTION_MAX_LENGTH)
    : null;
}

function toIcon(value) {
  return typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value) ? value : DEFAULT_CUSTOM_ICON;
}

function isPresetKey(key) {
  return SECTION_PRESETS.some((section) => section.key === key);
}

/** An existing top-level folder of a campaign (not hidden, not `_`), by name. */
function isCampaignFolder(rootPath, campaignSlug, name) {
  if (typeof name !== 'string' || !/^[^./_\\][^/\\]*$/.test(name)) {
    return false;
  }

  try {
    return fs.statSync(resolveInsideVault(rootPath, `${campaignSlug}/${name}`)).isDirectory();
  } catch (_) {
    return false;
  }
}

/** Settings of a campaign as stored, cleaned of anything malformed (the file may be edited by hand). */
function readCampaignSectionSettings(rootPath, campaignSlug) {
  const raw = readVaultConfig(rootPath)?.sections?.campaigns?.[campaignSlug];
  const settings = isPlainObject(raw) ? raw : {};
  const labels = isPlainObject(settings.labels) ? settings.labels : {};

  return {
    hidden: toStringList(settings.hidden),
    order: toStringList(settings.order),
    removed: toStringList(settings.removed).filter((key) => isPresetKey(key)),
    labels: Object.fromEntries(
      Object.entries(labels)
        .map(([key, label]) => [key, toLabel(label)])
        .filter(([, label]) => label !== null),
    ),
    custom: (Array.isArray(settings.custom) ? settings.custom : [])
      .filter((section) => isPlainObject(section) && typeof section.key === 'string')
      .map((section) => ({
        key: section.key,
        type: typeof section.type === 'string' ? section.type : section.key,
        label: toLabel(section.label) ?? section.key,
        icon: toIcon(section.icon),
        description: toDescription(section.description),
      })),
  };
}

/**
 * Every section of a campaign (hidden ones included), in its sidebar order: the ordered keys first, then
 * the others in their natural order (defaults, then custom sections). `label` is null when a default
 * section keeps its translated name.
 */
function listCampaignSections(rootPath, campaignSlug) {
  const settings = readCampaignSectionSettings(rootPath, campaignSlug);
  const sections = [
    ...DEFAULT_SECTIONS.filter((section) => !settings.removed.includes(section.key)).map(
      (section) => ({
        ...section,
        isSpecial: section.isSpecial === true,
        label: settings.labels[section.key] ?? null,
        description: null,
        isCustom: false,
      }),
    ),
    ...settings.custom.map((section) => ({ ...section, isSpecial: false, isCustom: true })),
  ];
  const rank = (key) => {
    const index = settings.order.indexOf(key);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };

  return sections
    .map((section, index) => ({ section, index }))
    .sort(
      (left, right) => rank(left.section.key) - rank(right.section.key) || left.index - right.index,
    )
    .map(({ section }) => ({ ...section, isHidden: settings.hidden.includes(section.key) }));
}

/**
 * Validates the settings sent by the renderer and saves them. A custom section keeps the folder and type it
 * was created with (its notes live there); a new one gets both from its label unless a type is given.
 */
function saveCampaignSectionSettings(rootPath, campaignSlug, input) {
  if (!isPlainObject(input)) {
    throw new Error('payload.settings must be an object.');
  }

  const stored = readCampaignSectionSettings(rootPath, campaignSlug);
  const removed = Array.isArray(input.removed)
    ? [...new Set(toStringList(input.removed))].filter((key) => isPresetKey(key))
    : stored.removed;
  // A deleted default section frees its folder and type: the user can create a section with them again.
  const liveDefaults = DEFAULT_SECTIONS.filter((section) => !removed.includes(section.key));
  const takenKeys = new Set([
    ...liveDefaults.map((section) => section.key),
    ...RESERVED_SECTION_KEYS,
  ]);
  const takenTypes = new Set([
    ...liveDefaults.map((section) => section.type).filter(Boolean),
    ...RESERVED_NOTE_TYPES,
  ]);

  const requestedCustom = Array.isArray(input.custom) ? input.custom : [];
  if (requestedCustom.length > CUSTOM_SECTIONS_MAX) {
    throw new Error(`A campaign can have at most ${CUSTOM_SECTIONS_MAX} custom sections.`);
  }

  const custom = requestedCustom.map((section, index) => {
    if (!isPlainObject(section)) {
      throw new Error(`payload.settings.custom[${index}] must be an object.`);
    }

    const label = toLabel(section.label);
    if (!label) {
      throw new Error(`payload.settings.custom[${index}].label is required.`);
    }

    const existing = stored.custom.find((item) => item.key === section.key);
    // A folder already in the campaign (Review → Add as section) keeps its own name as the section key.
    const folderKey =
      !existing && isCampaignFolder(rootPath, campaignSlug, section.key) ? section.key : null;
    const key = existing?.key ?? folderKey ?? toSlug(label);
    const requestedType = typeof section.type === 'string' ? toSlug(section.type) : '';
    const type = existing?.type ?? (requestedType || key);
    if (!key) {
      throw new Error(`The section name "${label}" must contain a letter or a number.`);
    }
    if (takenKeys.has(key)) {
      throw new Error(`A section already uses the folder "${key}".`);
    }
    if (takenTypes.has(type)) {
      throw new Error(`A section already uses the note type "${type}".`);
    }

    takenKeys.add(key);
    takenTypes.add(type);
    return {
      key,
      type,
      label,
      icon: toIcon(section.icon ?? existing?.icon),
      description: toDescription(section.description),
    };
  });

  const keys = new Set([
    ...liveDefaults.map((section) => section.key),
    ...custom.map((section) => section.key),
  ]);
  const labels = isPlainObject(input.labels) ? input.labels : {};
  const settings = {
    hidden: [...new Set(toStringList(input.hidden))].filter((key) => keys.has(key)),
    order: [...new Set(toStringList(input.order))].filter((key) => keys.has(key)),
    removed,
    labels: Object.fromEntries(
      Object.entries(labels)
        .filter(([key]) => DEFAULT_SECTIONS.some((section) => section.key === key))
        .map(([key, label]) => [key, toLabel(label)])
        .filter(([, label]) => label !== null),
    ),
    custom,
  };

  const config = readVaultConfig(rootPath) ?? {};
  const sections = isPlainObject(config.sections) ? config.sections : {};
  const campaigns = { ...(isPlainObject(sections.campaigns) ? sections.campaigns : {}) };
  const isEmpty =
    settings.hidden.length === 0 &&
    settings.order.length === 0 &&
    settings.removed.length === 0 &&
    Object.keys(settings.labels).length === 0 &&
    settings.custom.length === 0;
  if (isEmpty) {
    delete campaigns[campaignSlug];
  } else {
    campaigns[campaignSlug] = settings;
  }

  writeVaultConfig(rootPath, { ...config, sections: { ...sections, campaigns } });
  return listCampaignSections(rootPath, campaignSlug);
}

/** Note types of a campaign's sections (custom ones included), for its template choices. */
function listCampaignNoteTypes(rootPath, campaignSlug) {
  return listCampaignSections(rootPath, campaignSlug)
    .map((section) => section.type)
    .filter(Boolean);
}

/** Note types with a section somewhere in the vault: the defaults and every campaign's custom types. */
function listNoteTypes(rootPath) {
  const campaigns = readVaultConfig(rootPath)?.sections?.campaigns;
  const types = new Set(DEFAULT_SECTIONS.map((section) => section.type).filter(Boolean));
  for (const slug of Object.keys(isPlainObject(campaigns) ? campaigns : {})) {
    for (const section of readCampaignSectionSettings(rootPath, slug).custom) {
      types.add(section.type);
    }
  }

  return [...types];
}

/**
 * Folder a note of `type` goes to in a scope (`lost-mine` or `compendium/<system>`): the campaign's section
 * for it (custom ones included), else the default section for the type. Null when none has the type.
 */
function findSectionKeyForType(rootPath, scope, type) {
  if (!type) {
    return null; // untyped notes have no section (assets has no type either)
  }

  const isCampaign = typeof scope === 'string' && scope.length > 0 && !scope.includes('/');
  const sections = isCampaign ? listCampaignSections(rootPath, scope) : DEFAULT_SECTIONS;
  return sections.find((section) => section.type === type)?.key ?? null;
}

/** A folder name that is neither `.`/`..` nor hidden/special (`.x`, `_x`): `..` would resolve to the parent folder. */
function isPlainFolderSegment(segment) {
  return segment !== '.' && segment !== '..' && !segment.startsWith('.') && !segment.startsWith('_');
}

/**
 * Where a folder sits in the section layout: `<scope>/<section>` or one sub-folder below it,
 * `<scope>/<section>/<sub-folder>` (scope: a campaign or `compendium/<system>`). Null for anything else
 * (vault root, scope root, deeper folders).
 */
function parseSectionFolder(folderPath) {
  const segments = String(folderPath ?? '').replace(/\/+$/, '').split('/').filter(Boolean);
  if (!segments.every(isPlainFolderSegment)) {
    return null;
  }

  const depth = segments[0] === COMPENDIUM_DIR_NAME ? 2 : 1;
  if (segments.length !== depth + 1 && segments.length !== depth + 2) {
    return null;
  }

  return {
    scope: segments.slice(0, depth).join('/'),
    section: segments[depth],
    subfolder: segments[depth + 1] ?? null,
  };
}

/** Sections of a scope: a campaign's (custom ones included) or a compendium system's (defaults and `notes/`). */
function listScopeSections(rootPath, scope) {
  return scope.includes('/')
    ? [...DEFAULT_SECTIONS, ...COMPENDIUM_EXTRA_SECTIONS]
    : listCampaignSections(rootPath, scope);
}

/** Settings of a new campaign that starts with the given presets only (the others are marked removed). */
function initCampaignSections(rootPath, campaignSlug, presetKeys) {
  const chosen = new Set(toStringList(presetKeys));
  return saveCampaignSectionSettings(rootPath, campaignSlug, {
    removed: SECTION_PRESETS.filter((section) => !chosen.has(section.key)).map(
      (section) => section.key,
    ),
  });
}

module.exports = {
  COMPENDIUM_EXTRA_SECTIONS,
  DEFAULT_SECTIONS,
  SECTION_PRESETS,
  SPECIAL_SECTION_KEYS,
  initCampaignSections,
  findSectionKeyForType,
  listCampaignNoteTypes,
  listCampaignSections,
  listNoteTypes,
  listScopeSections,
  isPlainFolderSegment,
  parseSectionFolder,
  readCampaignSectionSettings,
  saveCampaignSectionSettings,
};
