import { Injectable, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { CampaignDto, CreateCampaignPayload, UpdateCampaignPayload } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import { onIndexUpdated } from '@/services/ipc-events';

/** Wait for a burst of index updates (an import writes many files) to settle before reloading. */
const RELOAD_DEBOUNCE_MS = 300;

@Injectable({
  providedIn: 'root',
})
export class CampaignService extends BaseIpcService<APIChannel.CAMPAIGNS> {
  private readonly campaignsSignal = signal<readonly CampaignDto[]>([]);
  private readonly activeCampaignSignal = signal<CampaignDto | null>(null);

  readonly campaigns = this.campaignsSignal.asReadonly();
  /** The campaign the app shell is showing; it drives the sidebar sections. */
  readonly activeCampaign = this.activeCampaignSignal.asReadonly();

  private hasLoaded = false;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super(APIChannel.CAMPAIGNS);
    // A campaign created, renamed or filled by an agent or another device shows without reopening the app.
    onIndexUpdated(() => this.scheduleReload());
  }

  async loadCampaigns(): Promise<readonly CampaignDto[]> {
    const { rows } = await this.ipcClient.list();
    this.hasLoaded = true;
    this.campaignsSignal.set(rows);
    return rows;
  }

  async create(payload: CreateCampaignPayload): Promise<CampaignDto> {
    const campaign = await this.ipcClient.create(payload);
    await this.loadCampaigns();
    return campaign;
  }

  /** Changes the name and description of a campaign; its folder stays. */
  async update(payload: UpdateCampaignPayload): Promise<CampaignDto> {
    const campaign = await this.ipcClient.update(payload);
    await this.loadCampaigns();
    if (this.activeCampaignSignal()?.slug === campaign.slug) {
      this.activeCampaignSignal.set(campaign);
    }
    return campaign;
  }

  /** Number of files that deleting the campaign would send to the Trash. */
  async countFiles(slug: string): Promise<number> {
    return (await this.ipcClient.countFiles({ slug })).count;
  }

  /** Sends the campaign folder to the system Trash and forgets its settings. */
  async remove(slug: string): Promise<void> {
    await this.ipcClient.remove({ slug });
    if (this.activeCampaignSignal()?.slug === slug) {
      this.activeCampaignSignal.set(null);
    }
    await this.loadCampaigns();
  }

  private scheduleReload(): void {
    if (!this.hasLoaded) {
      return;
    }

    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.reloadFromDisk();
    }, RELOAD_DEBOUNCE_MS);
  }

  private async reloadFromDisk(): Promise<void> {
    try {
      await this.loadCampaigns();
      const slug = this.activeCampaignSignal()?.slug;
      if (slug) {
        this.activeCampaignSignal.set(await this.ipcClient.get({ slug }));
      }
    } catch (error) {
      console.warn('[app] Failed to refresh the campaigns:', error);
    }
  }

  /** Loads a campaign and makes it the active one; resolves to null when the folder is not a campaign. */
  async activate(slug: string): Promise<CampaignDto | null> {
    if (this.activeCampaignSignal()?.slug === slug) {
      return this.activeCampaignSignal();
    }

    try {
      const campaign = await this.ipcClient.get({ slug });
      this.activeCampaignSignal.set(campaign);
      return campaign;
    } catch (error) {
      console.warn('[app] Failed to open campaign:', slug, error);
      return null;
    }
  }
}
