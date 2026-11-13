/** Longest excerpt shown under a combatant (the Expanded row). */
export const NOTE_EXCERPT_MAX_LENGTH = 180;

/**
 * The first line of prose of a note, for the Expanded row: the frontmatter, headings, blank lines, rules and
 * code fences are skipped, and links and emphasis lose their markup (`[[Goblin|the goblin]]` reads "the goblin").
 * Null when the note has no prose.
 */
export function noteExcerpt(body: string): string | null {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let index = 0;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((line, at) => at > 0 && ['---', '...'].includes(line.trim()));
    index = close === -1 ? 0 : close + 1;
  }

  let isFenced = false;
  for (; index < lines.length; index++) {
    const line = lines[index].trim();
    if (line.startsWith('```') || line.startsWith('~~~')) {
      isFenced = !isFenced;
      continue;
    }

    if (isFenced || line === '' || /^#{1,6}\s/.test(line) || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      continue;
    }

    const text = line
      .replace(/^(>\s*)+/, '')
      .replace(/^\[!\w+\][+-]?\s*/, '')
      .replace(/^([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '')
      .replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
      .replace(/!?\[\[([^\]]*)\]\]/g, '$1')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|\*|_|~~|`)/g, '')
      .trim();
    if (text === '') {
      continue;
    }

    return text.length > NOTE_EXCERPT_MAX_LENGTH
      ? `${text.slice(0, NOTE_EXCERPT_MAX_LENGTH - 1).trimEnd()}…`
      : text;
  }

  return null;
}
