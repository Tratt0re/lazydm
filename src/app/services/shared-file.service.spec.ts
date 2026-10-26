import { describe, expect, it } from 'vitest';

import { SharedFileService } from './shared-file.service';

interface FileState {
  readonly hash: string;
}
interface DataState {
  readonly pins: number;
}

const KEY = 'lost-mine/maps/cave.json';

describe('SharedFileService', () => {
  it('gives two pages showing the same file one live state', () => {
    const service = new SharedFileService();
    const left = service.join<FileState, DataState>(KEY, {});
    const right = service.join<FileState, DataState>(KEY, {});

    expect(right).toBe(left);

    left.file.set({ hash: 'a' });
    left.data.set({ pins: 1 });

    expect(right.file()).toEqual({ hash: 'a' });
    expect(right.data()).toEqual({ pins: 1 });
  });

  it('shares the save flags, so two panes never write the file at the same time', () => {
    const service = new SharedFileService();
    const left = service.join<FileState, DataState>(KEY, {});
    const right = service.join<FileState, DataState>(KEY, {});

    left.save.isSaving = true;
    right.save.needsSave = true;

    expect(right.save.isSaving).toBe(true);
    expect(left.save.needsSave).toBe(true);
  });

  it('keeps separate files apart', () => {
    const service = new SharedFileService();
    const cave = service.join<FileState, DataState>(KEY, {});
    const keep = service.join<FileState, DataState>('lost-mine/maps/keep.json', {});

    cave.data.set({ pins: 3 });

    expect(keep.data()).toBeNull();
  });

  it('forgets a file when its last page leaves, and keeps it while one stays', () => {
    const service = new SharedFileService();
    const left = {};
    const right = {};
    const shared = service.join<FileState, DataState>(KEY, left);
    service.join<FileState, DataState>(KEY, right);
    shared.data.set({ pins: 2 });

    service.leave(KEY, left);
    expect(service.pageCount(KEY)).toBe(1);
    expect(service.join<FileState, DataState>(KEY, right).data()).toEqual({ pins: 2 });

    service.leave(KEY, right);
    expect(service.pageCount(KEY)).toBe(0);
    expect(service.join<FileState, DataState>(KEY, {}).data()).toBeNull();
  });
});
