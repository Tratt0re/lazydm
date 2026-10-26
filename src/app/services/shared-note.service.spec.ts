import { describe, expect, it } from 'vitest';

import type { DocumentDto } from '@/dtos';
import { SharedNoteService } from './shared-note.service';

const PATH = 'lost-mine/enemies/goblin.md';

function document(content: string): DocumentDto {
  return {
    path: PATH,
    content,
    contentHash: 'h',
    mtimeMs: 1,
    title: 'Goblin',
    frontmatter: {},
    frontmatterError: null,
    body: content,
    links: [],
  };
}

describe('SharedNoteService', () => {
  it('gives two pages showing the same note one live document', () => {
    const service = new SharedNoteService();
    const left = service.join(PATH, {});
    const right = service.join(PATH, {});

    expect(right).toBe(left);

    left.setDocument(document('# Goblin'));
    left.setContent('# Goblin\n\nedited');

    expect(right.document()?.content).toBe('# Goblin');
    expect(right.editedContent()).toBe('# Goblin\n\nedited');
  });

  it('shares the save state, so only one page saves at a time', () => {
    const service = new SharedNoteService();
    const left = service.join(PATH, {});
    const right = service.join(PATH, {});

    left.setSaving(true);

    expect(right.isSaving()).toBe(true);
  });

  it('keeps separate notes apart', () => {
    const service = new SharedNoteService();
    const goblin = service.join(PATH, {});
    const bob = service.join('lost-mine/npcs/bob.md', {});

    goblin.setContent('goblin text');

    expect(bob.editedContent()).toBe('');
  });

  it('counts the pages showing a note and forgets it when the last one leaves', () => {
    const service = new SharedNoteService();
    const left = {};
    const right = {};
    const note = service.join(PATH, left);
    service.join(PATH, right);
    note.setContent('unsaved');

    expect(service.pageCount(PATH)).toBe(2);

    service.leave(PATH, left);
    expect(service.pageCount(PATH)).toBe(1);
    // The page that stays still sees the text.
    expect(service.join(PATH, right).editedContent()).toBe('unsaved');

    service.leave(PATH, right);
    expect(service.pageCount(PATH)).toBe(0);
    // A note opened again starts from nothing, not from the old unsaved text.
    expect(service.join(PATH, {}).editedContent()).toBe('');
  });

  it('joining twice with the same page counts it once', () => {
    const service = new SharedNoteService();
    const page = {};
    service.join(PATH, page);
    service.join(PATH, page);

    expect(service.pageCount(PATH)).toBe(1);
  });

  it('leaving a note that was never joined does nothing', () => {
    const service = new SharedNoteService();

    expect(() => service.leave(PATH, {})).not.toThrow();
    expect(service.pageCount(PATH)).toBe(0);
  });
});
