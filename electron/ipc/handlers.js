const {
  appMetaController,
  campaignController,
  cloudReadinessController,
  documentController,
  indexerController,
  resetController,
  updateController,
  vaultController,
  windowController,
  workspaceController,
} = require('../controllers');
const { CHANNELS } = require('./channels');

const IPC_HANDLERS = Object.freeze({
  [CHANNELS.appMeta.create]: appMetaController.create,
  [CHANNELS.appMeta.get]: appMetaController.get,
  [CHANNELS.appMeta.list]: appMetaController.list,
  [CHANNELS.appMeta.update]: appMetaController.update,
  [CHANNELS.appMeta.remove]: appMetaController.remove,
  [CHANNELS.appMeta.upsert]: appMetaController.upsert,

  [CHANNELS.campaigns.list]: campaignController.list,
  [CHANNELS.campaigns.get]: campaignController.get,
  [CHANNELS.campaigns.create]: campaignController.create,

  [CHANNELS.cloud.getStatus]: cloudReadinessController.getStatus,
  [CHANNELS.cloud.skipWait]: cloudReadinessController.skipWait,
  [CHANNELS.cloud.recheck]: cloudReadinessController.recheck,

  [CHANNELS.documents.list]: documentController.list,
  [CHANNELS.documents.read]: documentController.read,
  [CHANNELS.documents.write]: documentController.write,
  [CHANNELS.documents.saveCopy]: documentController.saveCopy,
  [CHANNELS.documents.create]: documentController.create,
  [CHANNELS.documents.rename]: documentController.rename,
  [CHANNELS.documents.links]: documentController.links,
  [CHANNELS.documents.brokenLinks]: documentController.brokenLinks,
  [CHANNELS.documents.unlink]: documentController.unlink,
  [CHANNELS.documents.createFromLink]: documentController.createFromLink,

  [CHANNELS.index.getStatus]: indexerController.getStatus,
  [CHANNELS.index.rebuild]: indexerController.rebuild,

  [CHANNELS.reset.factoryReset]: resetController.factoryReset,

  [CHANNELS.update.check]: updateController.check,
  [CHANNELS.update.forceCheck]: updateController.forceCheck,
  [CHANNELS.update.openRelease]: updateController.openRelease,
  [CHANNELS.update.ignoreVersion]: updateController.ignoreVersion,

  [CHANNELS.vault.getCurrent]: vaultController.getCurrent,
  [CHANNELS.vault.selectFolder]: vaultController.selectFolder,
  [CHANNELS.vault.inspect]: vaultController.inspect,
  [CHANNELS.vault.open]: vaultController.open,
  [CHANNELS.vault.close]: vaultController.close,

  [CHANNELS.window.reload]: windowController.reload,

  [CHANNELS.workspace.get]: workspaceController.get,
  [CHANNELS.workspace.save]: workspaceController.save,
});

module.exports = {
  IPC_HANDLERS,
};
