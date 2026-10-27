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

const SEARCH_LIMIT = 20;

/** Escapes the characters that mean something to LIKE, so a path such as `100%_done` is searched literally. */
function escapeLike(text) {
  return text.replace(/[!%_]/g, (character) => `!${character}`);
}

/** Notes whose path contains every word typed (case-insensitive): `scene/capitolo-1/` lists that folder. */
function searchByPath(scope, words, limit) {
  const conditions = words.map(() => "f.path LIKE ? ESCAPE '!'").join(' AND ');
  return getVaultIndexDatabase()
    .prepare(
      `SELECT f.path,
              COALESCE(f.title, f.name) AS title,
              f.kind,
              f.type,
              '' AS snippet
       FROM files f
       WHERE (? IS NULL OR f.campaign IS ?)
         AND f.kind = 'md'
         AND f.path NOT LIKE '%/!_templates/%' ESCAPE '!'
         AND ${conditions}
       ORDER BY length(f.path), f.path
       LIMIT ?`,
    )
    .all(scope, scope, ...words.map((word) => `%${escapeLike(word)}%`), limit);
}

function searchByText(scope, term, limit) {
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
       LIMIT ?`,
    )
    .all(scope, scope, query, limit);
}

/**
 * Search within a campaign (or compendium scope): the notes whose path contains what was typed come first, then the
 * full-text matches on title and body (the same note is listed once, with its text snippet when it has one).
 * @param {string|null} scope - Campaign slug (e.g. `lost-mine`) or `compendium/<system>`, or null for all.
 * @param {string} term - Raw user input; sanitised and converted to a prefix FTS5 query.
 * @returns {{ path: string, title: string, kind: string, type: string|null, snippet: string }[]}
 */
function searchFiles(scope, term) {
  const pathWords = term.trim().split(/\s+/).filter(Boolean);
  if (pathWords.length === 0) {
    return [];
  }

  const byText = searchByText(scope, term, SEARCH_LIMIT);
  const snippets = new Map(byText.map((row) => [row.path, row]));
  const rows = [];
  const seen = new Set();
  for (const row of [...searchByPath(scope, pathWords, SEARCH_LIMIT), ...byText]) {
    if (!seen.has(row.path)) {
      seen.add(row.path);
      rows.push(snippets.get(row.path) ?? row);
    }
  }

  return rows.slice(0, SEARCH_LIMIT);
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

/** SQLite's NOCASE folds ASCII letters only: `É` and `é` are different names, `A` and `a` are the same. */
function foldAscii(text) {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function addToList(map, key, value) {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

/** Lookup tables over the files of one scope, so a link finds its candidates without scanning them all. */
function buildScopeLookup(files) {
  const byPath = new Map();
  const byBaseName = new Map();
  const byName = new Map();
  for (const file of files) {
    byPath.set(file.path, file);
    addToList(byBaseName, file.path.slice(file.path.lastIndexOf('/') + 1), file);
    addToList(byName, foldAscii(file.name), file);
  }
  return { byPath, byBaseName, byName };
}

/**
 * The file a link points to inside its scope, or null. Order of preference: exact path (with or without
 * `.md`), then path suffix (`enemies/grimlock`), then name (case-insensitive), then the shortest path.
 */
function findLinkTarget(lookup, link) {
  const best = { file: null, tier: -1, length: 0 };
  const consider = (file, tier) => {
    if (
      tier > best.tier ||
      (tier === best.tier && file.path.length < best.length) ||
      (tier === best.tier && file.path.length === best.length && file.id < best.file.id)
    ) {
      best.file = file;
      best.tier = tier;
      best.length = file.path.length;
    }
  };

  const targetPath = link.target_path;
  if (targetPath) {
    for (const exact of [targetPath, `${targetPath}.md`]) {
      const file = lookup.byPath.get(exact);
      if (file) {
        consider(file, 2);
      }
    }

    const baseName = targetPath.slice(targetPath.lastIndexOf('/') + 1);
    for (const suffix of [targetPath, `${targetPath}.md`]) {
      const baseCandidates =
        lookup.byBaseName.get(suffix === targetPath ? baseName : `${baseName}.md`) ?? [];
      for (const file of baseCandidates) {
        if (file.path.endsWith(`/${suffix}`)) {
          consider(file, 1);
        }
      }
    }
  }

  for (const file of lookup.byName.get(foldAscii(link.target_name)) ?? []) {
    consider(file, 0);
  }

  return best.file;
}

/**
 * The scopes (`files.campaign`) a change to these vault paths can affect: a campaign, a compendium system, or
 * null for vault-level files. A link only resolves inside its own scope.
 */
function getAffectedScopes(relativePaths) {
  const scopes = new Set();
  for (const relativePath of relativePaths) {
    scopes.add(getCampaignSlug(relativePath));
    if (!relativePath.includes('/') && isCampaignDirName(relativePath)) {
      scopes.add(relativePath);
    }
  }
  return scopes;
}

function listScopeLinkRows(database, scope) {
  return database
    .prepare(
      `SELECT l.id, l.source_file_id, l.target_path, l.target_name, l.target_file_id
       FROM links l JOIN files s ON s.id = l.source_file_id
       WHERE s.campaign IS ?`,
    )
    .all(scope);
}

/**
 * Re-resolves link targets, only among the files of the source's own scope (its campaign, or its compendium
 * system): a campaign never resolves into the compendium or another campaign. Heading-only links
 * (`[[#Treasure]]`) point to their own file. Works in memory per scope and writes only the links that changed,
 * so the cost follows the scopes given, not the whole vault.
 *
 * @param {Iterable<string|null>|null} scopes - Scopes to re-resolve (see `getAffectedScopes`); null: every scope.
 */
function resolveLinks(scopes = null) {
  const database = getVaultIndexDatabase();
  const scopeList = scopes
    ? [...scopes]
    : database
        .prepare('SELECT DISTINCT campaign FROM files')
        .all()
        .map((row) => row.campaign);
  const listFiles = database.prepare('SELECT id, path, name FROM files WHERE campaign IS ?');
  const updateTarget = database.prepare('UPDATE links SET target_file_id = ? WHERE id = ?');

  database.transaction(() => {
    for (const scope of scopeList) {
      const lookup = buildScopeLookup(listFiles.all(scope));
      for (const link of listScopeLinkRows(database, scope)) {
        const targetId =
          link.target_name === '' ? link.source_file_id : (findLinkTarget(lookup, link)?.id ?? null);
        if (targetId !== link.target_file_id) {
          updateTarget.run(targetId, link.id);
        }
      }
    }
  })();
}

module.exports = {
  countFiles,
  deleteAll,
  searchFiles,
  deletePath,
  getAffectedScopes,
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
