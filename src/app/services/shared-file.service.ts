import { Injectable, signal, type WritableSignal } from '@angular/core';

/**
 * The live state of a file that two panes of the split screen can show at once (a map, an encounter): the file as
 * last loaded or saved, and the data being edited. Both panes read and write these signals, so what one adds the
 * other shows at once, and the file is saved (and its conflicts handled) once.
 */
export interface SharedFile<TFile, TData> {
  readonly file: WritableSignal<TFile | null>;
  readonly data: WritableSignal<TData | null>;
  /** The save in progress, shared so that two panes never write the file at the same time. */
  readonly save: { isSaving: boolean; needsSave: boolean };
}

interface Entry {
  readonly shared: SharedFile<unknown, unknown>;
  readonly pages: Set<object>;
}

/**
 * One live state per path for the file types whose pages edit a JSON file (maps, encounters). The notes have their
 * own, `SharedNoteService`, because the editor needs the text pushed into it.
 */
@Injectable({ providedIn: 'root' })
export class SharedFileService {
  private readonly entries = new Map<string, Entry>();

  /** A page starts showing a file (again is harmless); the state lives while some page shows it. */
  join<TFile, TData>(key: string, page: object): SharedFile<TFile, TData> {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        shared: { file: signal(null), data: signal(null), save: { isSaving: false, needsSave: false } },
        pages: new Set(),
      };
      this.entries.set(key, entry);
    }

    entry.pages.add(page);
    return entry.shared as SharedFile<TFile, TData>;
  }

  /** A page stops showing a file (another file opened in it, or the page closed). */
  leave(key: string, page: object): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    entry.pages.delete(page);
    if (entry.pages.size === 0) {
      this.entries.delete(key);
    }
  }

  /** How many pages show this file now. */
  pageCount(key: string): number {
    return this.entries.get(key)?.pages.size ?? 0;
  }
}
