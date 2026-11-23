const fs = require('node:fs');
const { hashContent, resolveInsideVault, safeWriteFileAtomic } = require('../utils/file-utils');
const { toSlug } = require('../utils/string-sanitize');
const { QUICK_REFERENCE_FILE_NAME } = require('./vault.model');

const QUICK_REFERENCE_VERSION = 1;
const SYSTEMS = Object.freeze(['generic', 'dnd5e', 'pf2e']);
const DEFAULT_ICON = 'book-open';
/** Icons a rule may use (names of the app's icon registry); anything else becomes `DEFAULT_ICON`. */
const QUICK_REFERENCE_ICONS = Object.freeze([
  'book-open',
  'footprints',
  'swords',
  'shield',
  'skull',
  'lock',
  'eye',
  'eye-off',
  'hand',
  'ghost',
  'mountain',
  'anchor',
  'brain',
  'heart',
  'moon',
  'sun',
  'sparkles',
  'clock',
  'info',
  'users',
  'dices',
  'star',
  'cloud',
  'link',
  'arrow-right',
  'arrow-down',
  'triangle-alert',
  'ban',
  'lightbulb',
  'volume-x',
]);
/** Caps in one place, like the zip caps. A payload past them is cut, never refused whole. */
const QUICK_REFERENCE_LIMITS = Object.freeze({
  fileBytes: 1024 * 1024,
  categories: 50,
  rules: 500,
  idLength: 64,
  sourceLength: 100,
  categoryName: 60,
  title: 80,
  short: 200,
  full: 8000,
  attribution: 2000,
});

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAMPAIGN_SLUG_PATTERN = ID_PATTERN;
// Everything below space except tab and line breaks, and DEL.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** One line of text: control characters out, white space collapsed, cut to `maxLength`; null when empty. */
function toLine(value, maxLength) {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value
    .replace(CONTROL_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return text.length > 0 ? text : null;
}

/** Text of several lines (Markdown): control characters out, line breaks kept, cut to `maxLength`. */
function toBlock(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(CONTROL_CHARACTERS, '').replace(/\r\n?/g, '\n').trim().slice(0, maxLength)
    : '';
}

/** A unique, slug-shaped id: the one given when it is valid, else made from `fallbackText`. */
function takeId(value, fallbackText, used) {
  const given = typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
  const base =
    (given ?? toSlug(fallbackText)).slice(0, QUICK_REFERENCE_LIMITS.idLength - 4) || 'item';
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) {
    id = `${base}-${suffix}`;
  }

  used.add(id);
  return id;
}

/**
 * The clean version of anything that claims to be a quick reference: only the known fields survive (so prototype
 * keys and unknown keys never do), wrong types become defaults, caps cut, ids are made unique, and a category id
 * a rule lists that does not exist is dropped (the rule then shows under *Uncategorised*).
 *
 * @returns {{ data: object, warnings: { code: string, count?: number }[] }}
 */
function normalizeQuickReference(value) {
  const source = isPlainObject(value) ? value : {};
  const warnings = [];
  const warn = (code, count) => warnings.push(count === undefined ? { code } : { code, count });
  const limits = QUICK_REFERENCE_LIMITS;

  if (!isPlainObject(value)) {
    warn('not-an-object');
  }
  if (Number.isInteger(source.formatVersion) && source.formatVersion > QUICK_REFERENCE_VERSION) {
    warn('newer-format');
  }

  const rawCategories = Array.isArray(source.categories) ? source.categories : [];
  if (rawCategories.length > limits.categories) {
    warn('categories-cut', rawCategories.length - limits.categories);
  }
  const categoryIds = new Set();
  const categories = [];
  for (const raw of rawCategories.slice(0, limits.categories)) {
    const name = isPlainObject(raw) ? toLine(raw.name, limits.categoryName) : null;
    if (!name) {
      warn('category-dropped');
      continue;
    }

    categories.push({ id: takeId(raw.id, name, categoryIds), name });
  }

  const rawRules = Array.isArray(source.rules) ? source.rules : [];
  if (rawRules.length > limits.rules) {
    warn('rules-cut', rawRules.length - limits.rules);
  }
  const ruleIds = new Set();
  const rules = [];
  let danglingCategories = 0;
  for (const raw of rawRules.slice(0, limits.rules)) {
    const title = isPlainObject(raw) ? toLine(raw.title, limits.title) : null;
    if (!title) {
      warn('rule-dropped');
      continue;
    }

    const listed = Array.isArray(raw.categories) ? raw.categories : [];
    const ruleCategories = [...new Set(listed.filter((id) => categoryIds.has(id)))];
    danglingCategories += listed.length - ruleCategories.length;
    const rule = {
      id: takeId(raw.id, title, ruleIds),
      title,
      short: toLine(raw.short, limits.short) ?? '',
      full: toBlock(raw.full, limits.full),
      icon: QUICK_REFERENCE_ICONS.includes(raw.icon) ? raw.icon : DEFAULT_ICON,
      categories: ruleCategories,
    };
    if (
      typeof raw.source === 'string' &&
      raw.source.length <= limits.sourceLength &&
      SOURCE_PATTERN.test(raw.source)
    ) {
      rule.source = raw.source;
    }

    rules.push(rule);
  }
  if (danglingCategories > 0) {
    warn('category-links-dropped', danglingCategories);
  }

  return {
    data: {
      formatVersion: QUICK_REFERENCE_VERSION,
      system: SYSTEMS.includes(source.system) ? source.system : 'generic',
      categories,
      rules,
      attribution: toBlock(source.attribution, limits.attribution),
    },
    warnings,
  };
}

/** An empty sheet with one warning: what a text that cannot be read turns into. */
function unreadable(code) {
  const { data } = normalizeQuickReference({});
  return { data, warnings: [{ code }] };
}

/**
 * Reads the text of a file: size cap first, then `JSON.parse` in a try, then `normalizeQuickReference`.
 * A text that is not JSON gives an empty sheet and a `parse-error` warning, never an exception.
 */
function parseQuickReference(text) {
  if (typeof text !== 'string') {
    return unreadable('parse-error');
  }
  if (Buffer.byteLength(text, 'utf8') > QUICK_REFERENCE_LIMITS.fileBytes) {
    return unreadable('too-large');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return unreadable('parse-error');
  }

  return normalizeQuickReference(parsed);
}

function serialize(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** The absolute path of the campaign's file; refuses a campaign that does not exist (nothing is created for it). */
function resolveFile(rootPath, slug) {
  if (typeof slug !== 'string' || !CAMPAIGN_SLUG_PATTERN.test(slug)) {
    throw new Error('A campaign is needed to open its quick reference.');
  }
  if (!fs.existsSync(resolveInsideVault(rootPath, `${slug}/campaign.md`))) {
    throw new Error(`Campaign not found: ${slug}`);
  }

  const relativePath = `${slug}/${QUICK_REFERENCE_FILE_NAME}`;
  return { relativePath, absolutePath: resolveInsideVault(rootPath, relativePath) };
}

/**
 * The quick reference of a campaign. A campaign with no file yet answers `exists: false`, an empty sheet and no
 * hash, so the first save (`expectedHash: null`) creates it.
 */
async function readQuickReference(rootPath, slug) {
  const { relativePath, absolutePath } = resolveFile(rootPath, slug);
  let buffer;
  try {
    buffer = await fs.promises.readFile(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        path: relativePath,
        exists: false,
        ...normalizeQuickReference({}),
        contentHash: null,
        mtimeMs: null,
      };
    }

    throw error;
  }

  const stats = await fs.promises.stat(absolutePath);
  return {
    path: relativePath,
    exists: true,
    ...parseQuickReference(buffer.toString('utf8')),
    contentHash: hashContent(buffer),
    mtimeMs: Math.trunc(stats.mtimeMs),
  };
}

async function readContentHash(absolutePath) {
  try {
    return hashContent(await fs.promises.readFile(absolutePath));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

/**
 * Saves the sheet only if the file still is what the page loaded (`expectedHash`; null for a file that does not
 * exist yet). When something else changed it meanwhile (a cloud sync from another computer) nothing is written and
 * the current version comes back, like an encounter save. What is written is always the clean version.
 */
async function writeQuickReference(rootPath, slug, data, expectedHash) {
  const { absolutePath } = resolveFile(rootPath, slug);
  const currentHash = await readContentHash(absolutePath);
  if (currentHash !== null && currentHash !== expectedHash) {
    return { status: 'conflict', current: await readQuickReference(rootPath, slug) };
  }

  const normalized = normalizeQuickReference(data);
  const content = serialize(normalized.data);
  if (Buffer.byteLength(content, 'utf8') > QUICK_REFERENCE_LIMITS.fileBytes) {
    throw new Error('The quick reference is too big to save.');
  }

  safeWriteFileAtomic(absolutePath, content);
  const stats = await fs.promises.stat(absolutePath);
  return {
    status: 'saved',
    data: normalized.data,
    warnings: normalized.warnings,
    contentHash: hashContent(Buffer.from(content, 'utf8')),
    mtimeMs: Math.trunc(stats.mtimeMs),
  };
}

module.exports = {
  DEFAULT_ICON,
  QUICK_REFERENCE_FILE_NAME,
  QUICK_REFERENCE_ICONS,
  QUICK_REFERENCE_LIMITS,
  QUICK_REFERENCE_VERSION,
  SYSTEMS,
  normalizeQuickReference,
  parseQuickReference,
  readQuickReference,
  serialize,
  writeQuickReference,
};
