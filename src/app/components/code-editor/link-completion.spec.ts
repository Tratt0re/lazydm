import { describe, expect, it } from 'vitest';

import type { LinkTargetDto } from '@/dtos';

import { suggestLinks } from './link-completion';

function target(path: string, name: string, kind: 'md' | 'asset', title = name): LinkTargetDto {
  return { path, name, kind, title, type: null } as LinkTargetDto;
}

const context = {
  sourcePath: 'camp/notes/source.md',
  targets: [
    target('camp/npcs/goblin.md', 'goblin', 'md', 'Goblin'),
    target('camp/assets/map.png', 'map.png', 'asset'),
    target('camp/npcs/café.md', 'café', 'md', 'Café'),
  ],
};

describe('suggestLinks', () => {
  it('suggests notes first for [[ and closes with ]]', () => {
    const found = suggestLinks('| a | [[gob', context);
    expect(found?.from).toBe(8);
    expect(found?.suggestions[0]).toMatchObject({ linkTarget: 'goblin', closing: ']]' });
  });

  it('suggests assets first for ![[', () => {
    expect(suggestLinks('![[', context)?.suggestions[0].linkTarget).toBe('map.png');
  });

  it('writes a path relative to the note for markdown links', () => {
    const found = suggestLinks('see [map](', context);
    expect(found?.suggestions.find((s) => s.label === 'map.png')).toMatchObject({
      linkTarget: '../assets/map.png',
      closing: ')',
    });
  });

  it('finds accented names', () => {
    expect(suggestLinks('[[caf', context)?.suggestions[0].linkTarget).toBe('café');
  });

  it('returns null outside a link or without files', () => {
    expect(suggestLinks('plain text', context)).toBeNull();
    expect(suggestLinks('[[a', { ...context, targets: [] })).toBeNull();
    expect(suggestLinks('[[done]] and more', context)).toBeNull();
  });
});
