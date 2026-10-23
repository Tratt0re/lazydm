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

function emptyReview() {
  return {
    brokenLinkCount: 0,
    outside: [],
    unknownFolders: [],
    tooDeep: [],
  };
}

/**
 * Where the files of a campaign or system disagree with its folders (computed from the index, so it follows
 * changes made outside LazyDM): notes outside any section; folders that are not sections (campaigns only:
 * systems have no fixed folders); folders deeper than one sub-folder. A note's kind is its folder, so its
 * frontmatter is not checked. Assets, scope cards and templates are not checked either.
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
    };

    if (segments.length === 1) {
      if (!SCOPE_CARD_FILE_NAMES.includes(segments[0])) {
        review.outside.push(item);
      }
      continue;
    }

    // Unknown folders are listed below; special sections and `notes/` hold no sub-folders to check.
    const section = sectionByKey.get(segments[0]);
    if (!section || !section.type || section.isSpecial || /^[._]/.test(segments[0])) {
      continue;
    }

    if (segments.length > 3) {
      const folder = `${scope}/${segments.slice(0, -1).join('/')}`;
      deepFolders.set(folder, (deepFolders.get(folder) ?? 0) + 1);
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
