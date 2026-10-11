import { Injectable, computed, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { VaultFolderSelectionDto, VaultInspectionDto, VaultStateDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

const NO_VAULT_STATE: VaultStateDto = Object.freeze({ status: 'none', vault: null });

@Injectable({
  providedIn: 'root',
})
export class VaultService extends BaseIpcService<APIChannel.VAULT> {
  private readonly stateSignal = signal<VaultStateDto | null>(null);

  readonly state = this.stateSignal.asReadonly();
  readonly currentVault = computed(() => this.stateSignal()?.vault ?? null);
  readonly isReady = computed(() => this.stateSignal()?.status === 'ready');

  constructor() {
    super(APIChannel.VAULT);
  }

  /** False when running outside Electron (e.g. `npm start` in a plain browser). */
  get isAvailable(): boolean {
    return Boolean(window.electronAPI?.ipcClient?.vault);
  }

  async loadCurrent(): Promise<VaultStateDto> {
    const state = this.isAvailable ? await this.ipcClient.getCurrent() : NO_VAULT_STATE;
    this.stateSignal.set(state);
    return state;
  }

  selectFolder(): Promise<VaultFolderSelectionDto | null> {
    return this.ipcClient.selectFolder();
  }

  inspect(folderPath: string): Promise<VaultInspectionDto> {
    return this.ipcClient.inspect({ folderPath });
  }

  async open(folderPath: string): Promise<VaultStateDto> {
    const state = await this.ipcClient.open({ folderPath });
    this.stateSignal.set(state);
    return state;
  }

  async close(): Promise<VaultStateDto> {
    const state = await this.ipcClient.close();
    this.stateSignal.set(state);
    return state;
  }
}
