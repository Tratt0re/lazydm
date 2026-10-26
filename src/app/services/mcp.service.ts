import { Injectable, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { McpStatusDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

const MCP_STATUS_CHANGED_EVENT = 'mcp:statusChanged';

/** The built-in MCP server: its state follows what the main process pushes, so every view agrees. */
@Injectable({
  providedIn: 'root',
})
export class McpService extends BaseIpcService<APIChannel.MCP> {
  private readonly stateSignal = signal<McpStatusDto | null>(null);
  private connected = false;

  private readonly handleStatusChanged = (payload: unknown) => {
    this.stateSignal.set(payload as McpStatusDto);
  };

  readonly state = this.stateSignal.asReadonly();

  constructor() {
    super(APIChannel.MCP);
  }

  get isAvailable(): boolean {
    return Boolean(window.electronAPI?.ipcClient?.mcp);
  }

  /** Loads the current status and follows its changes. Safe to call more than once. */
  async connect(): Promise<void> {
    if (this.connected || !this.isAvailable) {
      return;
    }

    this.connected = true;
    window.electronAPI?.onIpcEvent?.(MCP_STATUS_CHANGED_EVENT, this.handleStatusChanged);
    this.stateSignal.set(await this.ipcClient.getStatus());
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.stateSignal.set(await this.ipcClient.setEnabled({ enabled }));
  }

  async start(): Promise<void> {
    this.stateSignal.set(await this.ipcClient.start());
  }

  async stop(): Promise<void> {
    this.stateSignal.set(await this.ipcClient.stop());
  }

  async setAutostart(autostart: boolean): Promise<void> {
    this.stateSignal.set(await this.ipcClient.setAutostart({ autostart }));
  }

  async setAllowWrite(allowWrite: boolean): Promise<void> {
    this.stateSignal.set(await this.ipcClient.setAllowWrite({ allowWrite }));
  }

  async setLimitScope(limitScope: boolean): Promise<void> {
    this.stateSignal.set(await this.ipcClient.setLimitScope({ limitScope }));
  }

  async setScopeRoots(roots: readonly string[]): Promise<void> {
    this.stateSignal.set(await this.ipcClient.setScopeRoots({ roots }));
  }

  async setPort(port: number): Promise<void> {
    this.stateSignal.set(await this.ipcClient.setPort({ port }));
  }

  async regenerateToken(): Promise<void> {
    this.stateSignal.set(await this.ipcClient.regenerateToken());
  }
}
