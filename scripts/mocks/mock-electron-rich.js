// initScript for chrome-devtools navigate_page: a richer fake window.electronAPI than mock-electron.js (campaign `lost-mine`
// with a map, an encounter with a dead combatant and statuses, and Review data). One navigation only: pass it every time.
// The dev server answers 404 to a path ending in `.json`, so load /campaigns/lost-mine first and move inside the app with
//   history.pushState({ navigationId: 99 }, '', url); dispatchEvent(new PopStateEvent('popstate', { state: { navigationId: 99 } }))
(() => {
  const VAULT = { id: 'v1', path: '/mock/vault', name: 'Mock', createdAtMs: 1, lastOpenedAtMs: 1 };
  const section = (key, type, icon, fileCount = 1) => ({
    key,
    type,
    icon,
    label: null,
    isCustom: false,
    isHidden: false,
    fileCount,
  });
  const SECTIONS = [
    section('scenes', 'scene', 'clapperboard', 2),
    section('characters', 'character', 'user', 2),
    section('enemies', 'enemy', 'skull', 2),
    section('encounters', 'encounter', 'swords', 1),
    section('maps', 'map', 'map', 1),
  ];
  const NOTES = {
    goblin:
      '---\ntitle: Goblin\nac: 15\nhp: 7\ninitiative_mod: 2\n---\n# Goblin\n\nSmall and sneaky. Friend of [[nobody]].\n',
    wolf: '---\ntitle: Wolf\nac: 13\nhp: 11\n---\n# Wolf\n\nHunts in packs near the [[old-mine]].\n',
    alice: '# Alice\n\nAlice is a cleric of the [[old-mine]].\n',
    'old-mine': '# Old mine\n\nThe entrance is hidden by brambles.\n',
  };
  const MAP = {
    version: 1,
    name: 'The Coast',
    image: 'lost-mine/assets/coast.png',
    pins: [
      {
        id: 'p1',
        x: 0.3,
        y: 0.4,
        label: 'Goblin den',
        color: 'red',
        icon: 'skull',
        link: 'lost-mine/enemies/goblin.md',
      },
      { id: 'p2', x: 0.65, y: 0.55, label: 'Camp', color: 'blue', icon: 'tent', link: null },
      {
        id: 'p3',
        x: 0.5,
        y: 0.2,
        label: 'Old mine',
        color: 'orange',
        icon: 'door-open',
        link: 'lost-mine/scenes/old-mine.md',
      },
    ],
    paths: [
      {
        id: 'r1',
        points: [
          { x: 0.3, y: 0.4 },
          { x: 0.45, y: 0.5 },
          { x: 0.65, y: 0.55 },
        ],
        color: 'green',
        width: 3,
        label: 'Road',
        closed: false,
      },
    ],
    notes: [{ id: 'n1', x: 0.8, y: 0.3, text: 'Fog after dusk', color: 'yellow' }],
  };
  const RULE = {
    version: 1,
    name: 'Generic',
    template: 'builtin:enemy',
    initiative: { roll: '1d20 + {initiative_mod}' },
    nameArea: { row: 1, column: 3, span: 4 },
    fields: [
      {
        key: 'initiative',
        component: 'initiative',
        label: 'encounters.fields.initiative',
        source: 'entity',
        showInRow: true,
        area: { row: 1, column: 1, span: 1 },
      },
      {
        key: 'ac',
        component: 'number',
        label: 'encounters.fields.ac',
        source: 'frontmatter:ac',
        showInRow: true,
        area: { row: 1, column: 2, span: 1 },
      },
      {
        key: 'hp',
        component: 'healthbar',
        label: 'encounters.fields.hp',
        source: 'frontmatter:hp',
        showInRow: true,
        area: { row: 1, column: 7, span: 6 },
      },
      {
        key: 'statuses',
        component: 'statuses',
        label: 'encounters.fields.statuses',
        source: 'entity',
        showInRow: true,
        area: { row: 2, column: 1, span: 11 },
      },
      {
        key: 'note',
        component: 'note-link',
        label: 'encounters.fields.note',
        source: 'entity',
        showInRow: true,
        area: { row: 2, column: 12, span: 1 },
      },
    ],
  };
  const ENCOUNTER = {
    version: 1,
    name: 'Goblin ambush',
    notes: '',
    rule: null,
    battle: { status: 'running', round: 3, turnId: 'e2' },
    entities: [
      {
        id: 'e1',
        name: 'Alice',
        isDead: false,
        values: {
          initiative: 18,
          ac: 16,
          hp: { current: 24, max: 30, temp: 0 },
          statuses: [],
          note: 'lost-mine/characters/alice.md',
        },
      },
      {
        id: 'e2',
        name: 'Goblin 1',
        isDead: false,
        values: {
          initiative: 14,
          hp: { current: 3, max: 7, temp: 0 },
          statuses: [{ name: 'stunned', rounds: 2 }, { name: 'prone' }],
          note: 'lost-mine/enemies/goblin.md',
        },
      },
      {
        id: 'e3',
        name: 'Goblin 2',
        isDead: false,
        values: {
          initiative: 9,
          hp: { current: 7, max: 7, temp: 0 },
          statuses: [],
          note: 'lost-mine/enemies/goblin.md',
        },
      },
      {
        id: 'e4',
        name: 'Wolf',
        isDead: true,
        values: {
          initiative: 12,
          hp: { current: 0, max: 11, temp: 0 },
          statuses: [],
          note: 'lost-mine/enemies/wolf.md',
        },
      },
    ],
  };
  const WORKSPACE = window.__workspace ?? null;
  const campaign = () => ({
    slug: 'lost-mine',
    name: 'Lost Mine',
    description: 'A starter adventure on the Sword Coast.',
    icon: null,
    created: null,
    cover: null,
    noteCount: 9,
  });
  const note = (path) => {
    const key = String(path).split('/').pop().replace(/\.md$/, '');
    const content = NOTES[key] ?? `# ${key}\n`;
    const fm = {};
    (/^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? '').split('\n').forEach((l) => {
      const [k, ...v] = l.split(': ');
      if (k) fm[k] = v.join(': ');
    });
    return {
      path,
      content,
      contentHash: 'h' + content.length,
      mtimeMs: 1,
      title: (/^# (.*)$/m.exec(content) ?? [])[1] ?? key,
      frontmatter: fm,
      frontmatterError: null,
      body: content,
      links: [],
    };
  };
  const unknown = (window.__ipcUnknown = []);
  const handlers = {
    vault: { getCurrent: () => ({ status: 'ready', vault: VAULT }) },
    campaigns: { list: () => ({ rows: [campaign()] }), get: () => campaign() },
    sections: {
      list: () => ({ rows: SECTIONS }),
      defaults: () => ({ campaign: SECTIONS, presets: SECTIONS, compendium: SECTIONS }),
    },
    window: { getState: () => ({ isMaximized: false, isFullscreen: false }) },
    menu: { update: () => null },
    update: {
      forceCheck: () => ({ updateAvailable: false }),
      check: () => ({ updateAvailable: false }),
    },
    cloud: {
      getStatus: () => ({
        status: 'ready',
        vaultId: 'v1',
        provider: null,
        totalFiles: 9,
        pendingFiles: 0,
        pendingPaths: [],
        conflictPaths: [],
        lastCheckedAtMs: 1,
        lastError: null,
      }),
    },
    index: {
      getStatus: () => ({
        status: 'ready',
        vaultId: 'v1',
        fileCount: 9,
        lastIndexedAtMs: 1,
        lastError: null,
        scannedCount: 0,
        scanTotal: 0,
      }),
    },
    workspace: { get: () => WORKSPACE, save: (p) => p },
    maps: {
      read: ({ path }) => ({ path, map: MAP, parseError: null, contentHash: 'm1', mtimeMs: 1 }),
      write: () => ({ status: 'saved', contentHash: 'm2', mtimeMs: 2 }),
    },
    encounters: {
      read: ({ path }) => ({
        path,
        encounter: ENCOUNTER,
        parseError: null,
        contentHash: 'c1',
        mtimeMs: 1,
      }),
      rule: () => RULE,
      party: ({ scope }) => ({
        path: `${scope}/encounters/_party.json`,
        encounter: { ...ENCOUNTER, name: 'Party', entities: [] },
        parseError: null,
        contentHash: 'c2',
        mtimeMs: 1,
      }),
      write: () => ({ status: 'saved', contentHash: 'c3', mtimeMs: 2 }),
    },
    battleRules: { list: () => ({ rows: [], builtIn: RULE }) },
    documents: {
      read: ({ path } = {}) => note(path),
      links: () => ({
        outgoingLinks: [],
        backlinks: [],
        brokenLinks: [{ raw: '[[nobody]]', target: 'nobody', line: 6 }],
      }),
      linkTargets: () => ({ rows: [] }),
      list: () => ({ rows: [], folders: [] }),
      write: () => ({ status: 'saved' }),
    },
    review: {
      list: () => ({
        brokenLinkCount: 1,
        outside: [{ path: 'lost-mine/notes-from-friday.md', title: 'Notes from Friday' }],
        unknownFolders: [{ name: 'factions', fileCount: 2 }],
        tooDeep: [],
      }),
    },
  };
  const client = new Proxy(
    {},
    {
      get: (_t, r) =>
        new Proxy(
          {},
          {
            get: (_u, a) => async (p) => {
              const fn = handlers[r]?.[a];
              if (!fn) {
                unknown.push(`${String(r)}.${String(a)}`);
                return null;
              }
              return fn(p);
            },
          },
        ),
    },
  );
  window.electronAPI = {
    ipcClient: client,
    onIpcEvent() {},
    offIpcEvent() {},
    appInfo: { name: 'LazyDM', version: '0', author: null, repositoryUrl: null },
    platform: 'darwin',
    versions: {},
  };

  // The map image is served by lazydm-asset://, which a browser cannot load: show a drawn coast instead.
  const SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#c9d3c0"/>' +
        '<path d="M0 700 C300 600 500 800 800 720 S1300 620 1600 740 V1000 H0Z" fill="#8fb0c4"/>' +
        '<path d="M200 200 L520 120 L760 260 L640 420 L300 400Z" fill="#a9b98f" stroke="#6d7d5c" stroke-width="4"/></svg>',
    );
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() {
      return desc.get.call(this);
    },
    set(v) {
      desc.set.call(this, typeof v === 'string' && v.startsWith('lazydm-asset://') ? SVG : v);
    },
  });
})();
