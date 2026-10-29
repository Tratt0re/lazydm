import { describe, expect, it } from 'vitest';

import type { LinkTargetDto } from '@/dtos';

import { resolveDocumentLinks } from './resolve-links';

function target(path: string, name: string): LinkTargetDto {
  return { path, name, title: name, kind: path.endsWith('.md') ? 'md' : 'asset' } as LinkTargetDto;
}

function resolve(content: string, targets: LinkTargetDto[]): (string | null)[] {
  return resolveDocumentLinks(content, 'camp/notes/source.md', targets, []).map(
    (link) => link.resolvedPath,
  );
}

describe('resolveDocumentLinks with accents', () => {
  const decomposed = 'café-ñandú'.normalize('NFD');
  const targets = [
    target(`camp/notes/${decomposed}.md`, decomposed),
    target(`camp/assets/${'épée (1).png'.normalize('NFD')}`, 'épée (1).png'.normalize('NFD')),
  ];

  it('finds a file stored decomposed from a composed link', () => {
    expect(resolve('[[café-ñandú]]', targets)).toEqual([targets[0].path]);
  });

  it('ignores case on accented letters', () => {
    expect(resolve('[[CAFÉ-ÑANDÚ]]', targets)).toEqual([targets[0].path]);
  });

  it('finds an asset with accents and parentheses, embedded or as a markdown link', () => {
    expect(resolve('![[épée (1).png]]', targets)).toEqual([targets[1].path]);
    expect(resolve('![](../assets/%C3%A9p%C3%A9e%20%281%29.png)', targets)).toEqual([targets[1].path]);
  });
});
