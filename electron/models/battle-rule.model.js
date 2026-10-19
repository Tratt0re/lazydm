/**
 * Battle rules: the configuration of an encounter's entity rows (like a note template, for the initiative
 * list). A rule lists the fields of a row in order; the encounter stores each entity's values by field key.
 */

const BATTLE_RULE_VERSION = 1;
const BATTLE_RULE_NAME_MAX_LENGTH = 80;
const BATTLE_RULE_FIELDS_MAX = 40;
const FIELD_KEY_MAX_LENGTH = 40;
const FIELD_LABEL_MAX_LENGTH = 60;
const INITIATIVE_ROLL_MAX_LENGTH = 40;
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const FRONTMATTER_SOURCE_PREFIX = 'frontmatter:';

/** What a field shows and edits: the components the encounter page knows. */
const FIELD_COMPONENTS = Object.freeze([
  'initiative',
  'text',
  'number',
  'healthbar',
  'statuses',
  'side',
  'note-link',
]);

/** Sides an entity can take when the rule's `side` field does not list its own. */
const DEFAULT_SIDES = Object.freeze(['enemy', 'player', 'ally']);

/** Rule value of a campaign or an encounter that uses the built-in rule. */
const BUILT_IN_RULE = 'builtin';

function entityField(key, component, extra = {}) {
  return Object.freeze({
    key,
    component,
    label: `encounters.fields.${key}`,
    source: 'entity',
    showInRow: true,
    ...extra,
  });
}

/**
 * Rule shipped with the app: system-neutral (initiative, side, AC, HP bar, statuses, linked note). It has no
 * roll formula, so *Roll initiative* is not offered. Read-only; *Customize* copies it out.
 */
const DEFAULT_BATTLE_RULE = Object.freeze({
  version: BATTLE_RULE_VERSION,
  name: 'Generic',
  initiative: Object.freeze({ roll: null }),
  fields: Object.freeze([
    entityField('initiative', 'initiative'),
    entityField('side', 'side', { options: DEFAULT_SIDES }),
    entityField('ac', 'number'),
    entityField('hp', 'healthbar'),
    entityField('statuses', 'statuses'),
    entityField('note', 'note-link'),
  ]),
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

/** `entity` or `frontmatter:<key>`; anything else is the entity itself. */
function normalizeSource(value) {
  if (typeof value !== 'string' || !value.startsWith(FRONTMATTER_SOURCE_PREFIX)) {
    return 'entity';
  }

  const key = value.slice(FRONTMATTER_SOURCE_PREFIX.length).trim().slice(0, FIELD_KEY_MAX_LENGTH);
  return key.length > 0 ? `${FRONTMATTER_SOURCE_PREFIX}${key}` : 'entity';
}

function normalizeField(field) {
  if (!isPlainObject(field)) {
    return null;
  }

  const key = typeof field.key === 'string' ? field.key.trim() : '';
  if (
    !FIELD_KEY_PATTERN.test(key) ||
    key.length > FIELD_KEY_MAX_LENGTH ||
    !FIELD_COMPONENTS.includes(field.component)
  ) {
    return null;
  }

  const options = Array.isArray(field.options)
    ? field.options.map((option) => toText(option, FIELD_KEY_MAX_LENGTH)).filter(Boolean)
    : [];
  return {
    key,
    component: field.component,
    label: toText(field.label, FIELD_LABEL_MAX_LENGTH) ?? key,
    source: normalizeSource(field.source),
    showInRow: field.showInRow !== false,
    ...(options.length > 0 ? { options } : {}),
  };
}

/**
 * A rule read from a file: unknown components, bad keys and duplicate keys are dropped instead of failing, so
 * a hand-edited rule still opens. A rule left with no field falls back to the built-in one.
 */
function normalizeBattleRule(value) {
  if (!isPlainObject(value)) {
    return DEFAULT_BATTLE_RULE;
  }

  const seen = new Set();
  const fields = (Array.isArray(value.fields) ? value.fields : [])
    .slice(0, BATTLE_RULE_FIELDS_MAX)
    .map(normalizeField)
    .filter((field) => {
      if (!field || seen.has(field.key)) {
        return false;
      }

      seen.add(field.key);
      return true;
    });
  if (fields.length === 0) {
    return DEFAULT_BATTLE_RULE;
  }

  return {
    version: BATTLE_RULE_VERSION,
    name: toText(value.name, BATTLE_RULE_NAME_MAX_LENGTH) ?? DEFAULT_BATTLE_RULE.name,
    initiative: {
      roll: isPlainObject(value.initiative)
        ? toText(value.initiative.roll, INITIATIVE_ROLL_MAX_LENGTH)
        : null,
    },
    fields,
  };
}

module.exports = {
  BATTLE_RULE_VERSION,
  BUILT_IN_RULE,
  DEFAULT_BATTLE_RULE,
  DEFAULT_SIDES,
  FIELD_COMPONENTS,
  FRONTMATTER_SOURCE_PREFIX,
  normalizeBattleRule,
};
