const path = require('node:path');

/** `a\b/../c/` → `a/c`; throws for anything that is not a plain vault-relative path. */
function normalizeVaultPath(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('A vault-relative path is required.');
  }

  const normalized = path.posix.normalize(value.trim().replace(/\\/g, '/')).replace(/\/+$/, '');
  if (
    normalized === '' ||
    normalized === '.' ||
    normalized.startsWith('/') ||
    normalized === '..'
  ) {
    throw new Error(`Not a vault-relative path: ${value}`);
  }
  if (normalized.startsWith('../')) {
    throw new Error(`Not inside the vault: ${value}`);
  }

  return normalized;
}

/**
 * Limits what the MCP tools may reach to some campaigns and compendium systems.
 *
 * `roots` is `null` for no limit, or a list of scope folders: a campaign slug (`lost-mine`) or a compendium
 * system (`compendium/dnd-5e`). A path is allowed when it is a root or lies under one, after `..` and
 * backslashes are resolved, so `lost-mine/../other/x.md` never passes as `lost-mine`.
 */
function createScopeGuard(roots) {
  const allowed = Array.isArray(roots) ? roots.map(normalizeVaultPath) : null;
  const isInside = (relativePath) =>
    allowed.some((root) => relativePath === root || relativePath.startsWith(`${root}/`));

  return {
    isLimited: allowed !== null,
    /** The normalized path, or a thrown error when it is outside the scope. */
    resolve(value) {
      const relativePath = normalizeVaultPath(value);
      if (allowed !== null && !isInside(relativePath)) {
        throw new Error(`Outside the scope the user allowed for MCP: ${relativePath}`);
      }

      return relativePath;
    },
    /** Like `resolve`, but a yes/no for results to filter (links pointing out of the scope are dropped). */
    allows(value) {
      try {
        this.resolve(value);
        return true;
      } catch {
        return false;
      }
    },
    allowsCampaign: (slug) => allowed === null || isInside(slug),
    allowsSystem: (slug) => allowed === null || isInside(`compendium/${slug}`),
  };
}

module.exports = {
  createScopeGuard,
  normalizeVaultPath,
};
