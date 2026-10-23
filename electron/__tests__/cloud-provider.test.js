import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { detectCloudProvider } = require('../models/cloud-readiness.model');

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
