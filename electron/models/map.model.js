const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hashContent, resolveInsideVault, safeWriteFileAtomic } = require('../utils/file-utils');
const { parseSectionFolder } = require('./section.model');

const MAP_EXTENSION = '.json';
const MAPS_SECTION_KEY = 'maps';
const MAP_VERSION = 1;
const MAP_NAME_MAX_LENGTH = 120;
const MAP_IMAGE_MAX_LENGTH = 512;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const PINS_MAX = 1000;
const PATHS_MAX = 500;
const PATH_POINTS_MAX = 2000;
const NOTES_MAX = 500;
const ID_MAX_LENGTH = 64;
const LABEL_MAX_LENGTH = 120;
const NOTE_TEXT_MAX_LENGTH = 2000;
const LINK_MAX_LENGTH = 512;
const PATH_WIDTH_MIN = 1;
const PATH_WIDTH_MAX = 12;
const DEFAULT_PATH_WIDTH = 3;

/** User colours are keys of a fixed palette; the page maps them to theme tokens. Never free hex input. */
const MAP_COLORS = Object.freeze([
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'gray',
]);
const DEFAULT_PIN_COLOR = 'red';
const DEFAULT_PATH_COLOR = 'blue';
const DEFAULT_NOTE_COLOR = 'yellow';

/** Lucide icon names a pin can show. */
const PIN_ICONS = Object.freeze([
  'map-pin',
  'castle',
  'house',
  'tent',
  'skull',
  'swords',
  'flag',
  'star',
  'gem',
  'landmark',
  'trees',
  'mountain',
  'anchor',
  'door-open',
  'triangle-alert',
]);
const DEFAULT_PIN_ICON = 'map-pin';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function toId(value) {
  return toText(value, ID_MAX_LENGTH) ?? crypto.randomUUID();
}

/** A coordinate as a fraction of the image: a finite number clamped to 0..1, null when it is not a number. */
function toFraction(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : null;
}

function toColor(value, fallback) {
  return MAP_COLORS.includes(value) ? value : fallback;
}

/** A link stays inside the vault: no absolute path, no `..`. */
function toLink(value) {
  const link = toText(value, LINK_MAX_LENGTH);
  if (!link || link.startsWith('/') || link.split('/').some((segment) => segment === '..')) {
    return null;
  }

  return link;
}

function normalizePin(pin) {
  const x = isPlainObject(pin) ? toFraction(pin.x) : null;
  const y = isPlainObject(pin) ? toFraction(pin.y) : null;
  if (x === null || y === null) {
    return null;
  }

  return {
    id: toId(pin.id),
    x,
    y,
    label: toText(pin.label, LABEL_MAX_LENGTH) ?? '',
    color: toColor(pin.color, DEFAULT_PIN_COLOR),
    icon: PIN_ICONS.includes(pin.icon) ? pin.icon : DEFAULT_PIN_ICON,
    link: toLink(pin.link),
  };
}

function normalizePath(item) {
  if (!isPlainObject(item)) {
    return null;
  }

  const points = (Array.isArray(item.points) ? item.points : [])
    .slice(0, PATH_POINTS_MAX)
    .map((point) => ({
      x: isPlainObject(point) ? toFraction(point.x) : null,
      y: isPlainObject(point) ? toFraction(point.y) : null,
    }))
    .filter((point) => point.x !== null && point.y !== null);
  if (points.length < 2) {
    return null; // a line needs two points
  }

  const width = Number.isFinite(item.width) ? Math.round(item.width) : DEFAULT_PATH_WIDTH;
  return {
    id: toId(item.id),
    points,
    color: toColor(item.color, DEFAULT_PATH_COLOR),
    width: Math.min(PATH_WIDTH_MAX, Math.max(PATH_WIDTH_MIN, width)),
    label: toText(item.label, LABEL_MAX_LENGTH) ?? '',
  };
}

function normalizeNote(note) {
  const x = isPlainObject(note) ? toFraction(note.x) : null;
  const y = isPlainObject(note) ? toFraction(note.y) : null;
  if (x === null || y === null) {
    return null;
  }

  return {
    id: toId(note.id),
    x,
    y,
    text: typeof note.text === 'string' ? note.text.slice(0, NOTE_TEXT_MAX_LENGTH) : '',
    color: toColor(note.color, DEFAULT_NOTE_COLOR),
  };
}

/** Items of a list, normalised, with ids made unique and the list capped. */
function normalizeList(value, max, normalizeItem) {
  const ids = new Set();
  return (Array.isArray(value) ? value : [])
    .slice(0, max)
    .map(normalizeItem)
    .filter((item) => {
      if (!item || ids.has(item.id)) {
        return false;
      }

      ids.add(item.id);
      return true;
    });
}

/** The image of a map: a vault-relative path of an image, never absolute and never leaving the vault. */
function toImagePath(value) {
  const image = toText(value, MAP_IMAGE_MAX_LENGTH);
  if (
    !image ||
    image.startsWith('/') ||
    image.split('/').some((segment) => segment === '..') ||
    !IMAGE_EXTENSION_PATTERN.test(image)
  ) {
    return null;
  }

  return image;
}

/**
 * A map read from a file. Missing or wrong fields get defaults instead of failing, so a hand-edited or minimal
 * file still opens; unknown fields are dropped and ids are made unique.
 */
function normalizeMap(value, fallbackName) {
  const source = isPlainObject(value) ? value : {};
  return {
    version: MAP_VERSION,
    name: toText(source.name, MAP_NAME_MAX_LENGTH) ?? fallbackName,
    image: toImagePath(source.image),
    pins: normalizeList(source.pins, PINS_MAX, normalizePin),
    paths: normalizeList(source.paths, PATHS_MAX, normalizePath),
    notes: normalizeList(source.notes, NOTES_MAX, normalizeNote),
  };
}

/** Maps are `.json` files in the Maps section of a scope (or in one of its sub-folders). */
function assertMapPath(relativePath) {
  const isJson = path.posix.extname(relativePath).toLocaleLowerCase() === MAP_EXTENSION;
  const folder = parseSectionFolder(path.posix.dirname(relativePath));
  if (!isJson || folder?.section !== MAPS_SECTION_KEY) {
    throw new Error(`Not a map file: ${relativePath}`);
  }
}

function serialize(map) {
  return `${JSON.stringify(map, null, 2)}\n`;
}

function getFallbackName(relativePath) {
  return path.posix.basename(relativePath, MAP_EXTENSION);
}

async function readMap(rootPath, relativePath) {
  assertMapPath(relativePath);
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  const buffer = await fs.promises.readFile(absolutePath);
  const stats = await fs.promises.stat(absolutePath);

  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  return {
    path: relativePath,
    map: normalizeMap(parsed, getFallbackName(relativePath)),
    parseError,
    contentHash: hashContent(buffer),
    mtimeMs: Math.trunc(stats.mtimeMs),
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
 * Saves a map only if the file still is what the page loaded (`expectedHash`). When someone else changed it
 * meanwhile nothing is written and the current version is returned, like a note save.
 */
async function writeMap(rootPath, relativePath, map, expectedHash) {
  assertMapPath(relativePath);
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  const currentHash = await readContentHash(absolutePath);

  if (currentHash !== null && currentHash !== expectedHash) {
    return { status: 'conflict', current: await readMap(rootPath, relativePath) };
  }

  const content = serialize(normalizeMap(map, getFallbackName(relativePath)));
  safeWriteFileAtomic(absolutePath, content);
  const stats = await fs.promises.stat(absolutePath);

  return {
    status: 'saved',
    contentHash: hashContent(Buffer.from(content, 'utf8')),
    mtimeMs: Math.trunc(stats.mtimeMs),
  };
}

/** Creates `<folder>/<slug>.json` pointing at `image`; refuses a taken name. */
async function createMap(rootPath, { folderPath, slug, name, image }) {
  const relativePath = `${folderPath.replace(/\/+$/, '')}/${slug}${MAP_EXTENSION}`;
  assertMapPath(relativePath);
  const absolutePath = resolveInsideVault(rootPath, relativePath);
  if (fs.existsSync(absolutePath)) {
    throw new Error(`A map named "${slug}${MAP_EXTENSION}" already exists in ${folderPath}.`);
  }

  safeWriteFileAtomic(absolutePath, serialize(normalizeMap({ name, image }, name)));
  return readMap(rootPath, relativePath);
}

module.exports = {
  MAP_COLORS,
  MAP_EXTENSION,
  MAP_NAME_MAX_LENGTH,
  MAPS_SECTION_KEY,
  PIN_ICONS,
  createMap,
  normalizeMap,
  readMap,
  writeMap,
};
