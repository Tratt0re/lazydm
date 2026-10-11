const {
  appMetaController,
  backupController,
  syncController,
  resetController,
  updateController,
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

  [CHANNELS.backup.getSettings]: backupController.getSettings,
  [CHANNELS.backup.updateSettings]: backupController.updateSettings,
  [CHANNELS.backup.getState]: backupController.getState,
  [CHANNELS.backup.selectFolder]: backupController.selectFolder,
  [CHANNELS.backup.list]: backupController.list,
  [CHANNELS.backup.runNow]: backupController.runNow,
  [CHANNELS.backup.remove]: backupController.remove,
  [CHANNELS.backup.restore]: backupController.restore,

  [CHANNELS.sync.getSettings]: syncController.getSettings,
  [CHANNELS.sync.updateSettings]: syncController.updateSettings,
  [CHANNELS.sync.getState]: syncController.getState,
  [CHANNELS.sync.selectFolder]: syncController.selectFolder,
  [CHANNELS.sync.enable]: syncController.enable,
  [CHANNELS.sync.repoStatus]: syncController.repoStatus,
  [CHANNELS.sync.enableCreateRepo]: syncController.enableCreateRepo,
  [CHANNELS.sync.enableAttachRepo]: syncController.enableAttachRepo,
  [CHANNELS.sync.disable]: syncController.disable,
  [CHANNELS.sync.syncNow]: syncController.syncNow,
  [CHANNELS.sync.pullNow]: syncController.pullNow,
  [CHANNELS.sync.pushNow]: syncController.pushNow,
  [CHANNELS.sync.listSnapshots]: syncController.listSnapshots,

  [CHANNELS.reset.factoryReset]: resetController.factoryReset,

  [CHANNELS.update.check]: updateController.check,
  [CHANNELS.update.forceCheck]: updateController.forceCheck,
  [CHANNELS.update.openRelease]: updateController.openRelease,
  [CHANNELS.update.ignoreVersion]: updateController.ignoreVersion,

  [CHANNELS.window.reload]: windowController.reload,
});

module.exports = {
  IPC_HANDLERS,
};
