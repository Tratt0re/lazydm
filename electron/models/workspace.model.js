const { getVaultIndexDatabase } = require('../database/vault-index-db');

/** Open tabs of a campaign on this device; null when the campaign has no saved workspace yet. */
function getWorkspace(campaign) {
  const row = getVaultIndexDatabase()
    .prepare('SELECT tabs_json, active_tab, updated_at_ms FROM workspace WHERE campaign = ?')
    .get(campaign);
  if (!row) {
    return null;
  }

  let stored;
  try {
    stored = JSON.parse(row.tabs_json);
  } catch (_) {
    return null;
  }

  // Rows saved before the split screen are a plain array of tabs; now `{ tabs, rightActiveTabId }`.
  const tabs = Array.isArray(stored) ? stored : stored?.tabs;
  return {
    tabs: Array.isArray(tabs) ? tabs : [],
    activeTabId: row.active_tab ?? null,
    rightActiveTabId: Array.isArray(stored) ? null : (stored?.rightActiveTabId ?? null),
    updatedAtMs: row.updated_at_ms,
  };
}

/** Forgets the saved tabs of a campaign (it was deleted). */
function deleteWorkspace(campaign) {
  getVaultIndexDatabase().prepare('DELETE FROM workspace WHERE campaign = ?').run(campaign);
}

function saveWorkspace(campaign, { tabs, activeTabId, rightActiveTabId }) {
  const updatedAtMs = Date.now();
  getVaultIndexDatabase()
    .prepare(
      `INSERT INTO workspace (campaign, tabs_json, active_tab, updated_at_ms) VALUES (?, ?, ?, ?)
       ON CONFLICT(campaign) DO UPDATE SET
         tabs_json = excluded.tabs_json,
         active_tab = excluded.active_tab,
         updated_at_ms = excluded.updated_at_ms`,
    )
    .run(campaign, JSON.stringify({ tabs, rightActiveTabId }), activeTabId, updatedAtMs);

  return { tabs, activeTabId, rightActiveTabId, updatedAtMs };
}

module.exports = {
  deleteWorkspace,
  getWorkspace,
  saveWorkspace,
};
