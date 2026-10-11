const CHANNELS = Object.freeze({
  appMeta: Object.freeze({
    create: 'db:app-meta:create',
    get: 'db:app-meta:get',
    list: 'db:app-meta:list',
    update: 'db:app-meta:update',
    remove: 'db:app-meta:remove',
    upsert: 'db:app-meta:upsert',
  }),
  campaigns: Object.freeze({
    list: 'campaigns:list',
    get: 'campaigns:get',
    create: 'campaigns:create',
  }),
  cloud: Object.freeze({
    getStatus: 'cloud:getStatus',
    skipWait: 'cloud:skipWait',
    recheck: 'cloud:recheck',
  }),
  documents: Object.freeze({
    list: 'documents:list',
    read: 'documents:read',
    write: 'documents:write',
    saveCopy: 'documents:saveCopy',
    create: 'documents:create',
  }),
  index: Object.freeze({
    getStatus: 'index:getStatus',
    rebuild: 'index:rebuild',
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
  vault: Object.freeze({
    getCurrent: 'vault:getCurrent',
    selectFolder: 'vault:selectFolder',
    inspect: 'vault:inspect',
    open: 'vault:open',
    close: 'vault:close',
  }),
  window: Object.freeze({
    reload: 'window:reload',
  }),
  workspace: Object.freeze({
    get: 'workspace:get',
    save: 'workspace:save',
  }),
});

module.exports = {
  CHANNELS,
};
