import { describe, expect, it } from 'vitest';

import { NOTE_EXCERPT_MAX_LENGTH, noteExcerpt } from './note-excerpt';

describe('noteExcerpt', () => {
  it('takes the first line of prose', () => {
    expect(noteExcerpt('Small humanoid. Nimble Escape.\n\nMore text.')).toBe(
      'Small humanoid. Nimble Escape.',
    );
  });

  it('skips the frontmatter, the headings and the blank lines', () => {
    expect(noteExcerpt('---\ntitle: Goblin\nac: 15\n---\n# Goblin\n\n## Stats\n\nSmall and sneaky.')).toBe(
      'Small and sneaky.',
    );
  });

  it('treats an unclosed opening rule as a rule, not as frontmatter', () => {
    expect(noteExcerpt('---\nSmall and sneaky.')).toBe('Small and sneaky.');
  });

  it('skips code fences and thematic breaks', () => {
    expect(noteExcerpt('```\nroll 1d20\n```\n---\nAfter the code.')).toBe('After the code.');
  });

  it('drops the markup of links, embeds and emphasis', () => {
    expect(noteExcerpt('A **fierce** [[Goblin Boss|boss]] near [[the mine]] and [a map](map.png).')).toBe(
      'A fierce boss near the mine and a map.',
    );
  });

  it('drops list, quote and callout markers', () => {
    expect(noteExcerpt('- [ ] Ambush the party')).toBe('Ambush the party');
    expect(noteExcerpt('> [!note] Remember the torch')).toBe('Remember the torch');
    expect(noteExcerpt('1. First step')).toBe('First step');
  });

  it('cuts a long line', () => {
    const excerpt = noteExcerpt('word '.repeat(100))!;
    expect(excerpt.length).toBeLessThanOrEqual(NOTE_EXCERPT_MAX_LENGTH);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('is null for a note with no prose', () => {
    expect(noteExcerpt('')).toBeNull();
    expect(noteExcerpt('---\ntitle: x\n---\n# Only a heading\n')).toBeNull();
    expect(noteExcerpt('**\n')).toBeNull();
  });
});
