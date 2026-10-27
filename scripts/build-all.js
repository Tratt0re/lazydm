const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * Builds the app for every desktop target and keeps one file per target in `release/all/`: the .zip of each macOS
 * and Linux build and the portable .exe of Windows (no installers). Usage:
 *
 *   npm run dist:all                      every target
 *   npm run dist:all -- mac-x64 win-x64   only these
 *
 * Each target is packaged on its own, so one failing does not stop the others; the exit code is 1 if any failed.
 */
const rootDir = path.join(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');
const outDir = path.join(releaseDir, 'all');
const workDir = path.join(releaseDir, '.work');
const builderCli = path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js');
const rebuildCli = path.join(rootDir, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js');

/** `args` go to electron-builder; `extension` picks the file to keep; `host` is the only OS that can build it. */
const TARGETS = {
  'mac-arm64': { args: ['--mac', 'zip', '--arm64'], extension: '.zip', host: 'darwin' },
  'mac-x64': { args: ['--mac', 'zip', '--x64'], extension: '.zip', host: 'darwin' },
  'win-x64': { args: ['--win', 'portable', '--x64'], extension: '.exe', host: null },
  'linux-x64': { args: ['--linux', 'zip', '--x64'], extension: '.zip', host: null },
};

/** First bytes of a native module per target OS: PE (Windows), ELF (Linux), Mach-O (macOS, 64-bit or fat). */
const NATIVE_MAGIC = {
  win: [Buffer.from('MZ')],
  linux: [Buffer.from([0x7f, 0x45, 0x4c, 0x46])],
  mac: [Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from([0xca, 0xfe, 0xba, 0xbe])],
};

function findFiles(dir, fileName) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(fullPath, fileName));
    else if (entry.name === fileName) found.push(fullPath);
  }
  return found;
}

/**
 * Packaging can ship a SQLite module built for another OS (e.g. the macOS one inside a Windows build), and the app
 * then fails at startup. Returns an error message, or null when the packaged module matches the target's OS.
 */
function checkNativeModule(id, targetWorkDir) {
  const os = id.split('-')[0];
  const modules = findFiles(targetWorkDir, 'better_sqlite3.node');
  if (modules.length === 0) return 'better_sqlite3.node is missing from the package';

  for (const modulePath of modules) {
    const head = Buffer.alloc(4);
    const fd = fs.openSync(modulePath, 'r');
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    if (!NATIVE_MAGIC[os].some((magic) => head.subarray(0, magic.length).equals(magic))) {
      return `better_sqlite3.node is not a ${os} binary (${path.relative(targetWorkDir, modulePath)})`;
    }
  }
  return null;
}

function run(label, args) {
  console.log(`\n[build-all] ${label}`);
  const result = spawnSync(process.execPath, args, { cwd: rootDir, stdio: 'inherit' });
  return result.status === 0;
}

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function selectTargets() {
  const requested = process.argv.slice(2);
  const unknown = requested.filter((id) => !TARGETS[id]);
  if (unknown.length > 0) {
    console.error(
      `[build-all] Unknown target: ${unknown.join(', ')}. Targets: ${Object.keys(TARGETS).join(', ')}`,
    );
    process.exit(1);
  }

  return requested.length > 0 ? requested : Object.keys(TARGETS);
}

/** Moves the wanted file(s) of one target out of its work folder into `release/all/`; returns their names. */
function collect(id, targetWorkDir, takenNames) {
  const { extension } = TARGETS[id];
  const files = fs
    .readdirSync(targetWorkDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === extension)
    .map((entry) => entry.name);

  fs.mkdirSync(outDir, { recursive: true });
  return files.map((name) => {
    // Two targets can name their file alike; the later one is prefixed so neither overwrites the other.
    const finalName = takenNames.has(name) ? `${id}-${name}` : name;
    takenNames.add(finalName);
    fs.renameSync(path.join(targetWorkDir, name), path.join(outDir, finalName));
    return finalName;
  });
}

function main() {
  const ids = selectTargets();
  const results = [];
  const takenNames = new Set();
  let builderRan = false;

  // Files of an earlier run are removed first, so the folder only ever holds this run's results.
  fs.rmSync(outDir, { recursive: true, force: true });

  const isWebReady =
    run('Web build', [path.join(__dirname, 'build-web.js')]) &&
    run('Preload bundle', [path.join(__dirname, 'build-preload.js'), '--prod']);

  if (isWebReady) {
    for (const id of ids) {
      const target = TARGETS[id];
      if (target.host && target.host !== process.platform) {
        results.push({ id, status: 'skipped', note: `needs a ${target.host} computer` });
        continue;
      }

      const targetWorkDir = path.join(workDir, id);
      const started = Date.now();
      builderRan = true;
      const isBuilt = run(`Packaging ${id}`, [
        builderCli,
        ...target.args,
        '--publish',
        'never',
        `-c.directories.output=${targetWorkDir}`,
      ]);
      const seconds = Math.round((Date.now() - started) / 1000);
      if (!isBuilt) {
        results.push({ id, status: 'failed', note: `after ${seconds}s` });
        continue;
      }

      const nativeError = checkNativeModule(id, targetWorkDir);
      if (nativeError) {
        results.push({ id, status: 'failed', note: nativeError });
        continue;
      }

      const names = collect(id, targetWorkDir, takenNames);
      results.push(
        names.length > 0
          ? { id, status: 'ok', note: `${seconds}s`, files: names }
          : { id, status: 'failed', note: `built, but no ${target.extension} file was produced` },
      );
    }
  }

  // Packaging swaps the native SQLite module and the preload bundle for the last target's. Put this computer's
  // development versions back so `npm run dev` still works.
  fs.rmSync(workDir, { recursive: true, force: true });
  run('Restore the development preload bundle', [path.join(__dirname, 'build-preload.js')]);
  if (builderRan) {
    run('Restore the native SQLite module for this computer', [
      rebuildCli,
      '-f',
      '-w',
      'better-sqlite3',
    ]);
  }

  console.log('\n[build-all] Summary');
  for (const result of results) {
    console.log(`  ${result.status.padEnd(8)} ${result.id.padEnd(10)} ${result.note}`);
    for (const name of result.files ?? []) {
      const size = formatSize(fs.statSync(path.join(outDir, name)).size);
      console.log(`           ${path.join('release', 'all', name)}  (${size})`);
    }
  }
  if (!isWebReady) {
    console.log('  The web build failed, so nothing was packaged.');
  }

  process.exit(isWebReady && results.every((result) => result.status !== 'failed') ? 0 : 1);
}

main();
