const { battleRuleModel, encounterModel } = require('../models');
const { toSlug } = require('../utils/string-sanitize');
const vaultController = require('./vault.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

function requirePath(body, key = 'path') {
  return requireString(body[key], `payload.${key}`);
}

function read(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return encounterModel.readEncounter(vaultController.getReadyVaultPath(), requirePath(body));
}

/**
 * Battle rule of an encounter: its own choice, else its campaign's, else the built-in. `rule` in the payload is
 * the choice the page has just made (a path or `builtin`; null for none), before it reaches the file.
 */
async function rule(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const vaultPath = vaultController.getReadyVaultPath();
  const encounterPath = requirePath(body);
  const selection =
    body.rule === undefined
      ? (await encounterModel.readEncounter(vaultPath, encounterPath)).encounter.rule
      : (normalizeOptionalString(body.rule, 'payload.rule', { allowNull: true }) ?? null);
  return battleRuleModel.resolveBattleRule(vaultPath, encounterPath, selection);
}

/** The party roster of the campaign or system at `scope`, created the first time. */
function party(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const scope = requireString(body.scope, 'payload.scope');
  const name = requireString(body.name, 'payload.name', {
    maxLength: encounterModel.ENCOUNTER_NAME_MAX_LENGTH,
  });
  if (scope.split('/').some((segment) => segment === '..' || segment.length === 0)) {
    throw new Error('payload.scope is not a campaign or a compendium system.');
  }

  return encounterModel.openParty(vaultController.getReadyVaultPath(), scope, name);
}

function write(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const expectedHash =
    normalizeOptionalString(body.expectedHash, 'payload.expectedHash', { allowNull: true }) ?? null;

  return encounterModel.writeEncounter(
    vaultController.getReadyVaultPath(),
    requirePath(body),
    ensurePlainObject(body.encounter, 'payload.encounter'),
    expectedHash,
  );
}

function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const name = requireString(body.name, 'payload.name', {
    maxLength: encounterModel.ENCOUNTER_NAME_MAX_LENGTH,
  });
  const slug = toSlug(name);
  if (slug.length === 0) {
    throw new Error('payload.name must contain at least one letter or number.');
  }

  return encounterModel.createEncounter(vaultController.getReadyVaultPath(), {
    folderPath: requirePath(body, 'folder'),
    slug,
    name,
  });
}

module.exports = {
  create,
  party,
  read,
  rule,
  write,
};
