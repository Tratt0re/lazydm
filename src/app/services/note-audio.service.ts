import { Injectable, signal } from '@angular/core';

import { toAssetUrl } from '@/components/document-preview/document-preview.markdown';

/**
 * The note audio channel: one sound at a time for the open note — playing another stops the current one.
 * Audio embedded in notes (`![[roar.mp3]]`) plays here, served by the asset protocol.
 */
@Injectable({ providedIn: 'root' })
export class NoteAudioService {
  private audio: HTMLAudioElement | null = null;
  private readonly playingPathSignal = signal<string | null>(null);

  /** Vault path of the audio playing now, or null. */
  readonly playingPath = this.playingPathSignal.asReadonly();

  /** Plays an audio asset (stopping any other), or stops it when it is the one playing. */
  toggle(path: string): Promise<void> {
    if (this.playingPathSignal() === path) {
      this.stop();
      return Promise.resolve();
    }
    return this.play(path);
  }

  /** Plays an audio asset from the start; rejects when it cannot be played (the channel is then stopped). */
  async play(path: string): Promise<void> {
    this.stop();
    const audio = new Audio(toAssetUrl(path));
    this.audio = audio;
    this.playingPathSignal.set(path);
    audio.onended = () => {
      if (this.audio === audio) {
        this.stop();
      }
    };

    try {
      await audio.play();
    } catch (error) {
      if (this.audio === audio) {
        this.stop();
      }
      throw error;
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.pause();
      this.audio = null;
    }
    this.playingPathSignal.set(null);
  }
}
