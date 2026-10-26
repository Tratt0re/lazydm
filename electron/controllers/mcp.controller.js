const crypto = require('node:crypto');
const { broadcastIpcEvent } = require('../ipc/broadcast');
const { getSettingsSection, patchSettingsSection } = require('../utils/settings-store');
const { LOOPBACK_HOST, MCP_PATH, startMcpServer } = require('../mcp/mcp-server');
const { normalizeVaultPath } = require('../mcp/scope');
const { createMcpServer } = require('../mcp/tools');
const { ensurePlainObject } = require('./utils');
const vaultController = require('./vault.controller');

const SETTINGS_KEY = 'mcp';
const MCP_STATUS_CHANGED_EVENT = 'mcp:statusChanged';
const DEFAULT_PORT = 47821;
const MIN_PORT = 1024;
const MAX_PORT = 65535;
const MAX_SCOPE_ROOTS = 200;
const SETTINGS_DEFAULTS = Object.freeze({
  /** The feature is switched on: its settings and the header indicator are shown. Off by default. */
  enabled: false,
  /** Start the server by itself when LazyDM opens (only while enabled). */
  autostart: false,
  /** Agents may create and change notes; without it the server only reads. */
  allowWrite: false,
  /** Agents only reach `scopeRoots` (campaign slugs, `compendium/<system>`); off = the whole Codex. */
  limitScope: false,
  scopeRoots: [],
  port: DEFAULT_PORT,
  token: null,
});

let running = null;
let lastError = null;

function readSettings() {
  return getSettingsSection(SETTINGS_KEY, SETTINGS_DEFAULTS);
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** The token is created the first time it is needed and kept on this device only (never in the vault). */
function ensureToken() {
  const settings = readSettings();
  if (typeof settings.token === 'string' && settings.token.length > 0) {
    return settings.token;
  }

  return patchSettingsSection(SETTINGS_KEY, { token: generateToken() }, SETTINGS_DEFAULTS).token;
}

function readScopeRoots(settings) {
  return Array.isArray(settings.scopeRoots)
    ? settings.scopeRoots.filter((root) => typeof root === 'string')
    : [];
}

function getStatus() {
  const settings = readSettings();
  const port = running?.port ?? settings.port;
  return {
    enabled: settings.enabled === true,
    running: running !== null,
    autostart: settings.autostart === true,
    allowWrite: settings.allowWrite === true,
    limitScope: settings.limitScope === true,
    scopeRoots: readScopeRoots(settings),
    port,
    url: `http://${LOOPBACK_HOST}:${port}${MCP_PATH}`,
    token: settings.enabled === true ? ensureToken() : null,
    lastError,
  };
}

function publishStatus() {
  const status = getStatus();
  broadcastIpcEvent(MCP_STATUS_CHANGED_EVENT, status);
  return status;
}

async function start() {
  if (running) {
    return getStatus();
  }

  const settings = readSettings();
  if (settings.enabled !== true) {
    throw new Error('The MCP server is switched off.');
  }
  if (vaultController.getCurrent().status !== 'ready') {
    throw new Error('Open a Codex first: the MCP server works on the open Codex.');
  }

  const token = ensureToken();
  const allowWrite = settings.allowWrite === true;
  // Read once at start: a change of the limit restarts the server, so it never serves an old scope.
  const roots = settings.limitScope === true ? readScopeRoots(settings) : null;
  try {
    const server = await startMcpServer({
      port: settings.port,
      token,
      createMcp: () => createMcpServer({ allowWrite, roots }),
    });
    running = server;
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    publishStatus();
    throw error;
  }

  return publishStatus();
}

async function stop() {
  if (running) {
    const current = running;
    running = null;
    await current.stop();
  }

  lastError = null;
  return publishStatus();
}

/** Applies a settings change; a running server restarts so it never serves with old settings. */
async function applySettings(patch) {
  const wasRunning = running !== null;
  if (wasRunning) {
    await stop();
  }

  patchSettingsSection(SETTINGS_KEY, patch, SETTINGS_DEFAULTS);
  if (wasRunning && readSettings().enabled === true) {
    try {
      await start();
    } catch (error) {
      console.warn('[mcp] Restart failed:', error);
    }
  }

  return publishStatus();
}

function requireFlag(payload, key) {
  const body = ensurePlainObject(payload, 'payload');
  if (typeof body[key] !== 'boolean') {
    throw new Error(`payload.${key} must be true or false.`);
  }

  return body[key];
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`payload.port must be a whole number from ${MIN_PORT} to ${MAX_PORT}.`);
  }

  return port;
}

/** Switching the feature off also stops the server; its other settings are kept. */
async function setEnabled(payload) {
  const enabled = requireFlag(payload, 'enabled');
  if (!enabled) {
    await stop();
  }

  return applySettings({ enabled });
}

function setAutostart(payload) {
  return applySettings({ autostart: requireFlag(payload, 'autostart') });
}

function setAllowWrite(payload) {
  return applySettings({ allowWrite: requireFlag(payload, 'allowWrite') });
}

function setLimitScope(payload) {
  return applySettings({ limitScope: requireFlag(payload, 'limitScope') });
}

/** A scope root is a campaign slug (`lost-mine`) or a compendium system (`compendium/dnd-5e`), nothing deeper. */
function normalizeScopeRoots(value) {
  if (!Array.isArray(value) || value.length > MAX_SCOPE_ROOTS) {
    throw new Error(`payload.roots must be a list of at most ${MAX_SCOPE_ROOTS} folders.`);
  }

  const roots = value.map((root) => normalizeVaultPath(root));
  for (const root of roots) {
    const segments = root.split('/');
    const isCampaign = segments.length === 1;
    const isSystem = segments.length === 2 && segments[0] === 'compendium';
    if (!isCampaign && !isSystem) {
      throw new Error(`Not a campaign or a compendium system: ${root}`);
    }
  }

  return [...new Set(roots)];
}

function setScopeRoots(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return applySettings({ scopeRoots: normalizeScopeRoots(body.roots) });
}

function setPort(payload) {
  const body = ensurePlainObject(payload, 'payload');
  return applySettings({ port: normalizePort(body.port) });
}

/** A new token: every client configured with the old one stops working. */
function regenerateToken() {
  return applySettings({ token: generateToken() });
}

/** Called once the vault session is up: starts the server if the user asked for that. */
async function startIfWanted() {
  const settings = readSettings();
  if (settings.enabled === true && settings.autostart === true && !running) {
    try {
      await start();
    } catch (error) {
      console.warn('[mcp] Autostart failed:', error);
    }
  }
}

module.exports = {
  getStatus,
  regenerateToken,
  setAllowWrite,
  setAutostart,
  setEnabled,
  setLimitScope,
  setPort,
  setScopeRoots,
  start,
  startIfWanted,
  stop,
};
