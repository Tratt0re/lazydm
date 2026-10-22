import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { CreateMapPayload, MapFileDto, WriteMapPayload, WriteMapResultDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Maps: `.json` files of the Maps section, read and saved with conflict detection. */
@Injectable({
  providedIn: 'root',
})
export class MapService extends BaseIpcService<APIChannel.MAPS> {
  constructor() {
    super(APIChannel.MAPS);
  }

  read(path: string): Promise<MapFileDto> {
    return this.ipcClient.read({ path });
  }

  write(payload: WriteMapPayload): Promise<WriteMapResultDto> {
    return this.ipcClient.write(payload);
  }

  create(payload: CreateMapPayload): Promise<MapFileDto> {
    return this.ipcClient.create(payload);
  }
}
