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
  compendium: Object.freeze({
    list: 'compendium:list',
    get: 'compendium:get',
    create: 'compendium:create',
    countFiles: 'compendium:countFiles',
    remove: 'compendium:remove',
  }),
  documents: Object.freeze({
    list: 'documents:list',
    read: 'documents:read',
    write: 'documents:write',
    saveCopy: 'documents:saveCopy',
    create: 'documents:create',
    rename: 'documents:rename',
    links: 'documents:links',
    linkTargets: 'documents:linkTargets',
    brokenLinks: 'documents:brokenLinks',
    unlink: 'documents:unlink',
    createFromLink: 'documents:createFromLink',
    copy: 'documents:copy',
    copyPlan: 'documents:copyPlan',
  }),
  sections: Object.freeze({
    list: 'sections:list',
    defaults: 'sections:defaults',
    save: 'sections:save',
  }),
  templates: Object.freeze({
    list: 'templates:list',
    builtIn: 'templates:builtIn',
    getRules: 'templates:getRules',
    setRule: 'templates:setRule',
    create: 'templates:create',
    customize: 'templates:customize',
    remove: 'templates:remove',
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
    getState: 'window:getState',
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggleMaximize',
    close: 'window:close',
  }),
  workspace: Object.freeze({
    get: 'workspace:get',
    save: 'workspace:save',
  }),
});

module.exports = {
  CHANNELS,
};
