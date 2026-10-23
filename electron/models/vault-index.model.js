const path = require('node:path');
const { getVaultIndexDatabase } = require('../database/vault-index-db');
const { isCampaignDirName } = require('./vault.model');

const MARKDOWN_EXTENSION = '.md';

function getFileKind(relativePath) {
  return path.posix.extname(relativePath).toLocaleLowerCase() === MARKDOWN_EXTENSION
    ? 'md'
    : 'asset';
}

/** Markdown notes are linked by name without extension (`[[goblin-boss]]`), assets by full file name. */
function getFileName(relativePath) {
  const baseName = path.posix.basename(relativePath);
  return getFileKind(relativePath) === 'md'
    ? baseName.slice(0, -MARKDOWN_EXTENSION.length)
    : baseName;
}

const COMPENDIUM_DIR_NAME = 'compendium';

/**
 * Scope of a file (stored in `files.campaign`): links only resolve inside it. A campaign folder
 * (`lost-mine`), a compendium system (`compendium/my-system`), or null for other vault-level files.
 */
function getCampaignSlug(relativePath) {
  const segments = relativePath.split('/');
  if (segments.length < 2) {
    return null;
  }

  const [rootDir, systemDir] = segments;
  if (rootDir === COMPENDIUM_DIR_NAME) {
    return segments.length > 2 ? `${COMPENDIUM_DIR_NAME}/${systemDir}` : null;
  }

  return isCampaignDirName(rootDir) ? rootDir : null;
}

function listFileStates() {
  const rows = getVaultIndexDatabase()
    .prepare('SELECT id, path, size, mtime_ms, content_hash FROM files')
    .all();

  return new Map(rows.map((row) => [row.path, row]));
}

function getFileState(relativePath) {
  return (
    getVaultIndexDatabase()
      .prepare('SELECT id, path, size, mtime_ms, content_hash FROM files WHERE path = ?')
      .get(relativePath) ?? null
  );
}

/** Files of a vault folder and its sub-folders, with what the section lists show. */
function listFolderFiles(folderPath) {
  const folderPrefix = `${folderPath.replace(/\/+$/, '')}/`;
  const rows = getVaultIndexDatabase()
    .prepare(
      `SELECT f.path, f.name, f.kind, f.type, f.title, f.size, f.mtime_ms,
              (SELECT group_concat(t.tag, char(31)) FROM tags t WHERE t.file_id = f.id) AS tags
       FROM files f
       WHERE substr(f.path, 1, length(?)) = ?
       ORDER BY f.title COLLATE NOCASE, f.path`,
    )
    .all(folderPrefix, folderPrefix);

  return rows.map((row) => ({
    path: row.path,
    name: row.name,
    kind: row.kind,
    type: row.type,
    title: row.title,
    size: row.size,
    mtimeMs: row.mtime_ms,
    tags: row.tags ? row.tags.split('\u001f') : [],
  }));
}

/** Links written in a file, with the vault path they resolve to (null when broken). */
function listOutgoingLinks(sourcePath) {
  return getVaultIndexDatabase()
    .prepare(
      `SELECT l.target_raw AS raw, l.kind, l.target_name AS targetName, l.target_heading AS heading,
              t.path AS resolvedPath, t.title AS resolvedTitle
       FROM links l
       JOIN files s ON s.id = l.source_file_id
       LEFT JOIN files t ON t.id = l.target_file_id
       WHERE s.path = ?
       ORDER BY l.line, l.id`,
    )
    .all(sourcePath);
}

/** Links that resolve to a file (self-links included), with the note they are written in. */
function listIncomingLinks(targetPath) {
  return getVaultIndexDatabase()
    .prepare(
      `SELECT s.path AS sourcePath, s.title AS sourceTitle, l.target_raw AS raw, l.kind, l.line
       FROM links l
       JOIN files s ON s.id = l.source_file_id
       JOIN files t ON t.id = l.target_file_id
       WHERE t.path = ?
       ORDER BY s.title COLLATE NOCASE, s.path, l.line, l.id`,
    )
    .all(targetPath);
}

/** Links written in the notes of a campaign that resolve to no file (templates excluded: their links are placeholders). */
function listBrokenLinks(campaign) {
  return getVaultIndexDatabase()
    .prepare(
      `SELECT s.path AS sourcePath, s.title AS sourceTitle, l.target_raw AS raw, l.kind,
              l.target_name AS targetName, l.target_heading AS heading, l.line
       FROM links l
       JOIN files s ON s.id = l.source_file_id
       WHERE s.campaign = ? AND l.target_file_id IS NULL AND l.target_name <> ''
         AND s.path NOT LIKE '%/!_templates/%' ESCAPE '!'
       ORDER BY s.title COLLATE NOCASE, s.path, l.line, l.id`,
    )
    .all(campaign);
}

/** Files a link written in a scope can resolve to (templates excluded), for the editor's link suggestions. */
function listScopeFiles(scope) {
  return getVaultIndexDatabase()
    .prepare(
      `SELECT path, name, kind, type, title
       FROM files
       WHERE campaign IS ? AND path NOT LIKE '%/!_templates/%' ESCAPE '!'
       ORDER BY title COLLATE NOCASE, path`,
    )
    .all(scope);
}

/** Assets of a scope with a given size in bytes: the candidates a new asset could be a copy of. */
function listScopeAssetsOfSize(scope, size) {
  return getVaultIndexDatabase()
    .prepare(`SELECT path FROM files WHERE campaign IS ? AND kind = 'asset' AND size = ? ORDER BY path`)
    .all(scope, size)
    .map((row) => row.path);
}

/** Notes of a scope (templates excluded), for the Review page. */
function listScopeNotes(scope) {
  return getVaultIndexDatabase()
    .prepare(
      `SELECT path, title
       FROM files
       WHERE campaign IS ? AND kind = 'md' AND path NOT LIKE '%/!_templates/%' ESCAPE '!'
       ORDER BY path`,
    )
    .all(scope);
}

/**
 * Whether a scope (campaign or `compendium/<system>`) already has a file with this link name: a link
 * resolving by name there would find it, so there is no need to copy another one in.
 */
function hasFileNamed(scope, name) {
  return Boolean(
    getVaultIndexDatabase()
      .prepare('SELECT 1 FROM files WHERE campaign IS ? AND name = ? COLLATE NOCASE LIMIT 1')
      .get(scope, name),
  );
}

/**
 * Full-text search within a campaign (or compendium scope). Searches both title and body.
 * @param {string|null} scope - Campaign slug (e.g. `lost-mine`) or `compendium/<system>`, or null for all.
 * @param {string} term - Raw user input; sanitised and converted to a prefix FTS5 query.
 * @returns {{ path: string, title: string, kind: string, type: string|null, snippet: string }[]}
 */
function searchFiles(scope, term) {
  // Sanitise: strip FTS5 operators, collapse whitespace, require at least one word.
  const words = term
    .replace(/["""''*^():\-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  // Each word as a quoted prefix term — safe against special chars, still allows partial matches.
  const query = words.map((w) => `"${w.replace(/"/g, ' ')}"*`).join(' ');

  return getVaultIndexDatabase()
    .prepare(
      `SELECT f.path,
              COALESCE(f.title, f.name) AS title,
              f.kind,
              f.type,
              snippet(files_fts, 1, '<m>', '</m>', '…', 20) AS snippet
       FROM files_fts
       JOIN files f ON files_fts.rowid = f.id
       WHERE (? IS NULL OR f.campaign IS ?)
         AND f.path NOT LIKE '%/!_templates/%' ESCAPE '!'
         AND files_fts MATCH ?
       ORDER BY rank
       LIMIT 20`,
    )
    .all(scope, scope, query);
}

function countFiles() {
  return getVaultIndexDatabase().prepare('SELECT COUNT(*) AS total FROM files').get().total;
}

function upsertFileRow(database, record) {
  return database
    .prepare(
      `INSERT INTO files (path, name, extension, campaign, kind, type, title, size, mtime_ms, content_hash, frontmatter_json, indexed_at_ms)
       VALUES (@path, @name, @extension, @campaign, @kind, @type, @title, @size, @mtime_ms, @content_hash, @frontmatter_json, @indexed_at_ms)
       ON CONFLICT(path) DO UPDATE SET
         name = excluded.name,
         extension = excluded.extension,
         campaign = excluded.campaign,
         kind = excluded.kind,
         type = excluded.type,
         title = excluded.title,
         size = excluded.size,
         mtime_ms = excluded.mtime_ms,
         content_hash = excluded.content_hash,
         frontmatter_json = excluded.frontmatter_json,
         indexed_at_ms = excluded.indexed_at_ms
       RETURNING id`,
    )
    .get(record).id;
}

function clearFileDetails(database, fileId) {
  database.prepare('DELETE FROM links WHERE source_file_id = ?').run(fileId);
  database.prepare('DELETE FROM tags WHERE file_id = ?').run(fileId);
  database.prepare('DELETE FROM headings WHERE file_id = ?').run(fileId);
  database.prepare('DELETE FROM files_fts WHERE rowid = ?').run(fileId);
}

function insertFileDetails(database, fileId, title, document) {
  const insertLink = database.prepare(
    `INSERT INTO links (source_file_id, target_raw, target_path, target_name, target_heading, label, kind, line)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertTag = database.prepare('INSERT OR IGNORE INTO tags (file_id, tag) VALUES (?, ?)');
  const insertHeading = database.prepare(
    'INSERT INTO headings (file_id, level, text, line) VALUES (?, ?, ?, ?)',
  );

  for (const link of document.links) {
    insertLink.run(
      fileId,
      link.raw,
      link.targetPath,
      link.targetName,
      link.heading,
      link.label,
      link.kind,
      link.line,
    );
  }

  for (const tag of document.tags) {
    insertTag.run(fileId, tag);
  }

  for (const heading of document.headings) {
    insertHeading.run(fileId, heading.level, heading.text, heading.line);
  }

  database
    .prepare('INSERT INTO files_fts (rowid, title, body) VALUES (?, ?, ?)')
    .run(fileId, title, document.body);
}

/**
 * Stores one vault file in the index, replacing what was indexed for it before.
 *
 * @param {{ path: string, size: number, mtimeMs: number, contentHash?: string|null }} file - File stats.
 * @param {ReturnType<import('../utils/markdown-parse').parseMarkdownDocument>|null} document - Parsed markdown, null for assets.
 * @param {string|null} titleOverride - Title of a file that is not a note (an encounter shows its name, not `x.json`).
 */
function saveFile(file, document = null, titleOverride = null) {
  const database = getVaultIndexDatabase();
  const name = getFileName(file.path);
  const title = document?.title ?? titleOverride ?? name;

  database.transaction(() => {
    const fileId = upsertFileRow(database, {
      path: file.path,
      name,
      extension: path.posix.extname(file.path).toLocaleLowerCase(),
      campaign: getCampaignSlug(file.path),
      kind: getFileKind(file.path),
      type: document?.type ?? null,
      title,
      size: file.size,
      mtime_ms: file.mtimeMs,
      content_hash: file.contentHash ?? null,
      frontmatter_json: document ? JSON.stringify(document.frontmatter) : null,
      indexed_at_ms: Date.now(),
    });

    clearFileDetails(database, fileId);
    if (document) {
      insertFileDetails(database, fileId, title, document);
    }
  })();
}

/** Updates the stats of a file whose content did not change (same hash), keeping its parsed data. */
function touchFile(fileId, file) {
  getVaultIndexDatabase()
    .prepare('UPDATE files SET size = ?, mtime_ms = ?, indexed_at_ms = ? WHERE id = ?')
    .run(file.size, file.mtimeMs, Date.now(), fileId);
}

/** Removes files from the index; `relativePath` may be a file or a folder (everything below it is removed). */
function deletePath(relativePath) {
  const database = getVaultIndexDatabase();
  const folderPrefix = `${relativePath.replace(/\/+$/, '')}/`;

  return database.transaction(() => {
    const rows = database
      .prepare('SELECT id FROM files WHERE path = ? OR substr(path, 1, length(?)) = ?')
      .all(relativePath, folderPrefix, folderPrefix);

    for (const row of rows) {
      database.prepare('DELETE FROM files_fts WHERE rowid = ?').run(row.id);
      database.prepare('DELETE FROM files WHERE id = ?').run(row.id);
    }

    return rows.length;
  })();
}

function deleteAll() {
  const database = getVaultIndexDatabase();
  database.transaction(() => {
    database.prepare('DELETE FROM files_fts').run();
    database.prepare('DELETE FROM files').run();
  })();
}

/**
 * Re-resolves every link target, only among the files of the source's own scope (its campaign, or its
 * compendium system): a campaign never resolves into the compendium or another campaign. Order of
 * preference: exact path, path suffix (`enemies/grimlock`), then by name, then the shortest path.
 * Heading-only links (`[[#Treasure]]`) point to their own file.
 */
function resolveLinks() {
  getVaultIndexDatabase()
    .prepare(
      `UPDATE links SET target_file_id = CASE
         WHEN links.target_name = '' THEN links.source_file_id
         ELSE (
           SELECT f.id
           FROM files f, files s
           WHERE s.id = links.source_file_id
             AND f.campaign IS s.campaign
             AND (
               f.path = links.target_path
               OR f.path = links.target_path || '.md'
               OR substr(f.path, -length('/' || links.target_path)) = '/' || links.target_path
               OR substr(f.path, -length('/' || links.target_path || '.md')) = '/' || links.target_path || '.md'
               OR f.name = links.target_name COLLATE NOCASE
             )
           ORDER BY
             (f.path = links.target_path OR f.path = links.target_path || '.md') DESC,
             (substr(f.path, -length('/' || links.target_path)) = '/' || links.target_path
               OR substr(f.path, -length('/' || links.target_path || '.md')) = '/' || links.target_path || '.md') DESC,
             length(f.path) ASC
           LIMIT 1
         )
       END`,
    )
    .run();
}

module.exports = {
  countFiles,
  deleteAll,
  searchFiles,
  deletePath,
  getCampaignSlug,
  getFileKind,
  getFileName,
  hasFileNamed,
  getFileState,
  listBrokenLinks,
  listFileStates,
  listFolderFiles,
  listIncomingLinks,
  listOutgoingLinks,
  listScopeAssetsOfSize,
  listScopeFiles,
  listScopeNotes,
  resolveLinks,
  saveFile,
  touchFile,
};
