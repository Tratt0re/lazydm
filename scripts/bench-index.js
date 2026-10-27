// Times the vault indexer on a generated campaign:
//   npm run bench:index -- [notes]      (default 3000)
// better-sqlite3 is built for Electron, so this runs under Electron's Node, not the system one.
// It prints the full scan, one created note and a renamed folder, the three cases that make a big Codex feel stuck.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const ROOT = path.join(__dirname, '..');
const noteCount = Number(process.argv[2] || 3000);
const sections = ['enemies', 'locations', 'npcs', 'items', 'scenes'];
const LINKS_PER_NOTE = 8;

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-bench-'));
// The indexer asks Electron for the user data folder and the windows to notify: answer with a temp folder, no windows.
const electronPath = require.resolve('electron', { paths: [ROOT] });
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: { getPath: () => dataDir, isPackaged: false },
    BrowserWindow: {
      getAllWindows: () => [
        {
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            send: (channel) => {
              if (channel === 'index:updated') {
                broadcasts.updated += 1;
              }
            },
          },
        },
      ],
    },
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `index:updated` pushes seen by the (fake) window: every one makes the open pages reload. */
const broadcasts = { updated: 0 };

function generateVault(vaultPath) {
  fs.mkdirSync(path.join(vaultPath, '.lazydm'), { recursive: true });
  fs.writeFileSync(
    path.join(vaultPath, '.lazydm', 'vault.json'),
    JSON.stringify({ schemaVersion: 2, name: 'bench' }),
  );
  fs.mkdirSync(path.join(vaultPath, 'camp-one'), { recursive: true });
  fs.writeFileSync(
    path.join(vaultPath, 'camp-one', 'campaign.md'),
    '---\ntitle: Camp\n---\n# Camp\n',
  );
  for (const section of sections) {
    fs.mkdirSync(path.join(vaultPath, 'camp-one', section), { recursive: true });
  }

  for (let i = 0; i < noteCount; i++) {
    const links = Array.from(
      { length: LINKS_PER_NOTE },
      (_, k) => `[[note-${(i * 7 + k * 13) % noteCount}]]`,
    ).join(' and ');
    fs.writeFileSync(
      path.join(vaultPath, 'camp-one', sections[i % sections.length], `note-${i}.md`),
      `---\ntitle: Note ${i}\ntags: [a, b]\n---\n# Note ${i}\n\n## Part\n\nBody of note ${i} ${links}\n`,
    );
  }
}

/**
 * Measures how long the main thread stays blocked. A timer on the main thread cannot: it only fires after the block
 * ends. A worker thread watches a heartbeat the main thread writes, so a synchronous block shows up as a long gap.
 */
function startStallMonitor() {
  const heartbeat = new Float64Array(new SharedArrayBuffer(8));
  heartbeat[0] = Date.now();
  const beat = setInterval(() => {
    heartbeat[0] = Date.now();
  }, 5);
  const worker = new Worker(
    `const { workerData, parentPort } = require('node:worker_threads');
     const beat = new Float64Array(workerData);
     let longest = 0; let total = 0; let count = 0;
     const timer = setInterval(() => {
       const gap = Date.now() - beat[0];
       if (gap > 50) { total += gap; count += 1; }
       if (gap > longest) longest = gap;
     }, 5);
     parentPort.on('message', () => { clearInterval(timer); parentPort.postMessage({ longest }); });`,
    { eval: true, workerData: heartbeat.buffer },
  );
  return {
    /** Longest stretch (ms) the main thread did not run since the monitor started or was last read. */
    async read() {
      return new Promise((resolve) => {
        worker.once('message', ({ longest }) => resolve(longest));
        worker.postMessage('stop');
      });
    },
    stop() {
      clearInterval(beat);
      void worker.terminate();
    },
  };
}

/** Lets the file watcher report what LazyDM just wrote, then prints how many reloads the whole operation caused. */
async function settle(label) {
  await sleep(1500);
  console.log(`  ${label}: ${broadcasts.updated} index:updated push(es) in total`);
  broadcasts.updated = 0;
}

async function main() {
  const vaultPath = path.join(dataDir, 'vault');
  generateVault(vaultPath);
  const indexer = require(path.join(ROOT, 'electron/controllers/indexer.controller.js'));
  const report = (label, startedAt) => console.log(`${label}: ${Date.now() - startedAt} ms`);

  let monitor = startStallMonitor();
  let startedAt = Date.now();
  indexer.start({ id: 'bench', path: vaultPath });
  while (indexer.getStatus().status !== 'ready') {
    await sleep(20);
  }
  broadcasts.updated = 0;
  report(
    `full scan of ${indexer.getStatus().fileCount} files (${noteCount * LINKS_PER_NOTE} links)`,
    startedAt,
  );
  console.log(`  main thread blocked for at most ${await monitor.read()} ms in a row`);
  monitor.stop();

  fs.writeFileSync(
    path.join(vaultPath, 'camp-one', 'npcs', 'brand-new.md'),
    '---\ntitle: New\n---\n# New [[note-5]]\n',
  );
  monitor = startStallMonitor();
  startedAt = Date.now();
  await indexer.reindexPaths(['camp-one/npcs/brand-new.md']);
  report('create one note', startedAt);
  console.log(`  main thread blocked for at most ${await monitor.read()} ms in a row`);
  monitor.stop();
  await settle('create one note');

  fs.renameSync(
    path.join(vaultPath, 'camp-one', 'enemies'),
    path.join(vaultPath, 'camp-one', 'monsters'),
  );
  monitor = startStallMonitor();
  startedAt = Date.now();
  await indexer.reindexPaths(['camp-one/enemies', 'camp-one/monsters']);
  report(`rename a folder of ${noteCount / sections.length} notes`, startedAt);
  console.log(`  main thread blocked for at most ${await monitor.read()} ms in a row`);
  monitor.stop();
  await settle('rename a folder');

  // The echo skip must never hide a real change: an edit made by another app right after our own write.
  const editedPath = 'camp-one/npcs/brand-new.md';
  const vaultIndexModel = require(path.join(ROOT, 'electron/models/vault-index.model.js'));
  fs.appendFileSync(path.join(vaultPath, editedPath), '\nEdited by another app, with a longer body.\n');
  await sleep(1500);
  const indexedSize = vaultIndexModel.getFileState(editedPath)?.size;
  const diskSize = fs.statSync(path.join(vaultPath, editedPath)).size;
  console.log(
    `external edit right after our write: ${indexedSize === diskSize ? 'indexed (ok)' : `MISSED (index ${indexedSize}, disk ${diskSize})`}`,
  );
  if (indexedSize !== diskSize) {
    process.exitCode = 1;
  }

  indexer.stop();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    process.exit();
  });
