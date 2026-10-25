// initScript for chrome-devtools navigate_page: a fake window.electronAPI so `npm start` shows a campaign.
// It applies to ONE navigation only; pass it on every navigate_page. Calls it does not know are logged in
// window.__ipcUnknown and answered with null.
(() => {
  const VAULT = { id: 'v1', path: '/mock/vault', name: 'Mock', createdAtMs: 1, lastOpenedAtMs: 1 };
  const NOTES = {
    'campaigns/lost-mine/enemies/goblin.md': '# Goblin\n\nA small [[bob]] sneaks by.\n',
    'campaigns/lost-mine/npcs/bob.md': '# Bob\n\nBob knows the [[goblin]].\n',
    'campaigns/lost-mine/npcs/alice.md': '# Alice\n\nAlice is a cleric.\n',
  };
  const section = (key, type, icon) => ({
    key, type, icon, label: null, isCustom: false, isHidden: false, fileCount: 1,
  });
  const SECTIONS = [section('enemies', 'enemy', 'skull'), section('npcs', 'npc', 'user')];
  const written = (window.__written = []);
  const unknown = (window.__ipcUnknown = []);
  const handlers = {
    vault: { getCurrent: () => ({ status: 'ready', vault: VAULT }) },
    campaigns: {
      list: () => [campaign()],
      get: () => campaign(),
    },
    sections: {
      list: () => ({ rows: SECTIONS }),
      defaults: () => ({ campaign: SECTIONS, presets: SECTIONS, compendium: SECTIONS }),
    },
    window: { getState: () => ({ isMaximized: false, isFullscreen: false }) },
    menu: { update: () => null },
    update: { forceCheck: () => ({ updateAvailable: false }), check: () => ({ updateAvailable: false }) },
    cloud: {
      getStatus: () => ({
        status: 'ready', vaultId: 'v1', provider: null, totalFiles: 3, pendingFiles: 0,
        pendingPaths: [], conflictPaths: [], lastCheckedAtMs: 1, lastError: null,
      }),
    },
    index: {
      getStatus: () => ({
        status: 'ready', vaultId: 'v1', fileCount: 3, lastIndexedAtMs: 1, lastError: null,
        scannedCount: 0, scanTotal: 0,
      }),
    },
    workspace: { get: () => (window.__workspace ?? null), save: (p) => (written.push(p), p) },
    documents: {
      read: ({ path } = {}) => {
        const key = String(path).replace(/^\//, '');
        const content = NOTES[key] ?? NOTES[Object.keys(NOTES).find((k) => k.endsWith(`/${key}`))] ?? '';
        const title = (/^# (.*)$/m.exec(content) ?? [])[1] ?? key;
        return {
          path, content, contentHash: 'h' + content.length, mtimeMs: 1, title, frontmatter: {},
          frontmatterError: null, body: content, links: [],
        };
      },
      links: () => ({ outgoingLinks: [], brokenLinks: [], backlinks: [] }),
      linkTargets: () => [],
      list: () => [],
      write: () => ({ status: 'saved' }),
    },
    review: { list: () => ({}) },
  };
  function campaign() {
    return {
      slug: 'lost-mine', name: 'Lost Mine', description: null, icon: null, created: null, cover: null,
      noteCount: 3,
    };
  }
  const client = new Proxy({}, {
    get: (_t, resource) =>
      new Proxy({}, {
        get: (_u, action) => async (payload) => {
          const fn = handlers[resource]?.[action];
          if (!fn) {
            unknown.push(`${String(resource)}.${String(action)}`);
            return null;
          }
          return fn(payload);
        },
      }),
  });
  window.electronAPI = {
    ipcClient: client,
    onIpcEvent() {}, offIpcEvent() {},
    appInfo: { name: 'LazyDM', version: '0', author: null, repositoryUrl: null },
    platform: 'darwin', versions: {},
  };
})();
