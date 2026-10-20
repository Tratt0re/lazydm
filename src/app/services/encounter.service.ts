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

/** File name of the party roster in the Encounters section of a scope (hidden from its lists). */
export const PARTY_FILE_NAME = '_party.json';

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
  rule(path: string, selection?: string | null): Promise<BattleRuleDto> {
    return this.ipcClient.rule(selection === undefined ? { path } : { path, rule: selection });
  }

  /** The party roster of a scope (`name` is its title when it is created now). */
  party(scope: string, name: string): Promise<EncounterFileDto> {
    return this.ipcClient.party({ scope, name });
  }

  write(payload: WriteEncounterPayload): Promise<WriteEncounterResultDto> {
    return this.ipcClient.write(payload);
  }

  create(payload: CreateEncounterPayload): Promise<EncounterFileDto> {
    return this.ipcClient.create(payload);
  }
}
