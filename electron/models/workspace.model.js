const { getVaultIndexDatabase } = require('../database/vault-index-db');

/** Open tabs of a campaign on this device; null when the campaign has no saved workspace yet. */
function getWorkspace(campaign) {
  const row = getVaultIndexDatabase()
    .prepare('SELECT tabs_json, active_tab, updated_at_ms FROM workspace WHERE campaign = ?')
    .get(campaign);
  if (!row) {
    return null;
  }

  let tabs;
  try {
    tabs = JSON.parse(row.tabs_json);
  } catch (_) {
    return null;
  }

  return {
    tabs: Array.isArray(tabs) ? tabs : [],
    activeTabId: row.active_tab ?? null,
    updatedAtMs: row.updated_at_ms,
  };
}

function saveWorkspace(campaign, { tabs, activeTabId }) {
  const updatedAtMs = Date.now();
  getVaultIndexDatabase()
    .prepare(
      `INSERT INTO workspace (campaign, tabs_json, active_tab, updated_at_ms) VALUES (?, ?, ?, ?)
       ON CONFLICT(campaign) DO UPDATE SET
         tabs_json = excluded.tabs_json,
         active_tab = excluded.active_tab,
         updated_at_ms = excluded.updated_at_ms`,
    )
    .run(campaign, JSON.stringify(tabs), activeTabId, updatedAtMs);

  return { tabs, activeTabId, updatedAtMs };
}

module.exports = {
  getWorkspace,
  saveWorkspace,
};
