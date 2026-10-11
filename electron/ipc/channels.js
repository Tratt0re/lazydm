const CHANNELS = Object.freeze({
  appMeta: Object.freeze({
    create: 'db:app-meta:create',
    get: 'db:app-meta:get',
    list: 'db:app-meta:list',
    update: 'db:app-meta:update',
    remove: 'db:app-meta:remove',
    upsert: 'db:app-meta:upsert',
  }),
  backup: Object.freeze({
    getSettings: 'backup:getSettings',
    updateSettings: 'backup:updateSettings',
    getState: 'backup:getState',
    selectFolder: 'backup:selectFolder',
    list: 'backup:list',
    runNow: 'backup:runNow',
    remove: 'backup:remove',
    restore: 'backup:restore',
  }),
  sync: Object.freeze({
    getSettings: 'sync:getSettings',
    updateSettings: 'sync:updateSettings',
    getState: 'sync:getState',
    selectFolder: 'sync:selectFolder',
    enable: 'sync:enable',
    repoStatus: 'sync:repoStatus',
    enableCreateRepo: 'sync:enableCreateRepo',
    enableAttachRepo: 'sync:enableAttachRepo',
    disable: 'sync:disable',
    syncNow: 'sync:syncNow',
    pullNow: 'sync:pullNow',
    pushNow: 'sync:pushNow',
    listSnapshots: 'sync:listSnapshots',
  }),
  reset: Object.freeze({
    factoryReset: 'db:reset:factory-reset',
  }),
  update: Object.freeze({
    check: 'update:check',
    forceCheck: 'update:force-check',
    openRelease: 'update:open-release',
    ignoreVersion: 'update:ignore-version',
  }),
  window: Object.freeze({
    reload: 'window:reload',
  }),
});

module.exports = {
  CHANNELS,
};
