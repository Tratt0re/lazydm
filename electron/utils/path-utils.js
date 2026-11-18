const path = require('node:path');

/** Paths compare without case on macOS and Windows, where `Vault` and `vault` are the same folder. */
function comparable(value) {
  return process.platform === 'linux' ? value : value.toLowerCase();
}

/** Code-point order, so a listing reads the same on every computer (`localeCompare` follows the locale). */
function byName(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** True when `child` is `parent` or lies inside it (compared like `comparable`). */
function isInside(parent, child) {
  const relative = path.relative(comparable(parent), comparable(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** `name`, `name-2`, `name-3`… until it is free in `taken`, which is updated. */
function takeFreeName(taken, base, extension) {
  let candidate = base;
  let counter = 2;
  while (taken.has(`${candidate}${extension}`.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  taken.add(`${candidate}${extension}`.toLowerCase());
  return candidate;
}

module.exports = {
  byName,
  comparable,
  isInside,
  takeFreeName,
};
