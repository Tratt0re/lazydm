import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { APIChannel } from '@/config/api';
import type { CreateTemplatePayload, TemplateDto, TemplateListDto, TemplateRulesDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Rule value of a campaign that picked the built-in template of a note type. */
export const BUILT_IN_TEMPLATE_RULE = 'builtin';
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

  /**
   * Choices of a campaign's template select for a note type: Automatic, Built-in (only for the types that ship
   * one: a custom section starts on Automatic), its templates, and the current choice when its file is gone
   * (so the select is never blank).
   */
  getRuleOptions(
    templates: readonly TemplateDto[],
    campaign: string,
    currentRule: string | undefined,
    hasBuiltIn = true,
  ): readonly TemplateRuleOption[] {
    const campaignTemplates = this.getCampaignTemplates(templates, campaign);
    const options: TemplateRuleOption[] = [
      {
        value: AUTOMATIC_TEMPLATE_RULE,
        label: this.translateService.instant('settings.templates.rules.automatic'),
      },
      ...(hasBuiltIn
        ? [
            {
              value: BUILT_IN_TEMPLATE_RULE,
              label: this.translateService.instant('settings.templates.sources.builtin'),
            },
          ]
        : []),
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

  async remove(path: string): Promise<void> {
    await this.ipcClient.remove({ path });
  }
}
