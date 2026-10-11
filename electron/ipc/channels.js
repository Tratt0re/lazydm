const CHANNELS = Object.freeze({
  appMeta: Object.freeze({
    create: 'db:app-meta:create',
    get: 'db:app-meta:get',
    list: 'db:app-meta:list',
    update: 'db:app-meta:update',
    remove: 'db:app-meta:remove',
    upsert: 'db:app-meta:upsert',
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
});

module.exports = {
  CHANNELS,
};
