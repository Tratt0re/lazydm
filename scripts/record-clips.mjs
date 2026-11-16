// Records short clips of the real app, with a visible cursor and click ripple (a screencast has no mouse).
//
//   1. npm start, then LAZYDM_USER_DATA=/tmp/lazydm-demo npx electron . --remote-debugging-port=9333
//   2. node scripts/record-clips.mjs <demo-vault-folder> [outDir] [clipName…]
//
// Frames are grabbed with Page.captureScreenshot while the clip's steps run, then encoded to MP4 by
// scripts/encode-frames.swift (macOS, no ffmpeg). The demo vault is local only (.claude/demo-vault).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [vaultFolder, outDir = '.claude/shots/clips', ...only] = process.argv.slice(2);
if (!vaultFolder) {
  console.error('usage: node scripts/record-clips.mjs <demo-vault-folder> [outDir] [clipName…]');
  process.exit(1);
}

const PORT = process.env.CDP_PORT ?? '9333';
const THEME = process.env.CLIP_THEME ?? 'dark';
const CAMPAIGN = '/campaigns/ember-crown';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const vaultRoot = path.resolve(vaultFolder);
const partyFile = path.join(vaultRoot, 'ember-crown', 'encounters', '_party.json');
const throneFile = path.join(vaultRoot, 'ember-crown', 'encounters', 'Throne room.json');
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const partyBackup = readJson(partyFile, { version: 1, name: 'Party', notes: '', rule: null, battle: { status: 'idle', round: 0, turnId: null }, entities: [] });
const throneBackup = readJson(throneFile, { version: 1, name: 'Throne room', notes: '', rule: null, battle: { status: 'idle', round: 0, turnId: null }, entities: [] });

// ---- the visible cursor -------------------------------------------------------------------------------------------
const CURSOR_SETUP = `(() => {
  document.getElementById('clip-cursor')?.remove();
  document.getElementById('clip-cursor-style')?.remove();
  const style = document.createElement('style');
  style.id = 'clip-cursor-style';
  style.textContent = '@keyframes clip-ripple { from { transform: translate(-50%, -50%) scale(.3); opacity: .9; } to { transform: translate(-50%, -50%) scale(1.6); opacity: 0; } }';
  document.head.append(style);
  const cursor = document.createElement('div');
  cursor.id = 'clip-cursor';
  cursor.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));';
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.6 19 2.6-7.7L21 10.7z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.append(cursor);
  window.__clipMove = (x, y) => { cursor.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
  window.__clipRipple = (x, y) => {
    const ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;width:54px;height:54px;border-radius:50%;border:3px solid #e9b949;z-index:2147483646;pointer-events:none;animation:clip-ripple .55s ease-out forwards;';
    document.body.append(ring);
    setTimeout(() => ring.remove(), 700);
  };
})()`;

// ---- the recorder -------------------------------------------------------------------------------------------------
let frames = [];
let startedAt = 0;
let grabbing = false;
async function grabLoop() {
  while (grabbing) {
    const { result } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    frames.push({ at: (Date.now() - startedAt) / 1000, data: result.data });
  }
}
function startRecording() {
  frames = [];
  startedAt = Date.now();
  grabbing = true;
  const loop = grabLoop();
  return async () => {
    grabbing = false;
    await loop;
  };
}

let cursorAt = { x: 900, y: 700 };
async function moveTo(x, y, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 40));
  const from = cursorAt;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const px = from.x + (x - from.x) * ease;
    const py = from.y + (y - from.y) * ease;
    await run(`window.__clipMove(${px}, ${py})`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py });
    await wait(ms / steps);
  }
  cursorAt = { x, y };
}
async function click(x, y) {
  await moveTo(x, y);
  await wait(250);
  await run(`window.__clipRipple(${x}, ${y})`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await wait(700);
}
async function rightClick(x, y) {
  await moveTo(x, y);
  await wait(300);
  await run(`window.__clipRipple(${x}, ${y})`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
  await wait(900);
}
const centerOf = (elementExpression) =>
  run(`(() => { const el = ${elementExpression}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
const byLabel = (label, nth = 0) =>
  `[...document.querySelectorAll('button, [role="button"]')].filter((b) => (b.getAttribute('aria-label') || b.title || '') === ${JSON.stringify(label)})[${nth}]`;
async function clickLabel(label, nth = 0) {
  const spot = await centerOf(byLabel(label, nth));
  if (!spot) throw new Error(`No button labelled "${label}"`);
  await click(spot.x, spot.y);
}
const showReading = () =>
  run(`${byLabel('Reading')}?.click()`);

async function open(route) {
  await run(
    `window.electronAPI.ipcClient.workspace.save({ campaign: 'ember-crown', tabs: [], activeTabId: null, rightActiveTabId: null })`,
  );
  await run(`location.href = 'http://localhost:4200${CAMPAIGN}'`);
  await wait(2500);
  const navigationId = Date.now() % 100000;
  await run(
    `history.pushState({ navigationId: ${navigationId} }, '', ${JSON.stringify(route)}); dispatchEvent(new PopStateEvent('popstate', { state: { navigationId: ${navigationId} } }))`,
  );
  await wait(3000);
  await run(CURSOR_SETUP);
  cursorAt = { x: 900, y: 700 };
  await run(`window.__clipMove(${cursorAt.x}, ${cursorAt.y})`);
}

/** Clicks the smallest visible element whose text (or accessible name) starts with `text`, inside the viewport. */
async function clickText(text, root = 'body') {
  const spot = await run(
    `(() => { const t = ${JSON.stringify(text.toLowerCase())}; const els = [...document.querySelector(${JSON.stringify(root)}).querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.y > 0 && r.y < innerHeight && ((e.getAttribute('aria-label') || e.textContent || '').trim().toLowerCase().startsWith(t)); }); els.sort((a, b) => a.textContent.length - b.textContent.length); const e = els[0]; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
  );
  if (!spot) throw new Error(`Nothing to click that starts with "${text}"`);
  await click(spot.x, spot.y);
}
/** Waits until a sheet / overlay has slid into view. */
async function sheetReady() {
  for (let i = 0; i < 20; i++) {
    const y = await run(`document.querySelector('app-settings-page section, app-sheet section')?.getBoundingClientRect().y`);
    if (y !== undefined && y !== null && y >= 0) return;
    await wait(200);
  }
}
const openCustomize = async (item) => {
  await clickLabel('Customize');
  await wait(500);
  await clickText(item, '[role="menu"]');
  await sheetReady();
  await wait(900);
};

// ---- the clips (each one returns the function that stops its recording) --------------------------------------------
const CLIPS = {
  // The running encounter: press "Show the note" on an enemy, its sheet opens in the other side of the split screen.
  'tracker-note': async () => {
    await open(`${CAMPAIGN}/encounters/Castle%20gatehouse.json`);
    const stop = startRecording();
    await wait(1500);
    await clickLabel('Show the note', 2); // Captain Vex
    await wait(3500);
    return stop;
  },
  // The header search: click the field, type a term, results appear.
  search: async () => {
    await open(`${CAMPAIGN}/scenes/Castle%20of%20Drake`);
    await showReading();
    await wait(1500);
    const stop = startRecording();
    await wait(1200);
    const box = await centerOf(`document.querySelector('input[placeholder^="Search"]')`);
    await click(box?.x ?? 1066, box?.y ?? 34);
    for (const char of 'ember') {
      await send('Input.insertText', { text: char });
      await wait(220);
    }
    await wait(3000);
    return stop;
  },
  // The eye button next to a link opens a read-only preview of the note.
  'link-preview': async () => {
    await open(`${CAMPAIGN}/scenes/Castle%20of%20Drake`);
    await showReading();
    await wait(1500);
    await run(`document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; })`);
    await wait(2500);
    const stop = startRecording();
    await wait(1000);
    const link = await centerOf(
      `[...document.querySelectorAll('.arc-markdown-body a.arc-wikilink')].find((l) => l.textContent === 'Ember Ward')`,
    );
    await moveTo(link.x, link.y, 900);
    await wait(900);
    await clickLabel('Preview linked note: Ember Ward');
    await wait(3500);
    return stop;
  },
  // The map: pick "Add pin", click on a room, a new pin appears.
  'map-pin': async () => {
    await open(`${CAMPAIGN}/maps/Keep%20of%20Drake.json`);
    const stop = startRecording();
    await wait(1500);
    await clickLabel('Add pin');
    await wait(500);
    const target = await run(
      `(() => { const img = document.querySelector('.leaflet-image-layer'); const b = img.getBoundingClientRect(); return { x: b.x + b.width * 0.62, y: b.y + b.height * 0.5 }; })()`,
    );
    await click(target.x, target.y);
    await wait(1200);
    // the pin dialog: name it, then save
    const field = await centerOf(`document.querySelector('input[placeholder="Name of the place"]')`);
    await click(field.x, field.y);
    for (const char of 'Throne room') {
      await send('Input.insertText', { text: char });
      await wait(110);
    }
    await wait(600);
    const save = await centerOf(
      `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().toLowerCase() === 'save' && b.getBoundingClientRect().width > 0)`,
    );
    await click(save.x, save.y);
    await wait(2200);
    return stop;
  },

  // Customize menu → Templates: pick a template, its Markdown opens.
  templates: async () => {
    await open(`${CAMPAIGN}`);
    const stop = startRecording();
    await wait(1200);
    await openCustomize('Templates');
    await wait(900);
    await clickText('Enemies · D&D 5e');
    await wait(2500);
    await clickText('Spells · D&D 5e');
    await wait(2500);
    return stop;
  },
  // Customize menu → Tracker layouts: change the row size, the preview follows.
  'tracker-layout': async () => {
    await open(`${CAMPAIGN}`);
    const stop = startRecording();
    await wait(1200);
    await openCustomize('Tracker layouts');
    await wait(1200);
    await clickText('Card');
    await wait(2200);
    await clickText('Expanded');
    await wait(2200);
    await clickText('Compact');
    await wait(1800);
    return stop;
  },
  // Settings → AI Agents rules: create the rules file for the campaign.
  'agent-rules': async () => {
    await open(`${CAMPAIGN}`);
    const stop = startRecording();
    await wait(1200);
    await clickLabel('Settings');
    await sheetReady();
    await wait(1000);
    await clickText('AI Agents rules');
    await wait(2800);
    await clickText('Create the rules file');
    await wait(2500);
    // write a few rules into the new file, then save it
    const editor = await centerOf(`document.querySelector('app-settings-page .cm-content')`);
    await click(editor.x, editor.y);
    // the editor continues a list by itself on Enter: type the marker only on the first bullet
    const rules = ['# Rules for The Ember Crown', '', '- Write in English, in a dark and dry tone.', 'Name every enemy with a short, memorable title.', 'Link every creature to its note, like [[Captain Vex]].'];
    for (const [index, line] of rules.entries()) {
      await send('Input.insertText', { text: line });
      if (index < rules.length - 1) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      }
      await wait(600);
    }
    await wait(900);
    await clickLabel('Save');
    await wait(2500);
    return stop;
  },
  // Settings → MCP: switch it on (confirm the dialog) and start the server.
  mcp: async () => {
    await open(`${CAMPAIGN}`);
    const stop = startRecording();
    await wait(1200);
    await clickLabel('Settings');
    await sheetReady();
    await wait(1000);
    await clickText('MCP.');
    await wait(3000);
    await clickLabel('Use MCP');
    await wait(1800);
    await clickText('Switch on');
    await wait(2500);
    const start = await centerOf(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start' && b.getBoundingClientRect().width > 0)`);
    await wait(900);
    if (start) {
      await click(start.x, start.y);
      await wait(3500);
    }
    return stop;
  },
  // The campaign list: create a campaign (name, description, game system) and see it appear.
  'create-campaign': async () => {
    await open('/campaigns');
    const stop = startRecording();
    await wait(1500);
    await clickText('New campaign');
    await wait(1200);
    const name = await centerOf(`document.querySelector('input[placeholder="Lost Mine of Phandelver"]')`);
    await click(name.x, name.y);
    for (const char of 'Tides of Ash') {
      await send('Input.insertText', { text: char });
      await wait(90);
    }
    const description = await centerOf(`document.querySelector('input[placeholder="A short summary of the adventure"]')`);
    await click(description.x, description.y);
    for (const char of 'A port city on fire and a crew with a map.') {
      await send('Input.insertText', { text: char });
      await wait(45);
    }
    await wait(500);
    await clickText('Generic');
    await wait(800);
    await clickText('D&D 5e');
    await wait(900);
    await clickText('Create campaign');
    await wait(3500);
    return stop;
  },

  // Map pin → right-click → "Open to the side": the file linked to the pin opens in the other half of the screen.
  'map-side': async () => {
    await open(`${CAMPAIGN}/maps/Keep%20of%20Drake.json`);
    await wait(3000);
    const stop = startRecording();
    await wait(1500);
    const pin = await centerOf(`document.querySelector('.arc-map-pin-dot')`);
    await moveTo(pin.x, pin.y, 900);
    await wait(500);
    await rightClick(pin.x, pin.y);
    await wait(1200);
    await clickText('Open to the side');
    await wait(3800);
    return stop;
  },
  // The party roster: from the Encounters page, add two player characters from their notes.
  'party-create': async () => {
    // start from an empty roster, then put it back afterwards (the main loop restores it)
    fs.writeFileSync(partyFile, JSON.stringify({ ...partyBackup, entities: [] }, null, 2));
    await run('window.electronAPI.ipcClient.index.rebuild({})');
    await open(`${CAMPAIGN}/encounters`);
    const stop = startRecording();
    await wait(1500);
    await clickText('Party roster');
    await wait(2200);
    for (const member of ['Brannoch', 'Lyra Ashdown']) {
      await clickText('Add combatant');
      await wait(1000);
      await clickText('Select');
      await wait(900);
      await clickText(member);
      await wait(1100);
      const confirm = await centerOf(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add' && b.getBoundingClientRect().width > 0)`);
      await click(confirm.x, confirm.y);
      await wait(1800);
    }
    await wait(1500);
    return stop;
  },
  // Add party: the roster joins an encounter in one press.
  'party-add': async () => {
    fs.writeFileSync(partyFile, JSON.stringify(partyBackup, null, 2));
    fs.writeFileSync(throneFile, JSON.stringify(throneBackup, null, 2));
    await run('window.electronAPI.ipcClient.index.rebuild({})');
    await open(`${CAMPAIGN}/encounters/Throne%20room.json`);
    await wait(1500);
    const stop = startRecording();
    await wait(1600);
    await clickText('Add party');
    await wait(3500);
    return stop;
  },
  // A link inside a note: right-click it and open the linked note to the side.
  'link-side': async () => {
    await open(`${CAMPAIGN}/scenes/Castle%20of%20Drake`);
    await wait(2500);
    const stop = startRecording();
    await wait(1500);
    const link = await centerOf(`[...document.querySelectorAll('a.cm-lp-link')].find((a) => a.getBoundingClientRect().width > 0 && a.textContent === 'Captain Vex')`);
    await moveTo(link.x, link.y, 900);
    await wait(500);
    await rightClick(link.x, link.y);
    await wait(1200);
    await clickText('Open to the side');
    await wait(3800);
    return stop;
  },
};

// ---- main ---------------------------------------------------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true });
await run(
  `window.electronAPI.ipcClient.vault.open({ folderPath: ${JSON.stringify(path.resolve(vaultFolder))} })`,
);
await run('window.electronAPI.ipcClient.index.rebuild({})');
await run(`localStorage.setItem('theme', '${THEME}')`);

for (const [name, clip] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue;
  console.log('recording', name);
  let stop;
  try {
    stop = await clip();
  } catch (error) {
    grabbing = false;
    console.error(`  failed: ${error.message}`);
    continue;
  }
  await stop();
  if (name === 'party-create' || name === 'party-add') {
    fs.writeFileSync(partyFile, JSON.stringify(partyBackup, null, 2));
    fs.writeFileSync(throneFile, JSON.stringify(throneBackup, null, 2));
  }
  if (name === 'agent-rules') {
    fs.rmSync(path.join(path.resolve(vaultFolder), 'ember-crown', 'agents.md'), { force: true });
  }
  if (name === 'mcp') {
    await run(`window.electronAPI.ipcClient.mcp.stop({}).catch(() => null)`);
    await run(`window.electronAPI.ipcClient.mcp.setEnabled({ enabled: false }).catch(() => null)`);
  }
  if (name === 'create-campaign') {
    await run(`window.electronAPI.ipcClient.campaigns.remove({ slug: 'tides-of-ash' })`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `clip-${name}-`));
  frames.forEach((frame, index) =>
    fs.writeFileSync(path.join(dir, `${String(index + 1).padStart(4, '0')}.jpg`), Buffer.from(frame.data, 'base64')),
  );
  fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify(frames.map((frame) => frame.at)));
  const file = path.join(outDir, `${name}-${THEME}.mp4`);
  execFileSync('swift', [path.join(import.meta.dirname, 'encode-frames.swift'), dir, file], { stdio: 'inherit' });
  console.log(`  ${frames.length} frames, ${frames.at(-1).at.toFixed(1)} s`);
}
ws.close();
