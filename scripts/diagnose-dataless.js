// Prints what the sync check sees for the notes of a folder: node scripts/diagnose-dataless.js <codex folder> [max files]
// Run it once on Windows to learn whether `stats.blocks` can tell a cloud placeholder from a local note.
const fs = require('node:fs');
const path = require('node:path');

const rootPath = process.argv[2];
const maxFiles = Number(process.argv[3]) || 15;

if (!rootPath) {
  console.error('Usage: node scripts/diagnose-dataless.js <codex folder> [max files]');
  process.exit(1);
}

const rows = [];
const pendingDirs = [path.resolve(rootPath)];

while (pendingDirs.length > 0 && rows.length < maxFiles) {
  const directoryPath = pendingDirs.pop();
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      pendingDirs.push(absolutePath);
    } else if (entry.name.toLowerCase().endsWith('.md') && rows.length < maxFiles) {
      const stats = fs.statSync(absolutePath);
      rows.push({
        file: path.relative(rootPath, absolutePath),
        size: stats.size,
        blocks: stats.blocks,
        // The same rule the app uses today (electron/models/vault.model.js).
        flaggedAsPending: stats.size > 0 && stats.blocks === 0,
      });
    }
  }
}

console.log(`Platform: ${process.platform}, Node ${process.version}`);
console.table(rows);
console.log(
  `${rows.filter((row) => row.flaggedAsPending).length} of ${rows.length} notes flagged as pending by size/blocks.`,
);
