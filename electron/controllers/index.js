const appMetaController = require('./app-meta.controller');
const cloudReadinessController = require('./cloud-readiness.controller');
const indexerController = require('./indexer.controller');
const resetController = require('./reset.controller');
const updateController = require('./update.controller');
const vaultController = require('./vault.controller');
const windowController = require('./window.controller');

module.exports = {
  appMetaController,
  cloudReadinessController,
  indexerController,
  resetController,
  updateController,
  vaultController,
  windowController,
};
