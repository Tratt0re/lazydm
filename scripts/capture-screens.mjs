// Captures the README / website screenshots from the real app, in dark and light, on a local demo vault.
//
//   1. npm start                                   (Angular dev server)
//   2. LAZYDM_USER_DATA=/tmp/lazydm-demo npx electron . --remote-debugging-port=9333
//   3. node scripts/capture-screens.mjs <demo-vault-folder> [outDir]
//
// LAZYDM_USER_DATA keeps the demo out of your real data. The demo vault is local only (.claude/demo-vault).
import fs from 'node:fs';
import path from 'node:path';

const [vaultFolder, outDir = '.claude/shots'] = process.argv.slice(2);
if (!vaultFolder) {
  console.error('usage: node scripts/capture-screens.mjs <demo-vault-folder> [outDir]');
  process.exit(1);
}

const PORT = process.env.CDP_PORT ?? '9333';
const CAMPAIGN = '/campaigns/ember-crown';
const SHOTS = [
  { name: 'note-reading', route: `${CAMPAIGN}/scenes/Castle%20of%20Drake`, mode: 'Reading' },
  { name: 'note-live', route: `${CAMPAIGN}/scenes/The%20Quiet%20Inn`, mode: 'Live preview' },
  { name: 'map', route: `${CAMPAIGN}/maps/Keep%20of%20Drake.json` },
  { name: 'review', route: `${CAMPAIGN}/review` },
  // Callouts, a table and a task list further down the same note.
  {
    name: 'note-blocks',
    route: `${CAMPAIGN}/scenes/Castle%20of%20Drake`,
    mode: 'Reading',
    act: async () => {
      await run(`document.querySelector('div.overflow-auto > .arc-markdown-body table')?.scrollIntoView({ block: 'center' })`);
      await wait(600);
    },
  },
  // The eye button next to a link opens a read-only preview card of the linked note.
  {
    name: 'link-preview',
    route: `${CAMPAIGN}/scenes/Castle%20of%20Drake`,
    mode: 'Reading',
    act: async () => {
      const spot = await run(
        `(() => { const a = [...document.querySelectorAll('.arc-markdown-body a.arc-wikilink')].find((l) => l.textContent === 'Ember Ward'); a.scrollIntoView({ block: 'center' }); const b = a.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
      );
      await mouse(spot.x - 20, spot.y);
      await mouse(spot.x, spot.y);
      await wait(600);
      await run(
        `document.querySelector('button[aria-label^="Preview linked note"]')?.click()`,
      );
      await wait(1200);
    },
  },
  // Split screen: the encounter on one side, the sheet of an enemy on the other.
  {
    name: 'tracker',
    route: `${CAMPAIGN}/encounters/Castle%20gatehouse.json(split:campaigns/ember-crown/enemies/Captain%20Vex)`,
  },
  // Search: the header field, with a term typed.
  {
    name: 'search',
    route: `${CAMPAIGN}/scenes/Castle%20of%20Drake`,
    mode: 'Reading',
    act: async () => {
      await run(`document.querySelector('header-search input, input[type="search"], input[placeholder^="Search"]')?.focus()`);
      await wait(300);
      await type('ember');
      await wait(1500);
    },
  },
];

const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = list.find((p) => p.type === 'page' && p.url.startsWith('http://localhost:4200'));
if (!page) throw new Error('No LazyDM window found on the debugging port.');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));

let nextId = 0;
const pending = new Map();
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  pending.get(data.id)?.(data);
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const run = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result
    ?.result?.value;
const mouse = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const type = (text) => send('Input.insertText', { text });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let navId = 1000;
fs.mkdirSync(outDir, { recursive: true });
await run(
  `window.electronAPI.ipcClient.vault.open({ folderPath: ${JSON.stringify(path.resolve(vaultFolder))} })`,
);
await run('window.electronAPI.ipcClient.index.rebuild({})');

for (const theme of ['dark', 'light']) {
  await run(`localStorage.setItem('theme', '${theme}')`);
  for (const shot of SHOTS) {
    // Tabs are saved per campaign: start every shot from an empty workspace.
    await run(
      `window.electronAPI.ipcClient.workspace.save({ campaign: 'ember-crown', tabs: [], activeTabId: null, rightActiveTabId: null })`,
    );
    // The dev server answers 404 to a path ending in `.json`: load the app once, then move inside it.
    await run(`location.href = 'http://localhost:4200${CAMPAIGN}'`);
    await wait(2500);
    await run(
      `history.pushState({ navigationId: ${++navId} }, '', ${JSON.stringify(shot.route)}); dispatchEvent(new PopStateEvent('popstate', { state: { navigationId: ${navId} } }))`,
    );
    await wait(3000);
    if (shot.mode) {
      await run(
        `[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.title) === '${shot.mode}')?.click()`,
      );
      await wait(1500);
    }
    // Reading view images are `loading="lazy"`: load them all before the shot.
    await run(`document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; })`);
    // Big images decode late: wait until every image of the page is loaded (8 s at most).
    await run(
      `new Promise((resolve) => { const t = Date.now(); const check = () => [...document.images].every((i) => i.complete && i.naturalWidth > 0) || Date.now() - t > 8000 ? setTimeout(resolve, 500) : setTimeout(check, 200); check(); })`,
    );
    await shot.act?.();
    const { result } = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(outDir, `${shot.name}-${theme}.png`);
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
    console.log('saved', file);
  }
}
ws.close();
