import { Injectable, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { CampaignDto, CreateCampaignPayload } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

@Injectable({
  providedIn: 'root',
})
export class CampaignService extends BaseIpcService<APIChannel.CAMPAIGNS> {
  private readonly campaignsSignal = signal<readonly CampaignDto[]>([]);
  private readonly activeCampaignSignal = signal<CampaignDto | null>(null);

  readonly campaigns = this.campaignsSignal.asReadonly();
  /** The campaign the app shell is showing; it drives the sidebar sections. */
  readonly activeCampaign = this.activeCampaignSignal.asReadonly();

  constructor() {
    super(APIChannel.CAMPAIGNS);
  }

  async loadCampaigns(): Promise<readonly CampaignDto[]> {
    const { rows } = await this.ipcClient.list();
    this.campaignsSignal.set(rows);
    return rows;
  }

  async create(payload: CreateCampaignPayload): Promise<CampaignDto> {
    const campaign = await this.ipcClient.create(payload);
    await this.loadCampaigns();
    return campaign;
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
