const fs = require('node:fs');
const { normalizeMap } = require('../models/map.model');
const { parseSectionFolder } = require('../models/section.model');
const { resolveInsideVault } = require('../utils/file-utils');

const MAPS_SECTION = 'maps';

function isInScope(root, relativePath) {
  return relativePath === root || relativePath.startsWith(`${root}/`);
}

/** A vault path an item of the map points at: inside the allowed scope and inside the map's own campaign. */
function requireOwnScopePath(scope, root, value, what) {
  const resolved = scope.resolve(value);
  if (!isInScope(root, resolved)) {
    throw new Error(
      `The ${what} ${resolved} is not in ${root}: a map only uses files of its own campaign.`,
    );
  }

  return resolved;
}

/** The image must be a real image file of the map's scope: a map never copies or moves it. */
async function requireImage(c, scope, root, value) {
  const image = requireOwnScopePath(scope, root, value, 'image');
  if (!normalizeMap({ image }, 'map').image) {
    throw new Error(`${image} is not an image (png, jpg, gif, webp, svg or avif).`);
  }

  try {
    await fs.promises.stat(resolveInsideVault(c.vaultPath(), image));
  } catch {
    throw new Error(`The image ${image} does not exist. Add it with add_asset first.`);
  }

  return image;
}

/**
 * Creates an interactive map on an image that is already in the campaign's assets, with optional pins, paths and
 * text notes. Coordinates are fractions of the image (0..1 from the top-left). Everything is checked before the
 * file is created, and each pin link must point at a file of the same campaign.
 */
async function createMap(c, scope, input) {
  const folder = scope.resolve(input.folder);
  const location = parseSectionFolder(folder);
  if (!location || location.section !== MAPS_SECTION) {
    throw new Error(`${folder} is not a Maps folder (for example "my-campaign/maps").`);
  }

  const root = location.scope;
  const image = await requireImage(c, scope, root, input.image);
  const pins = (input.pins ?? []).map((pin) => ({
    ...pin,
    link: pin.link ? requireOwnScopePath(scope, root, pin.link, 'pin link') : null,
  }));
  const paths = input.paths ?? [];
  const notes = input.notes ?? [];

  const created = await c.map.create({ folder, name: input.name, image });
  if (pins.length > 0 || paths.length > 0 || notes.length > 0) {
    let saved;
    try {
      saved = await c.map.write({
        path: created.path,
        map: { ...created.map, pins, paths, notes },
        expectedHash: created.contentHash,
      });
    } catch (error) {
      throw new Error(
        `Created ${created.path} but could not fill it: ${error instanceof Error ? error.message : error}`,
      );
    }
    if (saved.status !== 'saved') {
      throw new Error(
        `Created ${created.path} but it changed before it could be filled. Read it again.`,
      );
    }
  }

  return {
    path: created.path,
    linkTarget: created.path.slice(created.path.lastIndexOf('/') + 1),
    name: input.name,
    image,
    pins: pins.length,
    paths: paths.length,
    notes: notes.length,
  };
}

module.exports = {
  createMap,
};
