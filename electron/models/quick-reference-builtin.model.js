const fs = require('node:fs');
const path = require('node:path');
const campaignModel = require('./campaign.model');
const quickReference = require('./quick-reference.model');

/** Languages the app speaks (`public/i18n`); the built-in rules are written in each. */
const BUILTIN_LANGUAGES = Object.freeze(['en', 'it', 'de', 'es', 'fr', 'uk', 'zh']);
const FALLBACK_LANGUAGE = 'en';
/** Where the built-in data lives; `LAZYDM_QUICK_REFERENCE_DATA` points tests at a copy they can change. */
const DATA_DIR =
  process.env.LAZYDM_QUICK_REFERENCE_DATA ?? path.join(__dirname, '..', 'data', 'quick-reference');

/**
 * A built-in system is a folder of `electron/data/quick-reference/<system>/`: `rules.json` holds the structure (ids,
 * icons, categories of each rule, the credit line) and `<language>.json` the words (category names, then title,
 * short and full text of each rule). The words are kept apart so a language is one file to write and to check.
 */
const cache = new Map();

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function loadStructure(system) {
  if (!quickReference.SYSTEMS.includes(system) || system === 'generic') {
    return null;
  }
  const key = `${system}/structure`;
  if (!cache.has(key)) {
    cache.set(key, readJson(path.join(DATA_DIR, system, 'rules.json')));
  }

  return cache.get(key);
}

function loadWords(system, language) {
  const key = `${system}/${language}`;
  if (!cache.has(key)) {
    cache.set(key, readJson(path.join(DATA_DIR, system, `${language}.json`)));
  }

  return cache.get(key);
}

/** A language the app has; anything else is English. */
function toLanguage(value) {
  return BUILTIN_LANGUAGES.includes(value) ? value : FALLBACK_LANGUAGE;
}

/** Whether a system ships rules (`generic` and a system with no data yet do not). */
function hasBuiltin(system) {
  return loadStructure(system) !== null;
}

/** The ids of every built-in rule of a system, for tests and for the reset. */
function listBuiltinRuleIds(system) {
  return (loadStructure(system)?.rules ?? []).map((rule) => rule.id);
}

/**
 * The built-in rules of a system in a language, as quick reference data. A word missing from the language comes
 * from English, so a half-translated file never leaves a card empty.
 */
function buildBuiltin(system, language) {
  const structure = loadStructure(system);
  if (!structure) {
    return null;
  }

  const fallback = loadWords(system, FALLBACK_LANGUAGE) ?? { categories: {}, rules: {} };
  const words = loadWords(system, toLanguage(language)) ?? fallback;
  const pick = (id, field) => words.rules?.[id]?.[field] ?? fallback.rules?.[id]?.[field] ?? '';

  return quickReference.normalizeQuickReference({
    formatVersion: quickReference.QUICK_REFERENCE_VERSION,
    system,
    categories: structure.categories.map((id) => ({
      id,
      name: words.categories?.[id] ?? fallback.categories?.[id] ?? id,
    })),
    rules: structure.rules.map((rule) => ({
      id: rule.id,
      title: pick(rule.id, 'title') || rule.id,
      short: pick(rule.id, 'short'),
      full: pick(rule.id, 'full'),
      icon: rule.icon,
      categories: rule.categories,
      source: `${system}/${rule.id}`,
    })),
    attribution: structure.attribution,
  }).data;
}

/**
 * Creates the campaign's file from its game system's built-in rules, in `language`, when it has none. Never
 * touches a file that exists (a campaign that was edited, emptied or made on purpose stays as it is), and never
 * creates one for a system with no rules. Answers the file as read, so the page has one result either way.
 */
async function seedQuickReference(rootPath, slug, language) {
  const current = await quickReference.readQuickReference(rootPath, slug);
  if (current.exists) {
    return current;
  }

  const campaign = await campaignModel.readCampaign(rootPath, slug);
  const seed = campaign?.system ? buildBuiltin(campaign.system, language) : null;
  if (!seed) {
    return current;
  }

  await quickReference.writeQuickReference(rootPath, slug, seed, null);
  return quickReference.readQuickReference(rootPath, slug);
}

/**
 * Adds the built-in rules of `system` to the file, never replacing anything: a category with the same id and a rule
 * with the same `source` are left as they are, whatever the user did to them. This is the Generic campaign's
 * *Start from…*, and it can be run again to bring back a rule that was deleted.
 */
async function addBuiltinRules(rootPath, slug, system, language, expectedHash) {
  const builtin = buildBuiltin(system, language);
  if (!builtin) {
    throw new Error(`There are no built-in rules for ${system}.`);
  }

  const current = await quickReference.readQuickReference(rootPath, slug);
  const categoryIds = new Set(current.data.categories.map((category) => category.id));
  const sources = new Set(current.data.rules.map((rule) => rule.source).filter(Boolean));
  const ruleIds = new Set(current.data.rules.map((rule) => rule.id));
  const rules = builtin.rules
    .filter((rule) => !sources.has(rule.source))
    .map((rule) => {
      let id = rule.id;
      for (let suffix = 2; ruleIds.has(id); suffix += 1) {
        id = `${rule.id}-${suffix}`;
      }
      ruleIds.add(id);
      return { ...rule, id };
    });

  return quickReference.writeQuickReference(
    rootPath,
    slug,
    {
      ...current.data,
      system: current.data.system === 'generic' ? system : current.data.system,
      categories: [
        ...current.data.categories,
        ...builtin.categories.filter((category) => !categoryIds.has(category.id)),
      ],
      rules: [...current.data.rules, ...rules],
      attribution: current.data.attribution || builtin.attribution,
    },
    expectedHash === undefined ? current.contentHash : expectedHash,
  );
}

/**
 * Puts one rule back to its built-in words and icon, in `language`. Its categories stay as the user set them. A rule
 * with no `source` (the user's own) has nothing to go back to.
 */
async function resetBuiltinRule(rootPath, slug, ruleId, language, expectedHash) {
  const current = await quickReference.readQuickReference(rootPath, slug);
  const rule = current.data.rules.find((item) => item.id === ruleId);
  if (!rule) {
    throw new Error(`There is no rule "${ruleId}" in this quick reference.`);
  }

  const [system] = (rule.source ?? '').split('/');
  const builtin = rule.source ? buildBuiltin(system, language) : null;
  const original = builtin?.rules.find((item) => item.source === rule.source);
  if (!original) {
    throw new Error(`"${rule.title}" is not a built-in rule: there is nothing to reset it to.`);
  }

  return quickReference.writeQuickReference(
    rootPath,
    slug,
    {
      ...current.data,
      rules: current.data.rules.map((item) =>
        item.id === ruleId
          ? {
              ...item,
              title: original.title,
              short: original.short,
              full: original.full,
              icon: original.icon,
            }
          : item,
      ),
    },
    expectedHash === undefined ? current.contentHash : expectedHash,
  );
}

module.exports = {
  BUILTIN_LANGUAGES,
  FALLBACK_LANGUAGE,
  addBuiltinRules,
  buildBuiltin,
  hasBuiltin,
  listBuiltinRuleIds,
  resetBuiltinRule,
  seedQuickReference,
  toLanguage,
};
