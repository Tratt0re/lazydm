const { net, protocol } = require('electron');
const { pathToFileURL } = require('node:url');
const { resolveInsideVault } = require('../utils/file-utils');
const vaultController = require('./vault.controller');

/** `lazydm-asset://vault/<vault-relative path>` serves images, maps and PDFs embedded in notes. */
const ASSET_SCHEME = 'lazydm-asset';

/** Must run before the app is ready. */
function registerAssetScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/** Serves files of the open vault only; anything else (or outside the vault) answers 404. */
function handleAssetRequests() {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const relativePath = url.pathname
        .split('/')
        .filter(Boolean)
        .map((segment) => decodeURIComponent(segment))
        .join('/');
      const absolutePath = resolveInsideVault(vaultController.getReadyVaultPath(), relativePath);

      return await net.fetch(pathToFileURL(absolutePath).toString());
    } catch (error) {
      console.warn('[electron] Asset request refused ->', request.url, error instanceof Error ? error.message : error);
      return new Response('Not found', { status: 404 });
    }
  });
}

module.exports = {
  handleAssetRequests,
  registerAssetScheme,
};
