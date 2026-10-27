import { Injectable, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { CompendiumSystemDto, CreateCompendiumSystemPayload } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import { onIndexUpdated } from '@/services/ipc-events';

const RELOAD_DEBOUNCE_MS = 300;
const COMPENDIUM_PREFIX = 'compendium/';

/** Systems of the vault compendium: cross-campaign folders to copy notes and files to and from. */
@Injectable({
  providedIn: 'root',
})
export class CompendiumService extends BaseIpcService<APIChannel.COMPENDIUM> {
  private readonly systemsSignal = signal<readonly CompendiumSystemDto[]>([]);
  private readonly activeSystemSignal = signal<CompendiumSystemDto | null>(null);

  readonly systems = this.systemsSignal.asReadonly();
  /** The system the app shell is showing; it drives the sidebar folders. */
  readonly activeSystem = this.activeSystemSignal.asReadonly();

  private hasLoaded = false;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super(APIChannel.COMPENDIUM);
    onIndexUpdated((paths) => {
      if (this.hasLoaded && paths.some((path) => path.startsWith(COMPENDIUM_PREFIX))) {
        this.scheduleReload();
      }
    });
  }

  async loadSystems(): Promise<readonly CompendiumSystemDto[]> {
    const { rows } = await this.ipcClient.list();
    this.hasLoaded = true;
    this.systemsSignal.set(rows);
    return rows;
  }

  async create(payload: CreateCompendiumSystemPayload): Promise<CompendiumSystemDto> {
    const system = await this.ipcClient.create(payload);
    await this.loadSystems();
    return system;
  }

  async countFiles(slug: string): Promise<number> {
    return (await this.ipcClient.countFiles({ slug })).count;
  }

  async remove(slug: string): Promise<void> {
    await this.ipcClient.remove({ slug });
    if (this.activeSystemSignal()?.slug === slug) {
      this.activeSystemSignal.set(null);
    }
    await this.loadSystems();
  }

  /** Loads a system and makes it the active one (folders refreshed each time); null when missing. */
  async activate(slug: string): Promise<CompendiumSystemDto | null> {
    try {
      const system = await this.ipcClient.get({ slug });
      this.activeSystemSignal.set(system);
      return system;
    } catch (error) {
      console.warn('[app] Failed to open compendium system:', slug, error);
      return null;
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      this.refreshActive().catch((error: unknown) =>
        console.warn('[app] Failed to refresh the compendium:', error),
      );
    }, RELOAD_DEBOUNCE_MS);
  }

  /** Re-reads the active system, e.g. after a copy created a new folder in it. */
  async refreshActive(): Promise<void> {
    const system = this.activeSystemSignal();
    if (system) {
      await this.activate(system.slug);
    }
    await this.loadSystems();
  }
}
