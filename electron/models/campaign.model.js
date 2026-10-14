const fs = require('node:fs');
const YAML = require('yaml');
const { resolveInsideVault, safeWriteFileAtomic } = require('../utils/file-utils');
const { parseMarkdownDocument } = require('../utils/markdown-parse');
const { isCampaignDirName } = require('./vault.model');

const CAMPAIGN_FILE_NAME = 'campaign.md';
const CAMPAIGN_NOTE_TYPE = 'campaign';
const CAMPAIGN_SECTION_DIR_NAMES = Object.freeze([
  'scenes',
  'characters',
  'enemies',
  'spells',
  'items',
  'quests',
  'locations',
  'world',
  'encounters',
  'handouts',
  'sessions',
  'assets',
]);

/** Folder a note of a given `type` goes to (campaigns and compendium systems share these names). */
const NOTE_TYPE_DIR_NAMES = Object.freeze({
  scene: 'scenes',
  character: 'characters',
  enemy: 'enemies',
  spell: 'spells',
  item: 'items',
  quest: 'quests',
  location: 'locations',
  world: 'world',
  encounter: 'encounters',
  handout: 'handouts',
  session: 'sessions',
});

function getCampaignFilePath(rootPath, slug) {
  return resolveInsideVault(rootPath, `${slug}/${CAMPAIGN_FILE_NAME}`);
}

function toOptionalString(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toCampaign(slug, document) {
  return {
    slug,
    name: toOptionalString(document.frontmatter.title) ?? document.title ?? slug,
    description: toOptionalString(document.frontmatter.description),
    created: toOptionalString(document.frontmatter.created),
    cover: toOptionalString(document.frontmatter.cover),
  };
}

async function readCampaign(rootPath, slug) {
  const campaignFilePath = getCampaignFilePath(rootPath, slug);
  if (!fs.existsSync(campaignFilePath)) {
    return null;
  }

  const text = await fs.promises.readFile(campaignFilePath, 'utf8');
  return toCampaign(
    slug,
    parseMarkdownDocument(text, { sourcePath: `${slug}/${CAMPAIGN_FILE_NAME}` }),
  );
}

/** A campaign is a top-level folder of the vault that contains a `campaign.md` note. */
async function listCampaigns(rootPath) {
  const entries = await fs.promises.readdir(resolveInsideVault(rootPath), { withFileTypes: true });
  const campaigns = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !isCampaignDirName(entry.name)) {
      continue;
    }

    try {
      const campaign = await readCampaign(rootPath, entry.name);
      if (campaign) {
        campaigns.push(campaign);
      }
    } catch (error) {
      console.warn('[electron] Failed to read campaign ->', entry.name, error);
    }
  }

  return campaigns.sort((left, right) => left.name.localeCompare(right.name));
}

function campaignFolderExists(rootPath, slug) {
  return fs.existsSync(resolveInsideVault(rootPath, slug));
}

function buildCampaignNote({ name, description }) {
  const frontmatter = {
    type: CAMPAIGN_NOTE_TYPE,
    title: name,
    ...(description ? { description } : {}),
    created: new Date().toISOString().slice(0, 10),
  };
  const body = description ? `# ${name}\n\n${description}\n` : `# ${name}\n`;

  return `---\n${YAML.stringify(frontmatter)}---\n${body}`;
}

/**
 * Creates the default section folders that are missing (campaigns made with an older folder set get the
 * new ones when opened). Existing folders and their content are never touched.
 */
async function ensureSectionFolders(rootPath, slug) {
  for (const sectionDirName of CAMPAIGN_SECTION_DIR_NAMES) {
    await fs.promises.mkdir(resolveInsideVault(rootPath, `${slug}/${sectionDirName}`), {
      recursive: true,
    });
  }
}

/** Creates the campaign folder with its `campaign.md` note and the default section folders. */
async function createCampaign(rootPath, { slug, name, description }) {
  await fs.promises.mkdir(resolveInsideVault(rootPath, slug));
  await ensureSectionFolders(rootPath, slug);

  safeWriteFileAtomic(
    getCampaignFilePath(rootPath, slug),
    buildCampaignNote({ name, description }),
  );
  return readCampaign(rootPath, slug);
}

module.exports = {
  CAMPAIGN_SECTION_DIR_NAMES,
  NOTE_TYPE_DIR_NAMES,
  campaignFolderExists,
  createCampaign,
  ensureSectionFolders,
  listCampaigns,
  readCampaign,
};
