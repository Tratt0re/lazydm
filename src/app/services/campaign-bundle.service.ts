import { Injectable, inject } from '@angular/core';

import { APIChannel } from '@/config/api';
import type {
  ExportCampaignResultDto,
  ImportCampaignResultDto,
  ScanImportResultDto,
} from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import { CampaignService } from '@/services/campaign.service';

const REFUSED_NOT_A_ZIP: ScanImportResultDto = { status: 'refused', code: 'not-a-zip' };

/**
 * Taking a campaign out of the Codex as a zip and bringing one in (design-principles §6g). The zip is read and
 * written by Electron; this service only asks, and hands over the path of a dropped file.
 */
@Injectable({ providedIn: 'root' })
export class CampaignBundleService extends BaseIpcService<APIChannel.CAMPAIGNS> {
  private readonly campaignService = inject(CampaignService);

  constructor() {
    super(APIChannel.CAMPAIGNS);
  }

  /** Writes the campaign as a zip where the user picks in the system *Save* dialog. */
  exportCampaign(slug: string): Promise<ExportCampaignResultDto> {
    return this.ipcClient.export({ slug });
  }

  /** Shows the zip of the last export in the file manager. */
  async revealLastExport(): Promise<boolean> {
    return (await this.ipcClient.revealExport()).revealed;
  }

  /**
   * Looks into a zip without writing anything: the one the user picks in the system *Open* dialog, or `file` when
   * it was dropped (only its path is sent, never its bytes).
   */
  scanImport(file?: File): Promise<ScanImportResultDto> {
    if (!file) {
      return this.ipcClient.scanImport();
    }

    const path = window.electronAPI?.getPathForFile?.(file) ?? null;
    return path ? this.ipcClient.scanImport({ path }) : Promise.resolve(REFUSED_NOT_A_ZIP);
  }

  /** Creates the new campaign from the zip the preview showed; the list reloads. */
  async importCampaign(path: string, name?: string): Promise<ImportCampaignResultDto> {
    const result = await this.ipcClient.import({ path, ...(name ? { name } : {}) });
    if (result.status === 'imported') {
      await this.campaignService.loadCampaigns();
    }

    return result;
  }
}
