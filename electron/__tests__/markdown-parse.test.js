import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  getLinkPlainText,
  parseMarkdownDocument,
  removeFrontmatterField,
  replaceDocumentTitle,
  rewriteLinks,
  setFrontmatterField,
} = require('../utils/markdown-parse');

const NOTE = [
  '---',
  'title: Goblin',
  'tags: [a, b]',
  '---',
  '# Goblin',
  'See [[Orc]] and [[Orc|the orc]] and ![[map.png]] and [x](../npcs/bob.md)',
  '',
].join('\n');

describe('parseMarkdownDocument', () => {
  const doc = parseMarkdownDocument(NOTE, { sourcePath: 'camp/monsters/goblin.md' });

  it('reads frontmatter, title and tags', () => {
    expect(doc.title).toBe('Goblin');
    expect(doc.frontmatter).toMatchObject({ title: 'Goblin', tags: ['a', 'b'] });
    expect(doc.frontmatterError).toBeFalsy();
  });

  it('finds wikilinks, embeds and relative markdown links', () => {
    const byRaw = Object.fromEntries(doc.links.map((link) => [link.raw, link]));
    expect(byRaw['Orc'].kind).toBe('wikilink');
    expect(byRaw['Orc|the orc'].label).toBe('the orc');
    expect(byRaw['map.png'].kind).toBe('embed');
    expect(byRaw['../npcs/bob.md'].targetPath).toBe('camp/npcs/bob.md');
  });

  it('reports invalid frontmatter instead of throwing', () => {
    const broken = parseMarkdownDocument('---\ntitle: [unclosed\n---\nbody', { sourcePath: 'a/b.md' });
    expect(broken.frontmatterError).toBeTruthy();
  });

  it('ignores links inside code', () => {
    const code = parseMarkdownDocument('`[[Hidden]]`\n\n```\n[[Fenced]]\n```\n[[Shown]]', {
      sourcePath: 'a/b.md',
    });
    expect(code.links.map((link) => link.raw)).toEqual(['Shown']);
  });
});

describe('rewriteLinks', () => {
  it('replaces matching links by their plain text and counts them', () => {
    const result = rewriteLinks(
      NOTE,
      (link) => (link.targetName === 'Orc' ? { text: getLinkPlainText(link) } : null),
      { sourcePath: 'camp/monsters/goblin.md' },
    );
    expect(result.count).toBe(2);
    expect(result.content).toContain('See Orc and the orc and');
    expect(result.content).toContain('![[map.png]]');
  });

  it('leaves the note untouched when nothing matches', () => {
    const result = rewriteLinks(NOTE, () => null, { sourcePath: 'camp/monsters/goblin.md' });
    expect(result.count).toBe(0);
    expect(result.content).toBe(NOTE);
  });

  it('keeps CRLF line endings', () => {
    const crlf = NOTE.replace(/\n/g, '\r\n');
    const result = rewriteLinks(crlf, (link) => (link.raw === 'Orc' ? { text: 'x' } : null), {
      sourcePath: 'a/b.md',
    });
    expect(result.content).toContain('\r\n');
    expect(result.content.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('frontmatter helpers', () => {
  it('sets a new field and replaces an existing one', () => {
    const added = setFrontmatterField(NOTE, 'subtype', 'goblins');
    expect(added).toContain('subtype: goblins');
    expect(setFrontmatterField(added, 'subtype', 'orcs')).not.toContain('goblins');
    expect(removeFrontmatterField(added, 'subtype')).not.toContain('subtype');
  });

  it('creates frontmatter when the note has none', () => {
    expect(setFrontmatterField('# Plain\n', 'type', 'npc')).toMatch(/^---\ntype: npc\n---\n/);
  });

  it('renames the title and the matching heading', () => {
    const renamed = replaceDocumentTitle(NOTE, 'Goblin', 'Hobgoblin');
    expect(renamed).toContain('title: Hobgoblin');
    expect(renamed).toContain('# Hobgoblin');
  });
});
