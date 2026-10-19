const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hashContent, resolveInsideVault, safeWriteFileAtomic } = require('../utils/file-utils');
const { parseSectionFolder } = require('./section.model');

const ENCOUNTER_EXTENSION = '.json';
const ENCOUNTERS_SECTION_KEY = 'encounters';
const ENCOUNTER_VERSION = 1;
const ENCOUNTER_NAME_MAX_LENGTH = 120;
const ENCOUNTER_NOTES_MAX_LENGTH = 20000;
const ENCOUNTER_RULE_MAX_LENGTH = 255;
const ENTITIES_MAX = 500;
const ENTITY_NAME_MAX_LENGTH = 120;
const ENTITY_ID_MAX_LENGTH = 64;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function toEntityId(value) {
  return toText(value, ENTITY_ID_MAX_LENGTH) ?? crypto.randomUUID();
}

/**
 * Values of an entity by rule field key. Any JSON value is kept as it is (numbers, text, `{ current, max, temp }`
 * of a health bar, status lists…): the encounter page and the rule decide what a key means, so a value the
 * rule no longer lists survives a change of rule.
 */
function normalizeValues(value) {
  return isPlainObject(value) ? JSON.parse(JSON.stringify(value)) : {};
}

/** An entity with every field optional: only its `id` is guaranteed. */
function normalizeEntity(entity) {
  if (!isPlainObject(entity)) {
    return null;
  }

  return {
    id: toEntityId(entity.id),
    name: toText(entity.name, ENTITY_NAME_MAX_LENGTH),
    values: normalizeValues(entity.values),
    isDead: entity.isDead === true,
  };
}

/**
 * An encounter read from a file. Missing or wrong fields get defaults instead of failing, so a hand-edited or
 * minimal file still opens; entity ids are made unique.
 */
function normalizeEncounter(value, fallbackName) {
  const source = isPlainObject(value) ? value : {};
  const ids = new Set();
  const entities = (Array.isArray(source.entities) ? source.entities : [])
    .slice(0, ENTITIES_MAX)
    .map(normalizeEntity)
    .filter((entity) => {
      if (!entity || ids.has(entity.id)) {
        return false;
      }

      ids.add(entity.id);
      return true;
    });
  const battle = isPlainObject(source.battle) ? source.battle : {};
  const isRunning = battle.status === 'running';

  return {
    version: ENCOUNTER_VERSION,
    name: toText(source.name, ENCOUNTER_NAME_MAX_LENGTH) ?? fallbackName,
    notes:
      typeof source.notes === 'string' ? source.notes.slice(0, ENCOUNTER_NOTES_MAX_LENGTH) : '',
    rule: toText(source.rule, ENCOUNTER_RULE_MAX_LENGTH),
    battle: {
      status: isRunning ? 'running' : 'idle',
      round: isRunning && Number.isInteger(battle.round) && battle.round > 0 ? battle.round : isRunning ? 1 : 0,
      turnId: isRunning && ids.has(battle.turnId) ? battle.turnId : null,
    },
    entities,
  };
}

/** Encounters are `.json` files in the Encounters section of a scope (or in one of its sub-folders). */
function assertEncounterPath(relativePath) {
  const isJson = path.posix.extname(relativePath).toLocaleLowerCase() === ENCOUNTER_EXTENSION;
  const folder = parseSectionFolder(path.posix.dirname(relativePath));
  if (!isJson || folder?.section !== ENCOUNTERS_SECTION_KEY) {
    throw new Error(`Not an encounter file: ${relativePath}`);
  }
}

function serialize(encounter) {
  return `${JSON.stringify(encounter, null, 2)}\n`;
}

function getFallbackName(relativePath) {
  return path.posix.basename(relativePath, ENCOUNTER_EXTENSION);
}

async function readEncounter(rootPath, relativePath) {
  assertEncounterPath(relativePath);
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  const buffer = await fs.promises.readFile(absolutePath);
  const stats = await fs.promises.stat(absolutePath);

  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  return {
    path: relativePath,
    encounter: normalizeEncounter(parsed, getFallbackName(relativePath)),
    parseError,
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
 * Saves an encounter only if the file still is what the page loaded (`expectedHash`). When someone else
 * changed it meanwhile nothing is written and the current version is returned, like a note save.
 */
async function writeEncounter(rootPath, relativePath, encounter, expectedHash) {
  assertEncounterPath(relativePath);
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  const currentHash = await readContentHash(absolutePath);

  if (currentHash !== null && currentHash !== expectedHash) {
    return { status: 'conflict', current: await readEncounter(rootPath, relativePath) };
  }

  const content = serialize(normalizeEncounter(encounter, getFallbackName(relativePath)));
  safeWriteFileAtomic(absolutePath, content);
  const stats = await fs.promises.stat(absolutePath);

  return {
    status: 'saved',
    contentHash: hashContent(Buffer.from(content, 'utf8')),
    mtimeMs: Math.trunc(stats.mtimeMs),
  };
}

/** Creates `<folder>/<slug>.json`, an encounter with no entity; refuses a taken name. */
async function createEncounter(rootPath, { folderPath, slug, name }) {
  const relativePath = `${folderPath.replace(/\/+$/, '')}/${slug}${ENCOUNTER_EXTENSION}`;
  assertEncounterPath(relativePath);
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  if (fs.existsSync(absolutePath)) {
    throw new Error(
      `An encounter named "${slug}${ENCOUNTER_EXTENSION}" already exists in ${folderPath}.`,
    );
  }

  safeWriteFileAtomic(absolutePath, serialize(normalizeEncounter({ name }, name)));
  return readEncounter(rootPath, relativePath);
}

module.exports = {
  ENCOUNTER_EXTENSION,
  ENCOUNTER_NAME_MAX_LENGTH,
  createEncounter,
  normalizeEncounter,
  readEncounter,
  writeEncounter,
};
