import { Injectable, signal, type Signal } from '@angular/core';

import type { DocumentDto } from '@/dtos';

/** What every page showing a note shares: the file as last read or saved, the text being edited, the save state. */
export interface SharedNote {
  /** The file as loaded or last saved (its hash is what the next save is checked against). */
  readonly document: Signal<DocumentDto | null>;
  /** The text being edited, the same in every page that shows this note. */
  readonly editedContent: Signal<string>;
  /** A save is running (the other page must not start a second one). */
  readonly isSaving: Signal<boolean>;
  setDocument(document: DocumentDto | null): void;
  setContent(content: string): void;
  setSaving(isSaving: boolean): void;
}

interface Entry {
  readonly note: SharedNote;
  readonly pages: Set<object>;
}

/**
 * One live document per note path. The same note can be open in both panes of the split screen: each pane keeps
 * its own editor (cursor, scroll, view mode), but they edit one text, one saved copy and one save state, so a
 * change made on one side shows on the other, and the note is saved (and its conflicts handled) once.
 */
@Injectable({ providedIn: 'root' })
export class SharedNoteService {
  private readonly entries = new Map<string, Entry>();

  /** A page starts showing a note (again is harmless); the note lives while some page shows it. */
  join(path: string, page: object): SharedNote {
    let entry = this.entries.get(path);
    if (!entry) {
      entry = { note: this.createNote(), pages: new Set() };
      this.entries.set(path, entry);
    }

    entry.pages.add(page);
    return entry.note;
  }

  /** How many pages show this note now. */
  pageCount(path: string): number {
    return this.entries.get(path)?.pages.size ?? 0;
  }

  /** A page stops showing a note (another note opened in it, or the page closed). */
  leave(path: string, page: object): void {
    const entry = this.entries.get(path);
    if (!entry) {
      return;
    }

    entry.pages.delete(page);
    if (entry.pages.size === 0) {
      this.entries.delete(path);
    }
  }

  private createNote(): SharedNote {
    const document = signal<DocumentDto | null>(null);
    const editedContent = signal('');
    const isSaving = signal(false);

    return {
      document: document.asReadonly(),
      editedContent: editedContent.asReadonly(),
      isSaving: isSaving.asReadonly(),
      setDocument: (next) => document.set(next),
      setContent: (content) => editedContent.set(content),
      setSaving: (value) => isSaving.set(value),
    };
  }
}
