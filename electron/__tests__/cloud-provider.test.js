import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { detectCloudProvider } = require('../models/cloud-readiness.model');
const { isDatalessStats } = require('../models/vault.model');

describe('detectCloudProvider', () => {
  it('finds iCloud Drive from the Mobile Documents path', () => {
    expect(
      detectCloudProvider('/Users/dm/Library/Mobile Documents/com~apple~CloudDocs/Campaigns'),
    ).toBe('icloud');
  });

  it('finds the provider from a macOS CloudStorage root', () => {
    expect(detectCloudProvider('/Users/dm/Library/CloudStorage/Dropbox/LazyDM')).toBe('dropbox');
    expect(detectCloudProvider('/Users/dm/Library/CloudStorage/OneDrive-Personal/LazyDM')).toBe(
      'onedrive',
    );
    expect(detectCloudProvider('/Users/dm/Library/CloudStorage/GoogleDrive-dm@mail.com/My Drive')).toBe(
      'google-drive',
    );
  });

  it('finds the provider from a folder name on any system', () => {
    expect(detectCloudProvider('/home/dm/Dropbox/LazyDM')).toBe('dropbox');
  });

  it('returns null for a folder that is only on this device', () => {
    expect(detectCloudProvider('/Users/dm/Documents/LazyDM')).toBeNull();
  });
});

describe('isDatalessStats', () => {
  it('flags a note with a size but no disk block on macOS and Linux', () => {
    expect(isDatalessStats({ size: 120, blocks: 0 }, 'darwin')).toBe(true);
    expect(isDatalessStats({ size: 120, blocks: 8 }, 'darwin')).toBe(false);
    expect(isDatalessStats({ size: 0, blocks: 0 }, 'darwin')).toBe(false);
  });

  it('never flags a note on Windows, where small local files report no blocks', () => {
    expect(isDatalessStats({ size: 120, blocks: 0 }, 'win32')).toBe(false);
  });
});

describe('findSyncCopies', () => {
  const { findSyncCopies } = require('../models/cloud-readiness.model');
  const files = (...paths) => paths.map((p) => ({ path: p }));

  it('pairs a numbered copy with the original next to it', () => {
    expect(findSyncCopies(files('c/enemies/goblin.md', 'c/enemies/goblin 2.md'))).toEqual([
      { path: 'c/enemies/goblin 2.md', originalPath: 'c/enemies/goblin.md', kind: 'pair' },
    ]);
  });

  it('finds the iCloud, Google Drive and Dropbox forms', () => {
    const found = findSyncCopies(
      files('a.md', 'a (1).md', 'b.md', 'b (conflicted copy 2026-10-11).md', 'c.md', 'c 3.md'),
    ).map((copy) => copy.path);
    expect(found).toEqual(['a (1).md', 'b (conflicted copy 2026-10-11).md', 'c 3.md']);
  });

  it('leaves a lone numbered note alone when nothing links to the missing name', () => {
    expect(findSyncCopies(files('c/scenes/session 2.md'))).toEqual([]);
  });

  it('calls a lone numbered note an orphan when a broken link names it without the number', () => {
    expect(
      findSyncCopies(files('c/enemies/goblin 2.md'), [{ targetName: 'Goblin', raw: 'goblin' }]),
    ).toEqual([
      { path: 'c/enemies/goblin 2.md', originalPath: 'c/enemies/goblin.md', kind: 'orphan' },
    ]);
  });

  it('needs the folder of a broken link that has one', () => {
    const broken = [{ targetName: 'goblin', raw: '../scenes/goblin.md' }];
    expect(findSyncCopies(files('c/enemies/goblin 2.md'), broken)).toEqual([]);
    expect(findSyncCopies(files('c/scenes/goblin 2.md'), broken)).toHaveLength(1);
  });

  it('does not make an orphan of an asset', () => {
    expect(
      findSyncCopies(files('c/assets/map 2.png'), [{ targetName: 'map', raw: 'map' }]),
    ).toEqual([]);
  });
});
