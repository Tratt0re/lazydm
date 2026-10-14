const fs = require('node:fs');
const path = require('node:path');
const { resolveInsideVault, safeWriteFileAtomic } = require('../utils/file-utils');
const { renameLinkFolder, rewriteLinks } = require('../utils/markdown-parse');
const { COMPENDIUM_DIR_NAME } = require('./compendium.model');
const {
  VAULT_CONFIG_SCHEMA_VERSION,
  isCampaignDirName,
  listVaultFiles,
  readVaultConfig,
  writeVaultConfig,
} = require('./vault.model');

const TEMPLATES_DIR_NAME = '_templates';
const MARKDOWN_EXTENSION = '.md';
const FRONTMATTER_BLOCK_PATTERN = /^(﻿?---\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)(?:\r?\n|$))/;

/** Sections renamed in vault format 2: folder, note type and the type's template file. */
const RENAMED_SECTIONS = Object.freeze([
  { fromDir: 'monsters', toDir: 'enemies', fromType: 'monster', toType: 'enemy' },
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Campaign folders and compendium systems (`lost-mine`, `compendium/dnd-5e`): where sections live. */
async function listScopeDirs(rootPath) {
  const scopes = [];
  const rootEntries = await fs.promises.readdir(resolveInsideVault(rootPath), {
    withFileTypes: true,
  });
  for (const entry of rootEntries) {
    if (entry.isDirectory() && isCampaignDirName(entry.name)) {
      scopes.push(entry.name);
    }
  }

  const compendiumPath = resolveInsideVault(rootPath, COMPENDIUM_DIR_NAME);
  if (fs.existsSync(compendiumPath)) {
    const systemEntries = await fs.promises.readdir(compendiumPath, { withFileTypes: true });
    for (const entry of systemEntries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        scopes.push(`${COMPENDIUM_DIR_NAME}/${entry.name}`);
      }
    }
  }

  return scopes;
}

/**
 * Renames a folder, or moves its entries into the new folder when that one already exists. An entry whose
 * name is taken stays where it is (never overwritten); the old folder is removed only once empty.
 */
async function moveFolder(rootPath, fromPath, toPath, report) {
  const fromAbsolute = resolveInsideVault(rootPath, fromPath);
  if (!fs.existsSync(fromAbsolute)) {
    return;
  }

  const toAbsolute = resolveInsideVault(rootPath, toPath);
  if (!fs.existsSync(toAbsolute)) {
    await fs.promises.rename(fromAbsolute, toAbsolute);
    report.moved.push(`${fromPath} → ${toPath}`);
    return;
  }

  for (const entryName of await fs.promises.readdir(fromAbsolute)) {
    const target = path.join(toAbsolute, entryName);
    if (fs.existsSync(target)) {
      report.skipped.push(`${fromPath}/${entryName}`);
    } else {
      await fs.promises.rename(path.join(fromAbsolute, entryName), target);
      report.moved.push(`${fromPath}/${entryName} → ${toPath}/${entryName}`);
    }
  }

  if ((await fs.promises.readdir(fromAbsolute)).length === 0) {
    await fs.promises.rmdir(fromAbsolute);
  }
}

/** Renames `_templates/<old type>.md` to `<new type>.md` when free, remembering old path → new path. */
function renameTemplateFile(rootPath, templatesDir, rename, report, renamedTemplates) {
  const fromPath = `${templatesDir}/${rename.fromType}${MARKDOWN_EXTENSION}`;
  const toPath = `${templatesDir}/${rename.toType}${MARKDOWN_EXTENSION}`;
  const fromAbsolute = resolveInsideVault(rootPath, fromPath);
  if (!fs.existsSync(fromAbsolute)) {
    return;
  }

  if (fs.existsSync(resolveInsideVault(rootPath, toPath))) {
    report.skipped.push(fromPath);
    return;
  }

  fs.renameSync(fromAbsolute, resolveInsideVault(rootPath, toPath));
  renamedTemplates.set(fromPath, toPath);
  report.moved.push(`${fromPath} → ${toPath}`);
}

/** Sets `type: <new>` where the frontmatter says `type: <old>`; quotes, comments and every other line kept. */
function renameFrontmatterType(content, fromType, toType) {
  const match = content.match(FRONTMATTER_BLOCK_PATTERN);
  if (!match) {
    return content;
  }

  const typeLinePattern = new RegExp(
    `^(type[ \\t]*:[ \\t]*)(["']?)${escapeRegExp(fromType)}\\2([ \\t]*(?:#.*)?)$`,
    'im',
  );
  const frontmatter = match[2].replace(typeLinePattern, `$1$2${toType}$2$3`);
  return frontmatter === match[2]
    ? content
    : `${match[1]}${frontmatter}${match[3]}${content.slice(match[0].length)}`;
}

/** Rewrites the notes: renamed types in the frontmatter, renamed section folders in link paths. */
async function rewriteNotes(rootPath, scopeDirs, report) {
  const parents = new Set(['', ...scopeDirs]);
  const files = await listVaultFiles(rootPath);
  for (const file of files) {
    if (file.isDataless || !file.path.toLocaleLowerCase().endsWith(MARKDOWN_EXTENSION)) {
      continue;
    }

    const absolutePath = resolveInsideVault(rootPath, file.path);
    try {
      const original = await fs.promises.readFile(absolutePath, 'utf8');
      let content = original;
      for (const rename of RENAMED_SECTIONS) {
        content = renameFrontmatterType(content, rename.fromType, rename.toType);
        content = rewriteLinks(
          content,
          (link) => renameLinkFolder(link, rename.fromDir, rename.toDir, parents),
          { sourcePath: file.path },
        ).content;
      }

      if (content !== original) {
        safeWriteFileAtomic(absolutePath, content);
        report.rewritten.push(file.path);
      }
    } catch (error) {
      console.warn('[electron] Vault migration could not rewrite ->', file.path, error);
      report.skipped.push(file.path);
    }
  }
}

/** Template choices (`templates.campaigns.<slug>.<type>`): renamed types and template files follow. */
function migrateTemplateRules(config, renamedTemplates) {
  const campaigns = config.templates?.campaigns;
  if (!isPlainObject(campaigns)) {
    return config;
  }

  const migrated = {};
  for (const [slug, rules] of Object.entries(campaigns)) {
    if (!isPlainObject(rules)) {
      migrated[slug] = rules;
      continue;
    }

    const nextRules = {};
    for (const [type, value] of Object.entries(rules)) {
      const rename = RENAMED_SECTIONS.find((item) => item.fromType === type);
      const nextType = rename ? rename.toType : type;
      if (rename && rules[nextType] !== undefined) {
        continue; // a choice already made for the new type wins
      }

      nextRules[nextType] = renamedTemplates.get(value) ?? value;
    }

    migrated[slug] = nextRules;
  }

  return { ...config, templates: { ...config.templates, campaigns: migrated } };
}

/**
 * Brings an older vault to the current format (run when the vault opens, after its files are downloaded and
 * before indexing). Format 2, Monsters → Enemies: `monsters/` folders become `enemies/` in campaigns and
 * systems, `_templates/monster.md` becomes `enemy.md`, `type: monster` becomes `enemy`, `monsters/…` link
 * paths and the template choices follow. Nothing is overwritten: what cannot move stays and is reported.
 * Every step can run again and the version is written last, so an interrupted run resumes next time.
 *
 * @returns {Promise<{ moved: string[], rewritten: string[], skipped: string[] } | null>} Null when up to date.
 */
async function migrateVault(rootPath) {
  const config = readVaultConfig(rootPath);
  const version = Number.isInteger(config?.schemaVersion) ? config.schemaVersion : 1;
  if (!config || version >= VAULT_CONFIG_SCHEMA_VERSION) {
    return null;
  }

  const report = { moved: [], rewritten: [], skipped: [] };
  const scopeDirs = await listScopeDirs(rootPath);
  const renamedTemplates = new Map();

  for (const rename of RENAMED_SECTIONS) {
    for (const scopeDir of scopeDirs) {
      await moveFolder(
        rootPath,
        `${scopeDir}/${rename.fromDir}`,
        `${scopeDir}/${rename.toDir}`,
        report,
      );
    }

    const templateDirs = [
      TEMPLATES_DIR_NAME,
      ...scopeDirs.map((dir) => `${dir}/${TEMPLATES_DIR_NAME}`),
    ];
    for (const templatesDir of templateDirs) {
      renameTemplateFile(rootPath, templatesDir, rename, report, renamedTemplates);
    }
  }

  await rewriteNotes(rootPath, scopeDirs, report);

  writeVaultConfig(rootPath, {
    ...migrateTemplateRules(readVaultConfig(rootPath) ?? config, renamedTemplates),
    schemaVersion: VAULT_CONFIG_SCHEMA_VERSION,
  });
  return report;
}

module.exports = {
  migrateVault,
};
