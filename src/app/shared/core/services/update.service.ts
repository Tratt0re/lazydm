import { Injectable, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { UpdateCheckDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Checks GitHub (through the main process) for a newer release and offers to open its page. */
@Injectable({ providedIn: 'root' })
export class UpdateService extends BaseIpcService<APIChannel.UPDATE> {
  private readonly updateResultSignal = signal<UpdateCheckDto | null>(null);
  private readonly updateAvailableSignal = signal(false);
  private readonly modalOpenSignal = signal(false);

  readonly updateResult = this.updateResultSignal.asReadonly();
  readonly updateAvailable = this.updateAvailableSignal.asReadonly();
  /** The pop-up is shown once per version: not when the user chose to ignore it. */
  readonly modalOpen = this.modalOpenSignal.asReadonly();

  constructor() {
    super(APIChannel.UPDATE);
    if (window.electronAPI?.ipcClient?.update) {
      void this.check();
    }
  }

  private async check(): Promise<void> {
    try {
      const result = await this.ipcClient.forceCheck();
      this.updateResultSignal.set(result);
      this.updateAvailableSignal.set(result.updateAvailable && result.releaseUrl !== null);
      this.modalOpenSignal.set(this.updateAvailableSignal() && !result.popupDismissedForThisVersion);
    } catch (error) {
      console.warn('[app] Update check failed:', error);
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
