import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { APIChannel } from '@/config/api';
import type {
  BattleRuleDto,
  BattleRuleFileDto,
  BattleRuleListDto,
  BattleRuleRowDto,
  WriteBattleRuleResultDto,
} from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Rule value of a campaign or an encounter that uses the built-in rule. */
export const BUILT_IN_BATTLE_RULE = 'builtin';
/** Built-in rules of a game system: reference → the system's name key (`settings.templates.systems.<key>`). */
export const SYSTEM_BATTLE_RULES: Readonly<Record<string, string>> = {
  'builtin:dnd5e': 'dnd5e',
  'builtin:pf2e': 'pf2e',
};
/** Select value for "no choice" (never stored): the campaign's rule, else the built-in. */
export const DEFAULT_BATTLE_RULE_CHOICE = 'default';

/** One choice of a battle rule select. */
export interface BattleRuleOption {
  readonly value: string;
  readonly label: string;
}

/** Battle rules: the vault library, the built-in, and the per-campaign and per-encounter choice. */
@Injectable({
  providedIn: 'root',
})
export class BattleRuleService extends BaseIpcService<APIChannel.BATTLE_RULES> {
  private readonly translateService = inject(TranslateService);
  private readonly changesSignal = signal(0);
  /** Counts every change of the rules (a saved, created or deleted file, a campaign's choice): pages showing one follow. */
  readonly changes = this.changesSignal.asReadonly();

  constructor() {
    super(APIChannel.BATTLE_RULES);
  }

  /** Rules a campaign can pick: the vault's, every system's and its own (not other campaigns'). */
  getCampaignRules(rows: readonly BattleRuleRowDto[], campaign: string): readonly BattleRuleRowDto[] {
    return rows.filter((row) => row.source !== 'campaign' || row.scope === campaign);
  }

  /** `Fate · Vault`, `Dark Heresy · D&D 5e`. */
  getRuleLabel(row: BattleRuleRowDto): string {
    const source = row.scopeName ?? this.translateService.instant('settings.templates.sources.vault');
    return `${row.name} · ${source}`;
  }

  /**
   * Choices of a rule select: the first (`defaultLabel`: the campaign's rule for an encounter, the built-in for a
   * campaign), the built-in, the rules, and the current choice when its file is gone (so the select is never blank).
   */
  getOptions(
    rows: readonly BattleRuleRowDto[],
    campaign: string,
    currentRule: string | null,
    defaultLabel: string,
  ): readonly BattleRuleOption[] {
    const options: BattleRuleOption[] = [
      { value: DEFAULT_BATTLE_RULE_CHOICE, label: defaultLabel },
      {
        value: BUILT_IN_BATTLE_RULE,
        label: this.translateService.instant('settings.templates.sources.builtin'),
      },
      ...Object.entries(SYSTEM_BATTLE_RULES).map(([value, system]) => ({
        value,
        label: this.translateService.instant('battleRules.builtInSystem', {
          system: this.translateService.instant(`settings.templates.systems.${system}`),
        }),
      })),
      ...this.getCampaignRules(rows, campaign).map((row) => ({
        value: row.path,
        label: this.getRuleLabel(row),
      })),
    ];

    if (currentRule && !options.some((option) => option.value === currentRule)) {
      options.push({
        value: currentRule,
        label: this.translateService.instant('battleRules.missing', { path: currentRule }),
      });
    }

    return options;
  }

  list(): Promise<BattleRuleListDto> {
    return this.ipcClient.list();
  }

  read(path: string): Promise<BattleRuleFileDto> {
    return this.ipcClient.read({ path });
  }

  async write(
    path: string,
    rule: BattleRuleDto,
    expectedHash: string | null,
  ): Promise<WriteBattleRuleResultDto> {
    const result = await this.ipcClient.write({ path, rule, expectedHash });
    this.notifyChanged();
    return result;
  }

  /** A new rule file, started from a built-in one (`from`: its reference; the default one when missing). */
  async create(name: string, from?: string): Promise<string> {
    const { path } = await this.ipcClient.create({ name, from });
    this.notifyChanged();
    return path;
  }

  async remove(path: string): Promise<void> {
    await this.ipcClient.remove({ path });
    this.notifyChanged();
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

  /** Frontmatter keys of a template (path or `builtin:<type>`): what a rule can read from an entity's note. */
  async attributes(template: string): Promise<readonly string[]> {
    return (await this.ipcClient.attributes({ template })).keys;
  }
}
