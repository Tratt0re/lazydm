import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import { BaseIpcService } from '@/services/base-ipc.service';

@Injectable({
  providedIn: 'root',
})
export class ResetService extends BaseIpcService<APIChannel.RESET> {
  constructor() {
    super(APIChannel.RESET);
  }

  /** Forgets the open vault and every device-local setting; the vault folder is not touched. Throws on failure. */
  async factoryReset(): Promise<void> {
    const result = await this.ipcClient.factoryReset();
    if (!result.ok) {
      throw new Error(result.error ?? 'Factory reset failed.');
    }
  }
}
