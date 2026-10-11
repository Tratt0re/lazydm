CREATE TABLE IF NOT EXISTS index_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  extension TEXT NOT NULL,
  campaign TEXT,
  kind TEXT NOT NULL,
  type TEXT,
  title TEXT,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  content_hash TEXT,
  frontmatter_json TEXT,
  indexed_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS files_name_idx ON files (name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS files_campaign_type_idx ON files (campaign, type);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file_id INTEGER NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  target_raw TEXT NOT NULL,
  target_path TEXT,
  target_name TEXT NOT NULL,
  target_heading TEXT,
  label TEXT,
  kind TEXT NOT NULL,
  line INTEGER NOT NULL,
  target_file_id INTEGER REFERENCES files (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS links_source_idx ON links (source_file_id);
CREATE INDEX IF NOT EXISTS links_target_idx ON links (target_file_id);
CREATE INDEX IF NOT EXISTS links_target_name_idx ON links (target_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS tags (
  file_id INTEGER NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (file_id, tag)
);

CREATE INDEX IF NOT EXISTS tags_tag_idx ON tags (tag COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS headings (
  file_id INTEGER NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  text TEXT NOT NULL,
  line INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS headings_file_idx ON headings (file_id);

CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5 (title, body, tokenize = 'unicode61 remove_diacritics 2');

CREATE TABLE IF NOT EXISTS workspace (
  campaign TEXT PRIMARY KEY,
  tabs_json TEXT NOT NULL,
  active_tab TEXT,
  updated_at_ms INTEGER NOT NULL
);
