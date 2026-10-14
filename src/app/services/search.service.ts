import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { SearchResultDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

@Injectable({
  providedIn: 'root',
})
export class SearchService extends BaseIpcService<APIChannel.SEARCH> {
  constructor() {
    super(APIChannel.SEARCH);
  }

  /** Full-text search within a campaign. Returns up to 20 results ranked by relevance. */
  async query(campaign: string, term: string): Promise<readonly SearchResultDto[]> {
    const { rows } = await this.ipcClient.query({ campaign, term });
    return rows;
  }
}
