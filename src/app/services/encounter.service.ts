import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type {
  CreateEncounterPayload,
  EncounterFileDto,
  WriteEncounterPayload,
  WriteEncounterResultDto,
} from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Encounters: `.json` files of the Encounters section, read and saved with conflict detection. */
@Injectable({
  providedIn: 'root',
})
export class EncounterService extends BaseIpcService<APIChannel.ENCOUNTERS> {
  constructor() {
    super(APIChannel.ENCOUNTERS);
  }

  read(path: string): Promise<EncounterFileDto> {
    return this.ipcClient.read({ path });
  }

  write(payload: WriteEncounterPayload): Promise<WriteEncounterResultDto> {
    return this.ipcClient.write(payload);
  }

  create(payload: CreateEncounterPayload): Promise<EncounterFileDto> {
    return this.ipcClient.create(payload);
  }
}
