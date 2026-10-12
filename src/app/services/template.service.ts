import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { CreateTemplatePayload, TemplateListDto, TemplateRulesDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Rule value of a campaign that picked the built-in template of a note type. */
export const BUILT_IN_TEMPLATE_RULE = 'builtin';

/** Note templates: the vault library, the built-ins, and the per-campaign choice per note type. */
@Injectable({
  providedIn: 'root',
})
export class TemplateService extends BaseIpcService<APIChannel.TEMPLATES> {
  constructor() {
    super(APIChannel.TEMPLATES);
  }

  list(): Promise<TemplateListDto> {
    return this.ipcClient.list();
  }

  async getBuiltIn(type: string): Promise<string> {
    return (await this.ipcClient.builtIn({ type })).content;
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

  async customize(type: string): Promise<string> {
    return (await this.ipcClient.customize({ type })).path;
  }

  async remove(path: string): Promise<void> {
    await this.ipcClient.remove({ path });
  }
}
