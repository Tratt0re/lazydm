import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type {
  BattleRuleDto,
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

  /** The battle rule that drives the rows of this encounter. */
  rule(path: string): Promise<BattleRuleDto> {
    return this.ipcClient.rule({ path });
  }

  write(payload: WriteEncounterPayload): Promise<WriteEncounterResultDto> {
    return this.ipcClient.write(payload);
  }

  create(payload: CreateEncounterPayload): Promise<EncounterFileDto> {
    return this.ipcClient.create(payload);
  }
}
