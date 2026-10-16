import { Injectable, inject, signal } from '@angular/core';

import { toAssetUrl } from '@/components/document-preview/document-preview.markdown';
import { LocalPreferencesService } from '@/services/local-preferences.service';

/** Current time and duration of the playing audio, in seconds (duration `NaN` until the metadata loads). */
export interface NoteAudioProgress {
  readonly currentTime: number;
  readonly duration: number;
}

/**
 * The note audio channel: one sound at a time for the open note — playing another stops the current one.
 * Audio embedded in notes (`![[roar.mp3]]`) plays here, served by the asset protocol. One volume for every
 * sound, remembered on this device (Settings has no entry for it; the row's own slider sets it).
 */
@Injectable({ providedIn: 'root' })
export class NoteAudioService {
  private readonly localPreferences = inject(LocalPreferencesService);
  private audio: HTMLAudioElement | null = null;
  private readonly playingPathSignal = signal<string | null>(null);
  private readonly progressSignal = signal<NoteAudioProgress>({ currentTime: 0, duration: NaN });
  private readonly volumeSignal = signal(this.localPreferences.getNoteAudioVolume());

  /** Vault path of the audio playing now, or null. */
  readonly playingPath = this.playingPathSignal.asReadonly();
  /** Current time / duration of the playing audio; meaningless while nothing plays. */
  readonly progress = this.progressSignal.asReadonly();
  /** 0–1, the same for every sound, remembered on this device. */
  readonly volume = this.volumeSignal.asReadonly();

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
    audio.volume = this.volumeSignal();
    this.audio = audio;
    this.playingPathSignal.set(path);
    this.progressSignal.set({ currentTime: 0, duration: NaN });
    audio.ontimeupdate = () => {
      if (this.audio === audio) {
        this.progressSignal.set({ currentTime: audio.currentTime, duration: audio.duration });
      }
    };
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

  /** Sets the volume of the current and every future sound, and remembers it on this device. */
  setVolume(volume: number): void {
    const normalizedVolume = Math.min(1, Math.max(0, volume));
    this.volumeSignal.set(normalizedVolume);
    this.localPreferences.setNoteAudioVolume(normalizedVolume);
    if (this.audio) {
      this.audio.volume = normalizedVolume;
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.ontimeupdate = null;
      this.audio.onended = null;
      this.audio.pause();
      this.audio = null;
    }
    this.playingPathSignal.set(null);
  }
}
