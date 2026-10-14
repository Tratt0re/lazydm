const {
  compendiumModel,
  documentModel,
  sectionModel,
  vaultIndexModel,
  vaultModel,
} = require('../models');
const indexerController = require('./indexer.controller');
const vaultController = require('./vault.controller');
const { ensurePlainObject, requireString } = require('./utils');

/** The card of a campaign or system: not a note of any section. */
const SCOPE_CARD_FILE_NAMES = Object.freeze(['campaign.md', 'system.md']);

/** A campaign (`lost-mine`) or a compendium system (`compendium/my-system`). */
function requireScope(value) {
  const scope = requireString(value, 'payload.scope');
  const [rootDir, systemDir, ...rest] = scope.split('/');
  const isSystem =
    rootDir === compendiumModel.COMPENDIUM_DIR_NAME &&
    rest.length === 0 &&
    Boolean(systemDir) &&
    compendiumModel.isSystemDirName(systemDir);
  if (!isSystem && (scope.includes('/') || !vaultModel.isCampaignDirName(scope))) {
    throw new Error(`payload.scope is not a campaign or compendium system: ${scope}`);
  }

  return scope;
}

function toSubtype(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const subtype = String(value).trim();
  return subtype.length > 0 ? subtype : null;
}

function emptyReview() {
  return {
    brokenLinkCount: 0,
    misplaced: [],
    wrongSubtype: [],
    untyped: [],
    outside: [],
    unknownFolders: [],
    tooDeep: [],
  };
}

/**
 * Where the files of a campaign or system disagree with its sections (computed from the index, so it follows
 * changes made outside LazyDM): notes whose type belongs to another section, whose sub-type is not their
 * sub-folder, without a type, or outside any section; folders that are not sections (campaigns only: systems
 * have no fixed folders); folders deeper than one sub-folder. Assets, scope cards and templates are not checked.
 */
async function list(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const scope = requireScope(body.scope);
  if (!indexerController.isOpen()) {
    return emptyReview();
  }

  const vaultPath = vaultController.getReadyVaultPath();
  const isCampaign = !scope.includes('/');
  const sections = sectionModel.listScopeSections(vaultPath, scope);
  const sectionByKey = new Map(sections.map((section) => [section.key, section]));
  const sectionKeyOfType = (type) => sections.find((section) => section.type === type)?.key ?? null;
  const review = {
    ...emptyReview(),
    brokenLinkCount: vaultIndexModel.listBrokenLinks(scope).length,
  };
  const deepFolders = new Map();

  for (const note of vaultIndexModel.listScopeNotes(scope)) {
    const segments = note.path.slice(scope.length + 1).split('/');
    const item = {
      path: note.path,
      title: note.title ?? segments[segments.length - 1],
      type: note.type ?? null,
      subtype: toSubtype(note.subtype),
    };

    if (segments.length === 1) {
      if (!SCOPE_CARD_FILE_NAMES.includes(segments[0])) {
        review.outside.push(item);
      }
      continue;
    }

    const section = sectionByKey.get(segments[0]);
    if (!section || !section.type || section.isSpecial || /^[._]/.test(segments[0])) {
      continue; // unknown folders are listed below; special sections (assets, encounters) and notes/ are not typed notes
    }

    if (segments.length > 3) {
      const folder = `${scope}/${segments.slice(0, -1).join('/')}`;
      deepFolders.set(folder, (deepFolders.get(folder) ?? 0) + 1);
      continue;
    }

    const location = {
      section: section.key,
      subfolder: segments.length === 3 ? segments[1] : null,
    };
    if (!item.type) {
      review.untyped.push({ ...item, ...location, sectionType: section.type });
    } else if (item.type !== section.type) {
      review.misplaced.push({
        ...item,
        ...location,
        sectionType: section.type,
        typeSection: sectionKeyOfType(item.type),
      });
    } else if (
      (item.subtype?.toLocaleLowerCase() ?? null) !==
      (location.subfolder?.toLocaleLowerCase() ?? null)
    ) {
      review.wrongSubtype.push({ ...item, ...location, sectionType: section.type });
    }
  }

  if (isCampaign) {
    const folders = await documentModel.listSubfolders(vaultPath, scope);
    review.unknownFolders = folders
      .filter((name) => !sectionByKey.has(name))
      .map((name) => ({
        name,
        fileCount: vaultIndexModel.listFolderFiles(`${scope}/${name}`).length,
      }));
  }

  review.tooDeep = [...deepFolders].map(([folder, fileCount]) => ({ folder, fileCount }));
  return review;
}

module.exports = {
  list,
};
