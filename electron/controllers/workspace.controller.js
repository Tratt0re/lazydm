const { vaultModel, workspaceModel } = require('../models');
const indexerController = require('./indexer.controller');
const { ensurePlainObject, normalizeOptionalString, requireString } = require('./utils');

const WORKSPACE_MAX_TABS = 30;
const WORKSPACE_MAX_HISTORY = 50;
const TAB_ID_MAX_LENGTH = 64;
const TAB_TITLE_MAX_LENGTH = 200;
const TAB_URL_MAX_LENGTH = 1024;

function requireCampaign(body) {
  const campaign = requireString(body.campaign, 'payload.campaign');
  if (campaign.includes('/') || !vaultModel.isCampaignDirName(campaign)) {
    throw new Error(`payload.campaign is not a campaign folder: ${campaign}`);
  }

  return campaign;
}

/** Tabs only ever point inside their own campaign. */
function requireTabUrl(value, label, campaign) {
  const url = requireString(value, label, { maxLength: TAB_URL_MAX_LENGTH });
  const campaignRoot = `/campaigns/${campaign}`;
  if (url !== campaignRoot && !url.startsWith(`${campaignRoot}/`)) {
    throw new Error(`${label} must stay inside ${campaignRoot}.`);
  }

  return url;
}

function normalizeTab(value, label, campaign) {
  const tab = ensurePlainObject(value, label);
  const id = requireString(tab.id, `${label}.id`, { maxLength: TAB_ID_MAX_LENGTH });
  const title =
    normalizeOptionalString(tab.title, `${label}.title`, {
      allowEmpty: true,
      maxLength: TAB_TITLE_MAX_LENGTH,
    }) ?? '';

  if (!Array.isArray(tab.history) || tab.history.length === 0) {
    throw new Error(`${label}.history must be a non-empty array.`);
  }

  const history = tab.history
    .slice(-WORKSPACE_MAX_HISTORY)
    .map((url, index) => requireTabUrl(url, `${label}.history[${index}]`, campaign));

  const historyIndex = Number.isInteger(tab.historyIndex)
    ? Math.min(
        Math.max(tab.historyIndex - (tab.history.length - history.length), 0),
        history.length - 1,
      )
    : history.length - 1;

  return { id, title, history, historyIndex };
}

/** Saved tabs of a campaign (null when none, or while the vault index is not open yet). */
function get(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const campaign = requireCampaign(body);
  return indexerController.isOpen() ? workspaceModel.getWorkspace(campaign) : null;
}

function save(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const campaign = requireCampaign(body);

  if (!Array.isArray(body.tabs) || body.tabs.length > WORKSPACE_MAX_TABS) {
    throw new Error(`payload.tabs must be an array of at most ${WORKSPACE_MAX_TABS} tabs.`);
  }

  const tabs = body.tabs.map((tab, index) => normalizeTab(tab, `payload.tabs[${index}]`, campaign));
  const activeTabId = normalizeOptionalString(body.activeTabId, 'payload.activeTabId', {
    allowNull: true,
  });
  const resolvedActiveTabId = tabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : (tabs[0]?.id ?? null);

  if (!indexerController.isOpen()) {
    return null;
  }

  return workspaceModel.saveWorkspace(campaign, { tabs, activeTabId: resolvedActiveTabId });
}

module.exports = {
  get,
  save,
};
