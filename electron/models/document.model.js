const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const {
  formatTimestampForFilename,
  hashContent,
  resolveInsideVault,
  safeWriteFileAtomic,
} = require('../utils/file-utils');
const { parseMarkdownDocument } = require('../utils/markdown-parse');

const MARKDOWN_EXTENSION = '.md';
const TEMPLATES_DIR_NAME = '_templates';

function assertMarkdownPath(relativePath) {
  if (path.posix.extname(relativePath).toLocaleLowerCase() !== MARKDOWN_EXTENSION) {
    throw new Error(`Only markdown notes can be opened as documents: ${relativePath}`);
  }
}

function toLocalDateString(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function readDocument(rootPath, relativePath) {
  assertMarkdownPath(relativePath);
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  const buffer = await fs.promises.readFile(absolutePath);
  const stats = await fs.promises.stat(absolutePath);
  const content = buffer.toString('utf8');
  const document = parseMarkdownDocument(content, { sourcePath: relativePath });

  return {
    path: relativePath,
    content,
    contentHash: hashContent(buffer),
    mtimeMs: Math.trunc(stats.mtimeMs),
    title: document.title ?? path.posix.basename(relativePath, MARKDOWN_EXTENSION),
    type: document.type,
    frontmatter: document.frontmatter,
    frontmatterError: document.frontmatterError,
    body: document.body,
  };
}

async function readContentHash(absolutePath) {
  try {
    return hashContent(await fs.promises.readFile(absolutePath));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

/**
 * Saves a note only if it still has the content the editor loaded (`expectedHash`).
 * When someone else changed it meanwhile (another device, Obsidian…) nothing is written and the
 * current version is returned, so the user can choose what to keep.
 */
async function writeDocument(rootPath, relativePath, content, expectedHash) {
  assertMarkdownPath(relativePath);
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  const currentHash = await readContentHash(absolutePath);

  if (currentHash !== null && currentHash !== expectedHash) {
    return { status: 'conflict', current: await readDocument(rootPath, relativePath) };
  }

  safeWriteFileAtomic(absolutePath, content);
  const stats = await fs.promises.stat(absolutePath);

  return {
    status: 'saved',
    contentHash: hashContent(Buffer.from(content, 'utf8')),
    mtimeMs: Math.trunc(stats.mtimeMs),
  };
}

/** Writes the editor content next to the note as `<name>-copy-<timestamp>.md`, leaving the note untouched. */
async function saveDocumentCopy(rootPath, relativePath, content) {
  assertMarkdownPath(relativePath);
  const directory = path.posix.dirname(relativePath);
  const baseName = path.posix.basename(relativePath, MARKDOWN_EXTENSION);
  const copyPath = path.posix.join(directory, `${baseName}-copy-${formatTimestampForFilename()}${MARKDOWN_EXTENSION}`);

  safeWriteFileAtomic(resolveInsideVault(rootPath, copyPath), content);
  return readDocument(rootPath, copyPath);
}

/** Renames a note file inside the vault; a case-only rename of the same file is allowed. */
async function renameDocumentFile(rootPath, fromPath, toPath) {
  assertMarkdownPath(fromPath);
  assertMarkdownPath(toPath);
  const fromAbsolutePath = resolveInsideVault(rootPath, fromPath);
  const toAbsolutePath = resolveInsideVault(rootPath, toPath);
  const isCaseOnlyRename = fromPath.toLocaleLowerCase() === toPath.toLocaleLowerCase();

  if (!isCaseOnlyRename && fs.existsSync(toAbsolutePath)) {
    throw new Error(`A note named "${path.posix.basename(toPath)}" already exists in ${path.posix.dirname(toPath)}.`);
  }

  await fs.promises.rename(fromAbsolutePath, toAbsolutePath);
}

/** Template of a note type (`_templates/monster.md`), with Obsidian's `{{title}}`, `{{date}}` and `{{time}}` filled in. */
async function readTemplate(rootPath, type, title) {
  const templatePath = resolveInsideVault(rootPath, `${TEMPLATES_DIR_NAME}/${type}${MARKDOWN_EXTENSION}`);
  if (!fs.existsSync(templatePath)) {
    return null;
  }

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const template = await fs.promises.readFile(templatePath, 'utf8');
  return template
    .replace(/\{\{\s*title\s*\}\}/g, title)
    .replace(/\{\{\s*date\s*\}\}/g, toLocalDateString(now))
    .replace(/\{\{\s*time\s*\}\}/g, time);
}

function buildDefaultNote(type, title) {
  return `---\n${YAML.stringify({ type, title })}---\n# ${title}\n`;
}

/** Creates `<folder>/<slug>.md` from the template of its type, or with a minimal frontmatter. */
async function createDocument(rootPath, { folderPath, slug, title, type }) {
  const relativePath = `${folderPath.replace(/\/+$/, '')}/${slug}${MARKDOWN_EXTENSION}`;
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  if (fs.existsSync(absolutePath)) {
    throw new Error(`A note named "${slug}${MARKDOWN_EXTENSION}" already exists in ${folderPath}.`);
  }

  const content = (await readTemplate(rootPath, type, title)) ?? buildDefaultNote(type, title);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  safeWriteFileAtomic(absolutePath, content);

  return readDocument(rootPath, relativePath);
}

module.exports = {
  createDocument,
  readDocument,
  renameDocumentFile,
  saveDocumentCopy,
  writeDocument,
};
