CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  last_opened_at_ms INTEGER NOT NULL
);
