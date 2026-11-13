import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { APIChannel } from '@/config/api';
import type { CreateTemplatePayload, TemplateDto, TemplateListDto, TemplateRulesDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Rule value of a campaign that picked the generic built-in template of a note type (`builtin@<system>` for a system's). */
export const BUILT_IN_TEMPLATE_RULE = 'builtin';
/** Game systems whose built-in templates a campaign can pick, in order: id → the key of its name (generic first). */
export const SYSTEMS: readonly string[] = ['generic', 'dnd5e', 'pf2e'];
/** Select value for "no choice" (never stored): the vault's `_templates/<type>.md`, else the built-in. */
export const AUTOMATIC_TEMPLATE_RULE = 'auto';

/** One choice of a template select: Automatic, Built-in, or a template file. */
export interface TemplateRuleOption {
  readonly value: string;
  readonly label: string;
}

/** Note templates: the vault library, the built-ins, and the per-campaign choice per note type. */
@Injectable({
  providedIn: 'root',
})
export class TemplateService extends BaseIpcService<APIChannel.TEMPLATES> {
  private readonly translateService = inject(TranslateService);

  constructor() {
    super(APIChannel.TEMPLATES);
  }

  /** Templates a campaign can pick: the vault's, every compendium system's and its own (not other campaigns'). */
  getCampaignTemplates(templates: readonly TemplateDto[], campaign: string): readonly TemplateDto[] {
    return templates.filter((template) => template.source !== 'campaign' || template.scope === campaign);
  }

  /** `enemy · D&D 5e`, `session-recap · Vault`. */
  getTemplateLabel(template: TemplateDto): string {
    const source =
      template.scopeName ?? this.translateService.instant('settings.templates.sources.vault');
    return `${template.name} · ${source}`;
  }

  /** Name of a game system (`dnd5e` → D&D 5e); the generic one is "Generic". */
  getSystemLabel(system: string | null): string {
    return this.translateService.instant(`settings.templates.systems.${system ?? 'generic'}`);
  }

  /**
   * Choices of a campaign's template select for a note type. *Automatic* says what it will use: the vault's own
   * `_templates/<type>.md` when there is one, else the built-in of the campaign's game system. Then one built-in per
   * system that has its own variant of the type (only for the types that ship one: a custom section starts on
   * Automatic), the campaign's templates, and the current choice when its file is gone (so the select is never blank).
   */
  getRuleOptions(
    templates: readonly TemplateDto[],
    campaign: string,
    currentRule: string | undefined,
    builtInSystems: readonly string[] | null = [],
    campaignSystem: string | null = null,
  ): readonly TemplateRuleOption[] {
    const campaignTemplates = this.getCampaignTemplates(templates, campaign);
    const systemLabel = this.getSystemLabel(
      campaignSystem && builtInSystems?.includes(campaignSystem) ? campaignSystem : null,
    );
    const options: TemplateRuleOption[] = [
      {
        value: AUTOMATIC_TEMPLATE_RULE,
        label: this.translateService.instant('settings.templates.rules.automaticFor', {
          system: systemLabel,
        }),
      },
      ...(builtInSystems === null
        ? []
        : ['generic', ...builtInSystems].map((system) => ({
            value: system === 'generic' ? BUILT_IN_TEMPLATE_RULE : `${BUILT_IN_TEMPLATE_RULE}@${system}`,
            label: this.translateService.instant('settings.templates.rules.builtInOf', {
              system: this.getSystemLabel(system),
            }),
          }))),
      ...campaignTemplates.map((template) => ({
        value: template.path,
        label: this.getTemplateLabel(template),
      })),
    ];

    if (currentRule && !options.some((option) => option.value === currentRule)) {
      options.push({
        value: currentRule,
        label: this.translateService.instant('settings.templates.rules.missing', { path: currentRule }),
      });
    }

    return options;
  }

  list(): Promise<TemplateListDto> {
    return this.ipcClient.list();
  }

  async getBuiltIn(type: string, system?: string): Promise<string> {
    return (await this.ipcClient.builtIn({ type, system })).content;
  }

  async getRules(campaign: string): Promise<TemplateRulesDto> {
    return (await this.ipcClient.getRules({ campaign })).rules;
  }

  async setRule(campaign: string, type: string, template: string | null): Promise<TemplateRulesDto> {
    return (await this.ipcClient.setRule({ campaign, type, template })).rules;
  }

  async create(payload: CreateTemplatePayload): Promise<string> {
    return (await this.ipcClient.create(payload)).path;
  }

  async customize(type: string, system?: string): Promise<string> {
    return (await this.ipcClient.customize({ type, system })).path;
  }

  /** @deprecated The channel is gone; only the old layout editor page calls this, and it is deleted with it. */
  async addKeys(_path: string, _keys: readonly string[]): Promise<readonly string[]> {
    return [];
  }

  async remove(path: string): Promise<void> {
    await this.ipcClient.remove({ path });
  }
}
