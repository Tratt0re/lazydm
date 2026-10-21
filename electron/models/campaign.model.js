const fs = require('node:fs');
const YAML = require('yaml');
const { resolveInsideVault, safeWriteFileAtomic } = require('../utils/file-utils');
const {
  parseMarkdownDocument,
  removeFrontmatterField,
  replaceDocumentTitle,
  setFrontmatterField,
} = require('../utils/markdown-parse');
const { DEFAULT_SECTIONS } = require('./section.model');
const { isCampaignDirName, readVaultConfig, writeVaultConfig } = require('./vault.model');

const CAMPAIGN_FILE_NAME = 'campaign.md';
const CAMPAIGN_NOTE_TYPE = 'campaign';
const CAMPAIGN_SECTION_DIR_NAMES = Object.freeze(DEFAULT_SECTIONS.map((section) => section.key));

/** Folder a note of a given `type` goes to by default (campaigns and compendium systems share these names). */
const NOTE_TYPE_DIR_NAMES = Object.freeze(
  Object.fromEntries(
    DEFAULT_SECTIONS.filter((section) => section.type).map((section) => [
      section.type,
      section.key,
    ]),
  ),
);

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
 * Creates the campaign folder with its `campaign.md` note. Section folders appear with their first file
 * (folders on demand), so an unused section leaves nothing on disk.
 */
async function createCampaign(rootPath, { slug, name, description }) {
  await fs.promises.mkdir(resolveInsideVault(rootPath, slug));

  safeWriteFileAtomic(
    getCampaignFilePath(rootPath, slug),
    buildCampaignNote({ name, description }),
  );
  return readCampaign(rootPath, slug);
}

/**
 * Changes the name and description of a campaign in its `campaign.md` (frontmatter `title` / `description` and
 * the `# Heading`). The folder keeps its name: the readable name lives in the content, never in the folder.
 */
async function updateCampaign(rootPath, slug, { name, description }) {
  const filePath = getCampaignFilePath(rootPath, slug);
  const original = await fs.promises.readFile(filePath, 'utf8');
  const oldTitle =
    toOptionalString(
      parseMarkdownDocument(original, { sourcePath: `${slug}/${CAMPAIGN_FILE_NAME}` }).frontmatter
        .title,
    ) ?? null;

  let content = replaceDocumentTitle(original, oldTitle, name);
  content = description
    ? setFrontmatterField(content, 'description', description)
    : removeFrontmatterField(content, 'description');
  if (content !== original) {
    safeWriteFileAtomic(filePath, content);
  }

  return readCampaign(rootPath, slug);
}

/** Config maps of `.lazydm/vault.json` that hold per-campaign entries, by their path. */
const CAMPAIGN_CONFIG_PATHS = Object.freeze([
  ['sections', 'campaigns'],
  ['templates', 'campaigns'],
  ['battleRules', 'campaigns'],
]);

/** Drops the entries of a deleted campaign (sections, template and battle rule choices) from the vault config. */
function forgetCampaignSettings(rootPath, slug) {
  const config = readVaultConfig(rootPath);
  if (!config) {
    return;
  }

  let changed = false;
  const next = { ...config };
  for (const [group, key] of CAMPAIGN_CONFIG_PATHS) {
    const map = config[group]?.[key];
    if (map && typeof map === 'object' && Object.hasOwn(map, slug)) {
      const { [slug]: _removed, ...rest } = map;
      next[group] = { ...config[group], [key]: rest };
      changed = true;
    }
  }

  if (changed) {
    writeVaultConfig(rootPath, next);
  }
}

module.exports = {
  CAMPAIGN_SECTION_DIR_NAMES,
  NOTE_TYPE_DIR_NAMES,
  campaignFolderExists,
  createCampaign,
  forgetCampaignSettings,
  listCampaigns,
  readCampaign,
  updateCampaign,
};
