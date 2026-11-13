const { DEFAULT_SIDES } = require('../models/battle-rule.model');
const { parseSectionFolder } = require('../models/section.model');

const ENCOUNTERS_SECTION = 'encounters';
/** Entities one call may insert, copies included (the file itself holds up to 500). */
const MAX_ENTITIES = 100;
const MAX_TEXT_LENGTH = 500;
const MAX_STATUSES = 20;
const MAX_NOTES_LENGTH = 20000;
const BUILT_IN_LABEL_PREFIX = 'encounters.fields.';

function isInScope(root, relativePath) {
  return relativePath === root || relativePath.startsWith(`${root}/`);
}

/** A campaign slug or `compendium/<system>`; throws for anything deeper or shallower. */
function requireScopeRoot(value) {
  const segments = value.split('/');
  const isCampaign = segments.length === 1;
  const isSystem = segments.length === 2 && segments[0] === 'compendium';
  if (!isCampaign && !isSystem) {
    throw new Error(`"${value}" is not a campaign or a compendium system.`);
  }

  return value;
}

/**
 * The battle rule (the *Tracker layout* in the app) the encounters of a scope follow: the campaign's choice, else
 * the built-in. With `encounterPath`, the rule that one encounter uses (its own choice, else the campaign's).
 */
async function loadRule(c, root, encounterPath = null) {
  if (encounterPath) {
    return {
      rule: await c.encounter.rule({ path: encounterPath }),
      rulePath: null,
      source: 'this encounter (its own choice, else its campaign)',
    };
  }

  // Only campaigns can choose a rule; a compendium system always uses the built-in one.
  const choice = root.includes('/')
    ? null
    : (await c.battleRule.getChoice({ campaign: root })).rule;
  // A built-in reference is `builtin` or `builtin:<system>`; a rule file is a path (it has a `/`).
  if (choice?.includes('/')) {
    return {
      rule: (await c.battleRule.read({ path: choice })).rule,
      rulePath: choice,
      source: 'the campaign',
    };
  }

  const { builtIn, builtIns } = await c.battleRule.list();
  const chosen = choice ? builtIns.find((item) => item.ref === choice) : null;
  return {
    rule: chosen?.rule ?? builtIn,
    rulePath: null,
    source: chosen ? `the campaign (built-in ${chosen.rule.name})` : 'the built-in default',
  };
}

/** The frontmatter keys the rule's template declares: what an entity's linked note can provide. */
async function readNoteKeys(c, rule) {
  if (!rule.template) {
    return [];
  }

  try {
    return (await c.battleRule.attributes({ template: rule.template })).keys;
  } catch {
    return [];
  }
}

function describeValueFormat(field, rule) {
  const fromNote = field.source.startsWith('frontmatter:')
    ? ` If the entity links a note, this is read from its frontmatter key "${field.source.slice('frontmatter:'.length)}" when no value is set.`
    : '';
  switch (field.component) {
    case 'initiative':
      return `number: the turn order, highest first.${rule.initiative?.roll ? ` The app rolls ${rule.initiative.roll}.` : ''}`;
    case 'number':
      return `number.${fromNote}`;
    case 'text':
      return `text.${fromNote}`;
    case 'healthbar':
      return `{ "current": number, "max": number, "temp"?: number }, or one number for a full bar.${fromNote}`;
    case 'statuses':
      return '[{ "name": "stunned", "rounds"?: whole number }].';
    case 'side':
      return `one of: ${(field.options?.length ? field.options : DEFAULT_SIDES).join(', ')}.`;
    case 'note-link':
      return 'vault path of a note of the same campaign, e.g. "my-campaign/enemies/goblin.md".';
    default:
      return 'any.';
  }
}

/** What an agent needs to create encounters that fit the campaign: the rule, its fields and how to fill each. */
async function describeEncounterRule(c, scope, input) {
  const root = requireScopeRoot(scope.resolve(input.scope));
  const encounterPath = input.encounter ? scope.resolve(input.encounter) : null;
  if (encounterPath && !isInScope(root, encounterPath)) {
    throw new Error(`${encounterPath} is not in ${root}.`);
  }

  const { rule, rulePath, source } = await loadRule(c, root, encounterPath);
  return {
    scope: root,
    ruleName: rule.name,
    ruleChosenBy: source,
    rulePath,
    noteTemplate: rule.template,
    noteKeys: await readNoteKeys(c, rule),
    initiativeRoll: rule.initiative?.roll ?? null,
    fields: rule.fields.map((field) => ({
      key: field.key,
      component: field.component,
      label: field.label.startsWith(BUILT_IN_LABEL_PREFIX) ? field.key : field.label,
      source: field.source,
      shownInRow: field.showInRow,
      valueFormat: describeValueFormat(field, rule),
    })),
    howToUse:
      'create_encounter takes entities with a name and "values" keyed by the field keys above. Link an entity to a ' +
      'note (the note-link field) to get the stats its frontmatter keys provide, so you only set what differs. ' +
      'Encounters start idle: battles are run by the user in the app.',
  };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** One value of an entity, checked against the rule field that shows it and stored the way the page reads it. */
function normalizeFieldValue(field, raw, context) {
  const fail = (what) => {
    throw new Error(`${context.entity}: "${field.key}" (${field.component}) must be ${what}.`);
  };

  switch (field.component) {
    case 'initiative':
    case 'number':
      return isFiniteNumber(raw) ? raw : fail('a number');
    case 'text': {
      if (typeof raw !== 'string') {
        return fail('text');
      }
      return raw.trim().slice(0, MAX_TEXT_LENGTH) || undefined;
    }
    case 'healthbar': {
      if (isFiniteNumber(raw)) {
        return { current: raw, max: raw };
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return fail('a number or { current, max, temp }');
      }

      const parts = {};
      for (const part of ['current', 'max', 'temp']) {
        if (raw[part] === undefined) {
          continue;
        }
        if (!isFiniteNumber(raw[part])) {
          return fail(`numbers ("${part}" is not)`);
        }
        parts[part] = raw[part];
      }
      if (parts.current === undefined && parts.max === undefined) {
        return fail('{ current, max } with at least one of them');
      }
      // A bar with only a maximum starts full.
      return parts.current === undefined ? { ...parts, current: parts.max } : parts;
    }
    case 'statuses': {
      if (!Array.isArray(raw) || raw.length > MAX_STATUSES) {
        return fail(`a list of at most ${MAX_STATUSES} { name, rounds? }`);
      }

      return raw.map((status) => {
        const name = typeof status?.name === 'string' ? status.name.trim() : '';
        const hasRounds = status?.rounds !== undefined;
        if (!name || (hasRounds && !(Number.isInteger(status.rounds) && status.rounds > 0))) {
          return fail('a list of { name, rounds? } with a whole number of rounds');
        }
        return hasRounds ? { name, rounds: status.rounds } : { name };
      });
    }
    case 'side': {
      const allowed = field.options?.length ? field.options : DEFAULT_SIDES;
      return allowed.includes(raw) ? raw : fail(`one of: ${allowed.join(', ')}`);
    }
    case 'note-link': {
      if (typeof raw !== 'string' || !raw.toLowerCase().endsWith('.md')) {
        return fail('the vault path of a note (.md)');
      }

      const notePath = context.scope.resolve(raw);
      if (!isInScope(context.root, notePath)) {
        return fail(`a note of ${context.root} (an encounter links only its own campaign)`);
      }
      return notePath;
    }
    default:
      return fail('a supported field');
  }
}

/** The entities to write: values checked against the rule, copies numbered like the app does ("Goblin 1"…). */
function buildEntities(rule, input, scope, root) {
  const fields = new Map(rule.fields.map((field) => [field.key, field]));
  const entities = [];
  for (const entry of input) {
    const quantity = entry.quantity ?? 1;
    const values = {};
    for (const [key, raw] of Object.entries(entry.values ?? {})) {
      const field = fields.get(key);
      if (!field) {
        throw new Error(
          `${entry.name}: the rule "${rule.name}" has no field "${key}". Fields: ${[...fields.keys()].join(', ')}.`,
        );
      }

      const value = normalizeFieldValue(field, raw, { entity: entry.name, scope, root });
      if (value !== undefined) {
        values[key] = value;
      }
    }

    for (let index = 1; index <= quantity; index += 1) {
      entities.push({
        name: quantity > 1 ? `${entry.name} ${index}` : entry.name,
        values: structuredClone(values),
        isDead: false,
      });
    }
  }
  if (entities.length > MAX_ENTITIES) {
    throw new Error(`At most ${MAX_ENTITIES} entities per encounter, copies included.`);
  }

  return entities;
}

/**
 * Creates an encounter in an Encounters folder and fills it. Everything is checked first (the folder, the rule's
 * fields, every value), so a bad request creates nothing. The battle stays idle: the user runs it in the app.
 */
async function createEncounter(c, scope, input) {
  const folder = scope.resolve(input.folder);
  const location = parseSectionFolder(folder);
  if (!location || location.section !== ENCOUNTERS_SECTION) {
    throw new Error(
      `${folder} is not an Encounters folder (for example "my-campaign/encounters").`,
    );
  }

  const { rule } = await loadRule(c, location.scope);
  const entities = buildEntities(rule, input.entities ?? [], scope, location.scope);
  const notes = typeof input.notes === 'string' ? input.notes.slice(0, MAX_NOTES_LENGTH) : '';

  const created = await c.encounter.create({ folder, name: input.name });
  if (entities.length > 0 || notes) {
    let saved;
    try {
      saved = await c.encounter.write({
        path: created.path,
        encounter: { ...created.encounter, notes, entities },
        expectedHash: created.contentHash,
      });
    } catch (error) {
      throw new Error(
        `Created ${created.path} but could not fill it: ${error instanceof Error ? error.message : error}`,
      );
    }
    if (saved.status !== 'saved') {
      throw new Error(
        `Created ${created.path} but it changed before it could be filled. Read it again.`,
      );
    }
  }

  return {
    path: created.path,
    linkTarget: created.path.slice(created.path.lastIndexOf('/') + 1),
    name: input.name,
    entities: entities.length,
    rule: rule.name,
  };
}

module.exports = {
  createEncounter,
  describeEncounterRule,
};
