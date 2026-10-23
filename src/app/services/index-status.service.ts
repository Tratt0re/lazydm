import { Injectable, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { IndexStatusDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

const INDEX_STATUS_CHANGED_EVENT = 'index:statusChanged';

/** Follows the state of the vault index (scanning files, up to date, failed) pushed by Electron. */
@Injectable({
  providedIn: 'root',
})
export class IndexStatusService extends BaseIpcService<APIChannel.INDEX> {
  private readonly stateSignal = signal<IndexStatusDto | null>(null);
  private connected = false;

  private readonly handleStatusChanged = (payload: unknown) => {
    this.stateSignal.set(payload as IndexStatusDto);
  };

  readonly state = this.stateSignal.asReadonly();

  constructor() {
    super(APIChannel.INDEX);
  }

  get isAvailable(): boolean {
    return Boolean(window.electronAPI?.ipcClient?.index);
  }

  /** Loads the current status and follows its changes. Safe to call more than once. */
  async connect(): Promise<void> {
    if (this.connected || !this.isAvailable) {
      return;
    }

    this.connected = true;
    window.electronAPI?.onIpcEvent?.(INDEX_STATUS_CHANGED_EVENT, this.handleStatusChanged);
    this.stateSignal.set(await this.ipcClient.getStatus());
  }

  async rebuild(): Promise<void> {
    await this.ipcClient.rebuild();
  }
}
