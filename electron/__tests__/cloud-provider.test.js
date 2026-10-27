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
