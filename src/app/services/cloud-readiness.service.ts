import { Injectable, computed, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { CloudReadinessStatusDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

const CLOUD_STATUS_CHANGED_EVENT = 'cloud:statusChanged';

@Injectable({
  providedIn: 'root',
})
export class CloudReadinessService extends BaseIpcService<APIChannel.CLOUD> {
  private readonly stateSignal = signal<CloudReadinessStatusDto | null>(null);
  private readonly downloadTotalSignal = signal(0);
  private connected = false;

  private readonly handleStatusChanged = (payload: unknown) => {
    this.applyState(payload as CloudReadinessStatusDto);
  };

  readonly state = this.stateSignal.asReadonly();
  /** Number of notes to download in the current check, used as the 100% of the progress bar. */
  readonly downloadTotal = this.downloadTotalSignal.asReadonly();
  readonly isDownloading = computed(() => this.stateSignal()?.status === 'downloading');

  constructor() {
    super(APIChannel.CLOUD);
  }

  get isAvailable(): boolean {
    return Boolean(window.electronAPI?.ipcClient?.cloud);
  }

  /** Loads the current status and follows its changes pushed by Electron. Safe to call more than once. */
  async connect(): Promise<void> {
    if (this.connected || !this.isAvailable) {
      return;
    }

    this.connected = true;
    window.electronAPI?.onIpcEvent?.(CLOUD_STATUS_CHANGED_EVENT, this.handleStatusChanged);
    this.applyState(await this.ipcClient.getStatus());
  }

  async skipWait(): Promise<void> {
    this.applyState(await this.ipcClient.skipWait());
  }

  async recheck(): Promise<void> {
    this.applyState(await this.ipcClient.recheck());
  }

  private applyState(state: CloudReadinessStatusDto): void {
    if (state.status === 'checking' || state.status === 'idle') {
      this.downloadTotalSignal.set(state.pendingFiles);
    } else {
      this.downloadTotalSignal.update((total) => Math.max(total, state.pendingFiles));
    }

    this.stateSignal.set(state);
  }
}
