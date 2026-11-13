import { Injectable, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { BattleRuleListDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Tracker layouts (battle rules): the built-in ones and the per-campaign choice. */
@Injectable({
  providedIn: 'root',
})
export class BattleRuleService extends BaseIpcService<APIChannel.BATTLE_RULES> {
  private readonly changesSignal = signal(0);
  /** Counts every change of the layouts (a campaign's choice): pages showing one follow. */
  readonly changes = this.changesSignal.asReadonly();

  constructor() {
    super(APIChannel.BATTLE_RULES);
  }

  list(): Promise<BattleRuleListDto> {
    return this.ipcClient.list();
  }

  private notifyChanged(): void {
    this.changesSignal.update((count) => count + 1);
  }

  /** The campaign's own choice (null: none) and its game system, whose layout applies while it has no choice. */
  async getChoice(campaign: string): Promise<{ rule: string | null; system: string | null }> {
    return this.ipcClient.getChoice({ campaign });
  }

  async setChoice(campaign: string, rule: string | null): Promise<string | null> {
    const choice = (await this.ipcClient.setChoice({ campaign, rule })).rule;
    this.notifyChanged();
    return choice;
  }
}
