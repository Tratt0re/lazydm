// Times the vault indexer on a generated campaign:
//   npm run bench:index -- [notes]      (default 3000)
// better-sqlite3 is built for Electron, so this runs under Electron's Node, not the system one.
// It prints the full scan, one created note and a renamed folder, the three cases that make a big Codex feel stuck.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
    BrowserWindow: { getAllWindows: () => [] },
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function main() {
  const vaultPath = path.join(dataDir, 'vault');
  generateVault(vaultPath);
  const indexer = require(path.join(ROOT, 'electron/controllers/indexer.controller.js'));
  const report = (label, startedAt) => console.log(`${label}: ${Date.now() - startedAt} ms`);

  let startedAt = Date.now();
  indexer.start({ id: 'bench', path: vaultPath });
  while (indexer.getStatus().status !== 'ready') {
    await sleep(20);
  }
  report(
    `full scan of ${indexer.getStatus().fileCount} files (${noteCount * LINKS_PER_NOTE} links)`,
    startedAt,
  );

  fs.writeFileSync(
    path.join(vaultPath, 'camp-one', 'npcs', 'brand-new.md'),
    '---\ntitle: New\n---\n# New [[note-5]]\n',
  );
  startedAt = Date.now();
  await indexer.reindexPaths(['camp-one/npcs/brand-new.md']);
  report('create one note', startedAt);

  fs.renameSync(
    path.join(vaultPath, 'camp-one', 'enemies'),
    path.join(vaultPath, 'camp-one', 'monsters'),
  );
  startedAt = Date.now();
  await indexer.reindexPaths(['camp-one/enemies', 'camp-one/monsters']);
  report(`rename a folder of ${noteCount / sections.length} notes`, startedAt);

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
