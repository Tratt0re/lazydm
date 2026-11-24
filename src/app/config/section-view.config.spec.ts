import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SECTION_VIEW,
  isSectionView,
  resolveSectionView,
  SECTION_VIEWS,
  viewsForSection,
} from './section-view.config';

describe('isSectionView', () => {
  it('accepts the three views and nothing else', () => {
    for (const view of SECTION_VIEWS) {
      expect(isSectionView(view)).toBe(true);
    }
    expect(isSectionView('grid')).toBe(false);
    expect(isSectionView(null)).toBe(false);
    expect(isSectionView(undefined)).toBe(false);
    expect(isSectionView(3)).toBe(false);
  });
});

describe('viewsForSection', () => {
  it('offers the graph where there are notes', () => {
    expect(viewsForSection(true)).toEqual(['list', 'cards', 'graph']);
  });

  it('leaves the graph out where there are only other files', () => {
    expect(viewsForSection(false)).toEqual(['list', 'cards']);
  });
});

describe('resolveSectionView', () => {
  it('keeps the remembered view when the section offers it', () => {
    expect(resolveSectionView('cards', viewsForSection(false))).toBe('cards');
    expect(resolveSectionView('graph', viewsForSection(true))).toBe('graph');
  });

  it('falls back to the list when it does not', () => {
    expect(resolveSectionView('graph', viewsForSection(false))).toBe(DEFAULT_SECTION_VIEW);
  });
});
