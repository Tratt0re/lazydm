import { Injectable } from '@angular/core';

import { toAssetUrl } from '@/components/document-preview/document-preview.markdown';
import { APIChannel } from '@/config/api';
import type { SavedAssetDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Note audio is meant for short sounds: a longer file is still saved, with a warning. */
export const NOTE_AUDIO_MAX_SECONDS = 30;

/** Types of the files a paste saves as assets (images, PDFs, audio); anything else pastes as usual. */
const MEDIA_TYPE_PATTERN = /^(image\/|audio\/|application\/pdf$)/;

/** Media files (images, PDFs, audio) saved in the `assets/` folder of a note's campaign or system. */
@Injectable({
  providedIn: 'root',
})
export class AssetService extends BaseIpcService<APIChannel.ASSETS> {
  constructor() {
    super(APIChannel.ASSETS);
  }

  /** Whether a pasted file is a media file LazyDM saves as an asset. */
  isMediaFile(file: File): boolean {
    return MEDIA_TYPE_PATTERN.test(file.type);
  }

  /** Saves a pasted file in the assets of the note's scope; returns where it went and how to link it. */
  async save(sourcePath: string, file: File): Promise<SavedAssetDto> {
    return this.ipcClient.save({
      sourcePath,
      name: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  /** Lets the user pick media files on disk and saves them as assets (none when the dialog is cancelled). */
  async importFiles(sourcePath: string): Promise<readonly SavedAssetDto[]> {
    return (await this.ipcClient.import({ sourcePath })).files;
  }

  /** Length of a saved audio asset in seconds (null when it cannot be read). */
  readAudioDuration(path: string): Promise<number | null> {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () =>
        resolve(Number.isFinite(audio.duration) ? audio.duration : null);
      audio.onerror = () => resolve(null);
      audio.src = toAssetUrl(path);
    });
  }
}
