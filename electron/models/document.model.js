const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const {
  formatTimestampForFilename,
  hashContent,
  resolveInsideVault,
  safeWriteFileAtomic,
} = require('../utils/file-utils');
const { parseMarkdownDocument, setFrontmatterField } = require('../utils/markdown-parse');
const templateModel = require('./template.model');

const MARKDOWN_EXTENSION = '.md';

function assertMarkdownPath(relativePath) {
  if (path.posix.extname(relativePath).toLocaleLowerCase() !== MARKDOWN_EXTENSION) {
    throw new Error(`Only markdown notes can be opened as documents: ${relativePath}`);
  }
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

  await fs.promises.mkdir(path.dirname(toAbsolutePath), { recursive: true });
  await fs.promises.rename(fromAbsolutePath, toAbsolutePath);
}

/**
 * Copies a vault file (note or asset) to another vault path without ever overwriting: returns
 * `{ status: 'exists' }` when the target is taken.
 */
async function copyVaultFile(rootPath, fromPath, toPath) {
  const toAbsolutePath = resolveInsideVault(rootPath, toPath);
  if (fs.existsSync(toAbsolutePath)) {
    return { status: 'exists', path: toPath };
  }

  await fs.promises.mkdir(path.dirname(toAbsolutePath), { recursive: true });
  await fs.promises.copyFile(
    resolveInsideVault(rootPath, fromPath),
    toAbsolutePath,
    fs.constants.COPYFILE_EXCL,
  );
  return { status: 'copied', path: toPath };
}

function buildDefaultNote(type, title) {
  return `---\n${YAML.stringify({ type, title })}---\n# ${title}\n`;
}

/**
 * Creates `<folder>/<slug>.md` from the template of its type (see `templateModel.resolveTemplate`), or with
 * a minimal frontmatter when the type has none. `section` is the folder's display name for `{{section}}`.
 */
async function createDocument(rootPath, { folderPath, slug, title, type, section, subtype = null }) {
  const relativePath = `${folderPath.replace(/\/+$/, '')}/${slug}${MARKDOWN_EXTENSION}`;
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  if (fs.existsSync(absolutePath)) {
    throw new Error(`A note named "${slug}${MARKDOWN_EXTENSION}" already exists in ${folderPath}.`);
  }

  const template = await templateModel.resolveTemplate(rootPath, { folderPath, type });
  const content =
    template === null
      ? buildDefaultNote(type, title)
      : templateModel.applyPlaceholders(template, {
          title,
          type,
          campaign: await templateModel.readScopeName(rootPath, folderPath),
          section: section || path.posix.basename(folderPath),
        });
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  // A note created in a sub-folder of its section gets the sub-folder as its sub-type.
  safeWriteFileAtomic(absolutePath, subtype ? setFrontmatterField(content, 'subtype', subtype) : content);

  return readDocument(rootPath, relativePath);
}

/** Moves any vault file (an asset) to another vault path, creating its folder; never overwrites. */
async function moveVaultFile(rootPath, fromPath, toPath) {
  const toAbsolutePath = resolveInsideVault(rootPath, toPath);
  if (fs.existsSync(toAbsolutePath)) {
    throw new Error(`A file named "${path.posix.basename(toPath)}" already exists in ${path.posix.dirname(toPath)}.`);
  }

  await fs.promises.mkdir(path.dirname(toAbsolutePath), { recursive: true });
  await fs.promises.rename(resolveInsideVault(rootPath, fromPath), toAbsolutePath);
}

/** Sub-folders of a vault folder (hidden and `_` folders left out), by name; none when it does not exist yet. */
async function listSubfolders(rootPath, folderPath) {
  try {
    const entries = await fs.promises.readdir(resolveInsideVault(rootPath, folderPath), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isDirectory() && !/^[._]/.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/** Creates an empty folder (and the folders above it); refuses a name that is taken. */
async function createFolder(rootPath, folderPath) {
  const absolutePath = resolveInsideVault(rootPath, folderPath);
  if (fs.existsSync(absolutePath)) {
    throw new Error(`A folder named "${path.posix.basename(folderPath)}" already exists.`);
  }

  await fs.promises.mkdir(absolutePath, { recursive: true });
  return folderPath;
}

module.exports = {
  copyVaultFile,
  createDocument,
  createFolder,
  listSubfolders,
  moveVaultFile,
  readDocument,
  renameDocumentFile,
  saveDocumentCopy,
  writeDocument,
};
