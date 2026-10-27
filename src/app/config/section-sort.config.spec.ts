import { describe, expect, it } from 'vitest';

import type { DocumentFileListItemDto } from '@/dtos';

import { sortSectionFiles, sortSectionFolders } from './section-sort.config';

function file(
  name: string,
  extra: Partial<DocumentFileListItemDto> = {},
): DocumentFileListItemDto {
  return {
    path: `camp/notes/${name}`,
    name: name.replace(/\.[^.]+$/, ''),
    kind: 'md',
    type: null,
    title: name.replace(/\.[^.]+$/, ''),
    size: 100,
    mtimeMs: 1000,
    tags: [],
    ...extra,
  };
}

const names = (files: readonly DocumentFileListItemDto[]) => files.map((item) => item.title);

describe('sortSectionFiles', () => {
  const files = [
    file('goblin.md', { size: 50, mtimeMs: 3000 }),
    file('Orc 10.md', { size: 900, mtimeMs: 1000 }),
    file('Orc 2.md', { size: 300, mtimeMs: 2000 }),
    file('map.png', { kind: 'asset', size: 5000, mtimeMs: 500 }),
  ];

  it('sorts by name, case-insensitive and with numbers in order', () => {
    expect(names(sortSectionFiles(files, 'name-asc'))).toEqual([
      'goblin',
      'map',
      'Orc 2',
      'Orc 10',
    ]);
    expect(names(sortSectionFiles(files, 'name-desc'))).toEqual([
      'Orc 10',
      'Orc 2',
      'map',
      'goblin',
    ]);
  });

  it('puts the most recently modified first', () => {
    expect(names(sortSectionFiles(files, 'modified'))).toEqual(['goblin', 'Orc 2', 'Orc 10', 'map']);
  });

  it('puts the largest first', () => {
    expect(names(sortSectionFiles(files, 'size'))).toEqual(['map', 'Orc 10', 'Orc 2', 'goblin']);
  });

  it('groups by extension, then by name', () => {
    expect(names(sortSectionFiles(files, 'type'))).toEqual(['goblin', 'Orc 2', 'Orc 10', 'map']);
  });

  it('never changes the list it is given', () => {
    const copy = [...files];
    sortSectionFiles(files, 'size');
    expect(files).toEqual(copy);
  });
});

describe('sortSectionFolders', () => {
  const folders = [{ name: 'orcs' }, { name: 'Goblins' }, { name: 'dragons' }];

  it('follows the name order and reverses it for Z → A', () => {
    expect(sortSectionFolders(folders, 'name-asc').map((item) => item.name)).toEqual([
      'dragons',
      'Goblins',
      'orcs',
    ]);
    expect(sortSectionFolders(folders, 'name-desc').map((item) => item.name)).toEqual([
      'orcs',
      'Goblins',
      'dragons',
    ]);
    expect(sortSectionFolders(folders, 'size').map((item) => item.name)).toEqual([
      'dragons',
      'Goblins',
      'orcs',
    ]);
  });
});
