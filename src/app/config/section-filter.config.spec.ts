import { describe, expect, it } from 'vitest';

import type { DocumentFileListItemDto } from '@/dtos';

import {
  collectTagOptions,
  countMenuFilters,
  EMPTY_SECTION_FILTER,
  filterSectionFiles,
  folderOfFile,
  isFilterActive,
  matchesSectionFilter,
  splitTags,
} from './section-filter.config';

function file(
  path: string,
  title: string,
  tags: string[] = [],
  extra: Partial<DocumentFileListItemDto> = {},
): DocumentFileListItemDto {
  return {
    path,
    name: path.split('/').pop()!.replace(/\.[^.]+$/, ''),
    kind: 'md',
    type: null,
    title,
    size: 100,
    mtimeMs: 1000,
    tags,
    ...extra,
  };
}

const SECTION = 'camp/enemies';
const folderOf = (item: DocumentFileListItemDto) => folderOfFile(item, SECTION);

const files = [
  file('camp/enemies/captain-vell.md', 'Captain Vell', ['boss', 'fire', 'act-2']),
  file('camp/enemies/cultist.md', 'Ashen Cultist', ['cult', 'fire']),
  file('camp/enemies/undead/crownless-king.md', 'Crownless King', ['boss', 'undead']),
  file('camp/enemies/beasts/wolf.md', 'Cinder Wolf', ['fire', 'beast']),
  file('camp/enemies/beasts/señor-lobo.md', 'Señor Lobo', []),
];

const titles = (list: readonly DocumentFileListItemDto[]) => list.map((item) => item.title);

describe('folderOfFile', () => {
  it('returns the sub-folder, or an empty string for the section itself', () => {
    expect(folderOfFile(files[0], SECTION)).toBe('');
    expect(folderOfFile(files[2], SECTION)).toBe('undead');
    expect(folderOfFile(files[2], `${SECTION}/`)).toBe('undead');
  });
});

describe('isFilterActive / countMenuFilters', () => {
  it('is inactive for the empty filter and for blank text', () => {
    expect(isFilterActive(EMPTY_SECTION_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_SECTION_FILTER, query: '   ' })).toBe(false);
  });

  it('is active with text, a tag or a folder, and counts only the menu choices', () => {
    expect(isFilterActive({ ...EMPTY_SECTION_FILTER, query: 'a' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_SECTION_FILTER, tags: ['boss'] })).toBe(true);
    expect(isFilterActive({ ...EMPTY_SECTION_FILTER, folders: [''] })).toBe(true);
    expect(countMenuFilters({ query: 'x', tags: ['a', 'b'], folders: [''] })).toBe(3);
  });
});

describe('filterSectionFiles', () => {
  it('keeps everything with the empty filter', () => {
    expect(filterSectionFiles(files, EMPTY_SECTION_FILTER, folderOf)).toHaveLength(5);
  });

  it('matches the title, ignoring case', () => {
    const result = filterSectionFiles(files, { ...EMPTY_SECTION_FILTER, query: 'WOLF' }, folderOf);
    expect(titles(result)).toEqual(['Cinder Wolf']);
  });

  it('matches the tags and the file name', () => {
    expect(
      titles(filterSectionFiles(files, { ...EMPTY_SECTION_FILTER, query: 'undead' }, folderOf)),
    ).toEqual(['Crownless King']);
    expect(
      titles(
        filterSectionFiles(files, { ...EMPTY_SECTION_FILTER, query: 'captain-vell' }, folderOf),
      ),
    ).toEqual(['Captain Vell']);
  });

  it('ignores accents on both sides', () => {
    expect(
      titles(filterSectionFiles(files, { ...EMPTY_SECTION_FILTER, query: 'senor' }, folderOf)),
    ).toEqual(['Señor Lobo']);
    expect(
      titles(filterSectionFiles(files, { ...EMPTY_SECTION_FILTER, query: 'señor' }, folderOf)),
    ).toEqual(['Señor Lobo']);
  });

  it('needs every word typed, in any order', () => {
    const result = filterSectionFiles(
      files,
      { ...EMPTY_SECTION_FILTER, query: 'fire wolf' },
      folderOf,
    );
    expect(titles(result)).toEqual(['Cinder Wolf']);
  });

  it('needs every chosen tag', () => {
    const one = filterSectionFiles(files, { ...EMPTY_SECTION_FILTER, tags: ['fire'] }, folderOf);
    expect(titles(one)).toEqual(['Captain Vell', 'Ashen Cultist', 'Cinder Wolf']);
    const two = filterSectionFiles(
      files,
      { ...EMPTY_SECTION_FILTER, tags: ['fire', 'boss'] },
      folderOf,
    );
    expect(titles(two)).toEqual(['Captain Vell']);
  });

  it('keeps only the chosen folders, where the empty name is the main folder', () => {
    const main = filterSectionFiles(files, { ...EMPTY_SECTION_FILTER, folders: [''] }, folderOf);
    expect(titles(main)).toEqual(['Captain Vell', 'Ashen Cultist']);
    const both = filterSectionFiles(
      files,
      { ...EMPTY_SECTION_FILTER, folders: ['undead', 'beasts'] },
      folderOf,
    );
    expect(titles(both)).toEqual(['Crownless King', 'Cinder Wolf', 'Señor Lobo']);
  });

  it('combines text, tags and folders', () => {
    const filter = { query: 'cinder', tags: ['fire'], folders: ['beasts'] };
    expect(titles(filterSectionFiles(files, filter, folderOf))).toEqual(['Cinder Wolf']);
    expect(filterSectionFiles(files, { ...filter, folders: ['undead'] }, folderOf)).toEqual([]);
  });

  it('never changes the list it was given', () => {
    const copy = [...files];
    filterSectionFiles(files, { ...EMPTY_SECTION_FILTER, query: 'wolf' }, folderOf);
    expect(files).toEqual(copy);
  });

  it('matches files without tags (assets) by name', () => {
    const asset = file('camp/assets/map.png', 'map', [], { kind: 'asset', name: 'map.png' });
    expect(matchesSectionFilter(asset, { ...EMPTY_SECTION_FILTER, query: 'png' }, '')).toBe(true);
    expect(matchesSectionFilter(asset, { ...EMPTY_SECTION_FILTER, tags: ['boss'] }, '')).toBe(
      false,
    );
  });
});

describe('collectTagOptions', () => {
  it('counts files per tag, most used first, then A → Z', () => {
    expect(collectTagOptions(files)).toEqual([
      { tag: 'fire', count: 3 },
      { tag: 'boss', count: 2 },
      { tag: 'act-2', count: 1 },
      { tag: 'beast', count: 1 },
      { tag: 'cult', count: 1 },
      { tag: 'undead', count: 1 },
    ]);
  });

  it('puts the chosen tags first', () => {
    expect(
      collectTagOptions(files, ['undead'])
        .map((item) => item.tag)
        .slice(0, 2),
    ).toEqual(['undead', 'fire']);
  });

  it('counts a tag written twice in one file once', () => {
    const doubled = [file('camp/enemies/a.md', 'A', ['x', 'x'])];
    expect(collectTagOptions(doubled)).toEqual([{ tag: 'x', count: 1 }]);
  });
});

describe('splitTags', () => {
  const tags = ['boss', 'human', 'act-2', 'ember-crown', 'ranged', 'fire'];

  it('shows the first three in written order and hides the rest', () => {
    expect(splitTags(tags)).toEqual({
      visible: ['boss', 'human', 'act-2'],
      hidden: ['ember-crown', 'ranged', 'fire'],
    });
  });

  it('hides nothing when the tags fit', () => {
    expect(splitTags(['a', 'b']).hidden).toEqual([]);
    expect(splitTags([])).toEqual({ visible: [], hidden: [] });
  });

  it('brings the tags of the active filter to the front', () => {
    expect(splitTags(tags, ['fire']).visible).toEqual(['fire', 'boss', 'human']);
  });

  it('then the tags that match the typed text, accents ignored', () => {
    expect(splitTags(tags, [], 'EMBER').visible).toEqual(['ember-crown', 'boss', 'human']);
    expect(splitTags(['café', 'x', 'y', 'z'], [], 'cafe').visible[0]).toBe('café');
  });

  it('puts active tags before text matches', () => {
    expect(splitTags(tags, ['ranged'], 'ember').visible).toEqual([
      'ranged',
      'ember-crown',
      'boss',
    ]);
  });

  it('respects a custom maximum', () => {
    expect(splitTags(tags, [], '', 99).hidden).toEqual([]);
  });
});
