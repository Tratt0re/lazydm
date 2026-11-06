import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { CopyComparisonDto, ResolveCopyPayload, ResolveCopyResultDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Copies a sync client made (`goblin 2.md`): what they look like next to their original, and the repair. */
@Injectable({
  providedIn: 'root',
})
export class CopiesService extends BaseIpcService<APIChannel.COPIES> {
  constructor() {
    super(APIChannel.COPIES);
  }

  compare(path: string): Promise<CopyComparisonDto> {
    return this.ipcClient.compare({ path });
  }

  resolve(payload: ResolveCopyPayload): Promise<ResolveCopyResultDto> {
    return this.ipcClient.resolve(payload);
  }
}
