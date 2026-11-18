import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ZIP_PATH_ERRORS, ZipPathError, safeEntryPath } = require('../utils/zip-paths');
const { ZIP_LIMITS } = require('../utils/zip-limits');
const { byName, comparable, isInside, takeFreeName } = require('../utils/path-utils');

function codeOf(name) {
  try {
    safeEntryPath(name);
  } catch (error) {
    expect(error).toBeInstanceOf(ZipPathError);
    return error.code;
  }
  return null;
}

describe('safeEntryPath: accepted names', () => {
  it('returns the path in `/` form', () => {
    expect(safeEntryPath('lost-mine/scenes/intro.md')).toBe('lost-mine/scenes/intro.md');
    expect(safeEntryPath('lost-mine/assets/map one.png')).toBe('lost-mine/assets/map one.png');
    expect(safeEntryPath('lost-mine/_templates/enemy.md')).toBe('lost-mine/_templates/enemy.md');
  });

  it('drops the trailing slash of a folder entry', () => {
    expect(safeEntryPath('lost-mine/scenes/')).toBe('lost-mine/scenes');
  });

  it('keeps non-ASCII names', () => {
    expect(safeEntryPath('lost-mine/world/città-é.md')).toBe('lost-mine/world/città-é.md');
  });
});

describe('safeEntryPath: zip-slip and absolute paths', () => {
  it.each([
    ['../evil.md', ZIP_PATH_ERRORS.traversal],
    ['lost-mine/../../evil.md', ZIP_PATH_ERRORS.traversal],
    ['lost-mine/scenes/../../../evil.md', ZIP_PATH_ERRORS.traversal],
    ['./lost-mine/a.md', ZIP_PATH_ERRORS.traversal],
    ['lost-mine/./a.md', ZIP_PATH_ERRORS.traversal],
    ['lost-mine//a.md', ZIP_PATH_ERRORS.traversal],
    ['..', ZIP_PATH_ERRORS.traversal],
    ['/etc/passwd', ZIP_PATH_ERRORS.absolute],
    ['//server/share/a.md', ZIP_PATH_ERRORS.absolute],
    ['C:/Windows/a.md', ZIP_PATH_ERRORS.drive],
    ['c:evil.md', ZIP_PATH_ERRORS.drive],
  ])('refuses %j (%s)', (name, code) => {
    expect(codeOf(name)).toBe(code);
  });

  it('refuses backslashes, so a Windows-style traversal never gets through', () => {
    expect(codeOf('lost-mine\\..\\..\\evil.md')).toBe(ZIP_PATH_ERRORS.backslash);
    expect(codeOf('..\\evil.md')).toBe(ZIP_PATH_ERRORS.backslash);
    expect(codeOf('\\\\server\\share\\a.md')).toBe(ZIP_PATH_ERRORS.backslash);
  });
});

describe('safeEntryPath: other hostile names', () => {
  it('refuses NUL and control characters', () => {
    expect(codeOf('lost-mine/a.md\u0000.png')).toBe(ZIP_PATH_ERRORS.nul);
    expect(codeOf('lost-mine/a\u0007.md')).toBe(ZIP_PATH_ERRORS.control);
    expect(codeOf('lost-mine/a\n.md')).toBe(ZIP_PATH_ERRORS.control);
  });

  it('refuses hidden files and folders', () => {
    expect(codeOf('lost-mine/.git/config')).toBe(ZIP_PATH_ERRORS.hidden);
    expect(codeOf('lost-mine/.DS_Store')).toBe(ZIP_PATH_ERRORS.hidden);
    expect(codeOf('lost-mine/scenes/.hidden.md')).toBe(ZIP_PATH_ERRORS.hidden);
  });

  it('refuses names Windows cannot create, on every platform', () => {
    expect(codeOf('lost-mine/con.md')).toBe(ZIP_PATH_ERRORS.reserved);
    expect(codeOf('lost-mine/NUL')).toBe(ZIP_PATH_ERRORS.reserved);
    expect(codeOf('lost-mine/com1.png')).toBe(ZIP_PATH_ERRORS.reserved);
    expect(codeOf('lost-mine/lpt9.md')).toBe(ZIP_PATH_ERRORS.reserved);
    expect(codeOf('lost-mine/note.')).toBe(ZIP_PATH_ERRORS.reserved);
    expect(codeOf('lost-mine/note ')).toBe(ZIP_PATH_ERRORS.reserved);
    expect(codeOf('lost-mine/a?b.md')).toBe(ZIP_PATH_ERRORS.reserved);
    expect(codeOf('lost-mine/a:b.md')).toBe(ZIP_PATH_ERRORS.reserved);
  });

  it('does not refuse a name that only starts like a reserved one', () => {
    expect(safeEntryPath('lost-mine/console.md')).toBe('lost-mine/console.md');
    expect(safeEntryPath('lost-mine/com10.md')).toBe('lost-mine/com10.md');
  });

  it('refuses empty and non-string names', () => {
    expect(codeOf('')).toBe(ZIP_PATH_ERRORS.empty);
    expect(codeOf(undefined)).toBe(ZIP_PATH_ERRORS.empty);
    expect(codeOf(null)).toBe(ZIP_PATH_ERRORS.empty);
    expect(codeOf(42)).toBe(ZIP_PATH_ERRORS.empty);
  });

  it('refuses paths over the length and depth limits', () => {
    expect(codeOf(`lost-mine/${'a'.repeat(ZIP_LIMITS.maxPathLength)}.md`)).toBe(
      ZIP_PATH_ERRORS.tooLong,
    );
    const deep = Array.from({ length: ZIP_LIMITS.maxDepth + 1 }, () => 'a').join('/');
    expect(codeOf(deep)).toBe(ZIP_PATH_ERRORS.tooDeep);
    const atLimit = Array.from({ length: ZIP_LIMITS.maxDepth }, () => 'a').join('/');
    expect(safeEntryPath(atLimit)).toBe(atLimit);
  });

  it('carries the offending name for the report', () => {
    try {
      safeEntryPath('../x.md');
    } catch (error) {
      expect(error.entryName).toBe('../x.md');
    }
  });
});

describe('ZIP_LIMITS', () => {
  it('is frozen and every cap is a positive number', () => {
    expect(Object.isFrozen(ZIP_LIMITS)).toBe(true);
    for (const value of Object.values(ZIP_LIMITS)) {
      expect(Number.isFinite(value) && value > 0).toBe(true);
    }
  });

  it('keeps one note smaller than one media file smaller than the archive', () => {
    expect(ZIP_LIMITS.maxTextBytes).toBeLessThan(ZIP_LIMITS.maxMediaBytes);
    expect(ZIP_LIMITS.maxMediaBytes).toBeLessThan(ZIP_LIMITS.maxTotalBytes);
  });
});

describe('path-utils (moved out of the MCP importer)', () => {
  it('byName sorts by code point, not by locale', () => {
    expect(['b', 'A', 'a', 'B'].sort(byName)).toEqual(['A', 'B', 'a', 'b']);
  });

  it('comparable ignores case except on Linux', () => {
    expect(comparable('Vault')).toBe(process.platform === 'linux' ? 'Vault' : 'vault');
  });

  it('isInside is true for the folder itself and for what lies in it, false for siblings and parents', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b/c/d')).toBe(true);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a')).toBe(false);
    expect(isInside('/a/b', '/x')).toBe(false);
  });

  it('takeFreeName counts up and records every name it hands out', () => {
    const taken = new Set(['bandit.md']);
    expect(takeFreeName(taken, 'bandit', '.md')).toBe('bandit-2');
    expect(takeFreeName(taken, 'bandit', '.md')).toBe('bandit-3');
    expect(takeFreeName(taken, 'orc', '.md')).toBe('orc');
    expect(taken.has('orc.md')).toBe(true);
  });

  it('takeFreeName matches names without case', () => {
    const taken = new Set(['bandit.md']);
    expect(takeFreeName(taken, 'Bandit', '.MD')).toBe('Bandit-2');
  });
});
