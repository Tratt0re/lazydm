import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isPlainFolderSegment, parseSectionFolder } = require('../models/section.model');

describe('parseSectionFolder', () => {
  it('parses a section and a sub-folder of a campaign', () => {
    expect(parseSectionFolder('camp/enemies')).toEqual({
      scope: 'camp',
      section: 'enemies',
      subfolder: null,
    });
    expect(parseSectionFolder('camp/enemies/goblins')).toEqual({
      scope: 'camp',
      section: 'enemies',
      subfolder: 'goblins',
    });
  });

  it('parses compendium folders with a two-segment scope', () => {
    expect(parseSectionFolder('compendium/dnd5e/monsters')).toEqual({
      scope: 'compendium/dnd5e',
      section: 'monsters',
      subfolder: null,
    });
  });

  it('rejects parent and hidden segments, which would resolve to the campaign itself', () => {
    expect(parseSectionFolder('camp/enemies/..')).toBeNull();
    expect(parseSectionFolder('camp/../x')).toBeNull();
    expect(parseSectionFolder('camp/enemies/.')).toBeNull();
    expect(parseSectionFolder('camp/_battle-rules')).toBeNull();
    expect(parseSectionFolder('camp/.hidden/x')).toBeNull();
  });

  it('rejects the vault root, a scope root and deeper folders', () => {
    expect(parseSectionFolder('')).toBeNull();
    expect(parseSectionFolder('camp')).toBeNull();
    expect(parseSectionFolder('camp/enemies/a/b')).toBeNull();
  });
});

describe('isPlainFolderSegment', () => {
  it('accepts ordinary names only', () => {
    expect(isPlainFolderSegment('enemies')).toBe(true);
    expect(isPlainFolderSegment('..')).toBe(false);
    expect(isPlainFolderSegment('.')).toBe(false);
    expect(isPlainFolderSegment('_x')).toBe(false);
  });
});
