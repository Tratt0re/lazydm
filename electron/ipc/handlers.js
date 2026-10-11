const {
  appMetaController,
  resetController,
  updateController,
  vaultController,
  windowController,
} = require('../controllers');
const { CHANNELS } = require('./channels');

const IPC_HANDLERS = Object.freeze({
  [CHANNELS.appMeta.create]: appMetaController.create,
  [CHANNELS.appMeta.get]: appMetaController.get,
  [CHANNELS.appMeta.list]: appMetaController.list,
  [CHANNELS.appMeta.update]: appMetaController.update,
  [CHANNELS.appMeta.remove]: appMetaController.remove,
  [CHANNELS.appMeta.upsert]: appMetaController.upsert,

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
});

module.exports = {
  IPC_HANDLERS,
};
