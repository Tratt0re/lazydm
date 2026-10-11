const path = require('node:path');
const { getVaultIndexDatabase } = require('../database/vault-index-db');

const MARKDOWN_EXTENSION = '.md';
const RESERVED_ROOT_DIR_NAMES = new Set(['compendium']);

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

/** The campaign is the first folder of the path, unless it is a vault-level folder (`compendium`, `_templates`). */
function getCampaignSlug(relativePath) {
  const segments = relativePath.split('/');
  if (segments.length < 2) {
    return null;
  }

  const [rootDir] = segments;
  return RESERVED_ROOT_DIR_NAMES.has(rootDir) || rootDir.startsWith('_') ? null : rootDir;
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
 */
function saveFile(file, document = null) {
  const database = getVaultIndexDatabase();
  const name = getFileName(file.path);
  const title = document?.title ?? name;

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
 * Re-resolves every link target. Order of preference: exact path, path suffix (`monsters/grimlock`),
 * then by name — same campaign first, then vault-level files (compendium), then the shortest path.
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
             (f.campaign IS s.campaign) DESC,
             (f.campaign IS NULL) DESC,
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
  deletePath,
  getFileKind,
  getFileState,
  listFileStates,
  resolveLinks,
  saveFile,
  touchFile,
};
