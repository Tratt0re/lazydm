const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

function ensureString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function containsControlCharacters(value) {
  return CONTROL_CHARACTER_PATTERN.test(String(value ?? ''));
}

function startsWithFormulaPrefix(value) {
  return FORMULA_PREFIX_PATTERN.test(String(value ?? '').trim());
}

function normalizeWhitespace(value) {
  return ensureString(value, 'value').trim().replace(/\s+/g, ' ');
}

function normalizeTrimmedString(value) {
  return ensureString(value, 'value').trim();
}

function toCaseInsensitiveLookupKey(value) {
  return normalizeWhitespace(value).toLocaleLowerCase();
}

const SLUG_APOSTROPHE_PATTERN = /['’]/g;
const SLUG_SEPARATOR_PATTERN = /[^\p{L}\p{N}]+/gu;
const SLUG_MAX_LENGTH = 64;
const WINDOWS_RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/**
 * Turns a display name into a folder/file name: lowercase words joined by `-`
 * (`Lost Mine of Phandelver` → `lost-mine-of-phandelver`). Letters of every script are kept.
 */
function toSlug(value) {
  const slug = normalizeWhitespace(value)
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(SLUG_APOSTROPHE_PATTERN, '')
    .replace(SLUG_SEPARATOR_PATTERN, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');

  return WINDOWS_RESERVED_NAMES.has(slug) ? `${slug}-1` : slug;
}

module.exports = {
  containsControlCharacters,
  normalizeTrimmedString,
  normalizeWhitespace,
  startsWithFormulaPrefix,
  toCaseInsensitiveLookupKey,
  toSlug,
};
