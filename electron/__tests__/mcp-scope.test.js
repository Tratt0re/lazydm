import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createScopeGuard, normalizeVaultPath } = require('../mcp/scope');

describe('normalizeVaultPath', () => {
  it('cleans a path and refuses anything that leaves the vault', () => {
    expect(normalizeVaultPath('lost-mine\\enemies/')).toBe('lost-mine/enemies');
    expect(normalizeVaultPath('a/./b/../c.md')).toBe('a/c.md');
    expect(() => normalizeVaultPath('')).toThrow();
    expect(() => normalizeVaultPath('/etc/passwd')).toThrow();
    expect(() => normalizeVaultPath('../outside.md')).toThrow();
    expect(() => normalizeVaultPath('a/../../outside.md')).toThrow();
    expect(() => normalizeVaultPath(null)).toThrow();
  });
});

describe('createScopeGuard', () => {
  it('lets everything through without a limit', () => {
    const guard = createScopeGuard(null);

    expect(guard.isLimited).toBe(false);
    expect(guard.resolve('any/where.md')).toBe('any/where.md');
    expect(guard.allowsCampaign('other')).toBe(true);
    expect(guard.allowsSystem('dnd-5e')).toBe(true);
  });

  it('allows a campaign and everything under it', () => {
    const guard = createScopeGuard(['lost-mine']);

    expect(guard.resolve('lost-mine')).toBe('lost-mine');
    expect(guard.resolve('lost-mine/enemies/goblin.md')).toBe('lost-mine/enemies/goblin.md');
    expect(() => guard.resolve('other/enemies/goblin.md')).toThrow(/Outside the scope/);
    expect(() => guard.resolve('compendium/dnd-5e/x.md')).toThrow(/Outside the scope/);
  });

  it('does not match a campaign by name prefix', () => {
    const guard = createScopeGuard(['lost-mine']);

    expect(() => guard.resolve('lost-mine-2/notes/x.md')).toThrow(/Outside the scope/);
    expect(guard.allowsCampaign('lost-mine-2')).toBe(false);
  });

  it('cannot be escaped with .. or backslashes', () => {
    const guard = createScopeGuard(['lost-mine']);

    expect(() => guard.resolve('lost-mine/../other/x.md')).toThrow(/Outside the scope/);
    expect(() => guard.resolve('lost-mine\\..\\other\\x.md')).toThrow(/Outside the scope/);
    expect(() => guard.resolve('../lost-mine/x.md')).toThrow();
  });

  it('scopes compendium systems separately from campaigns', () => {
    const guard = createScopeGuard(['compendium/dnd-5e']);

    expect(guard.resolve('compendium/dnd-5e/spells/fireball.md')).toBe(
      'compendium/dnd-5e/spells/fireball.md',
    );
    expect(() => guard.resolve('compendium/pathfinder/x.md')).toThrow(/Outside the scope/);
    expect(() => guard.resolve('compendium')).toThrow(/Outside the scope/);
    expect(guard.allowsSystem('dnd-5e')).toBe(true);
    expect(guard.allowsSystem('pathfinder')).toBe(false);
    expect(guard.allowsCampaign('dnd-5e')).toBe(false);
  });

  it('allows nothing when the list is empty', () => {
    const guard = createScopeGuard([]);

    expect(guard.isLimited).toBe(true);
    expect(() => guard.resolve('lost-mine/x.md')).toThrow(/Outside the scope/);
    expect(guard.allowsCampaign('lost-mine')).toBe(false);
  });
});
