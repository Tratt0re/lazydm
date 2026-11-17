import { Injectable, inject, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { UpdateCheckDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';

/** Checks GitHub (through the main process) for a newer release and offers to open its page. */
@Injectable({ providedIn: 'root' })
export class UpdateService extends BaseIpcService<APIChannel.UPDATE> {
  private readonly preferences = inject(LocalPreferencesService);
  private readonly updateResultSignal = signal<UpdateCheckDto | null>(null);
  private readonly updateAvailableSignal = signal(false);
  private readonly modalOpenSignal = signal(false);
  private readonly checkingSignal = signal(false);
  private readonly versionSignal = signal<string | null>(null);

  /** The last answer, from the start-up check or from the button in Settings → About. */
  readonly updateResult = this.updateResultSignal.asReadonly();
  readonly updateAvailable = this.updateAvailableSignal.asReadonly();
  /** The pop-up is shown once per version: not when the user chose to ignore it. */
  readonly modalOpen = this.modalOpenSignal.asReadonly();
  /** A manual check is running. */
  readonly checking = this.checkingSignal.asReadonly();
  /** The version of the running app (null outside Electron). */
  readonly version = this.versionSignal.asReadonly();

  constructor() {
    super(APIChannel.UPDATE);
    if (window.electronAPI?.ipcClient?.update) {
      void this.loadVersion();
      if (this.preferences.getCheckUpdatesAtStartup()) {
        void this.runCheck(false);
      }
    }
  }

  /** The "Check for updates" button: always asks GitHub, and never opens the pop-up. */
  checkNow(): Promise<void> {
    return this.runCheck(true);
  }

  private async loadVersion(): Promise<void> {
    try {
      this.versionSignal.set(await this.ipcClient.getVersion());
    } catch (error) {
      console.warn('[app] Could not read the app version:', error);
    }
  }

  private async runCheck(manual: boolean): Promise<void> {
    if (this.checkingSignal()) {
      return;
    }

    this.checkingSignal.set(true);
    try {
      const result = manual ? await this.ipcClient.forceCheck() : await this.ipcClient.check();
      this.updateResultSignal.set(result);
      this.updateAvailableSignal.set(result.updateAvailable && result.releaseUrl !== null);
      if (!manual) {
        this.modalOpenSignal.set(this.updateAvailableSignal() && !result.popupDismissedForThisVersion);
      }
    } catch (error) {
      console.warn('[app] Update check failed:', error);
    } finally {
      this.checkingSignal.set(false);
    }
  }

  openReleasePage(): void {
    this.ipcClient.openRelease().catch((error) => console.warn('[app] Failed to open the release:', error));
  }

  dismissModal(): void {
    this.modalOpenSignal.set(false);
  }

  ignoreVersion(version: string): void {
    this.ipcClient
      .ignoreVersion({ version })
      .catch((error) => console.warn('[app] Failed to ignore the version:', error));
  }
}
