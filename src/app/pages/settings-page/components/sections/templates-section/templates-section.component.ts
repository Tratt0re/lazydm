import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { CAMPAIGN_SECTIONS } from '@/config/menu.config';
import type { TemplateDto, TemplateRulesDto } from '@/dtos';
import { AppSheetService } from '@/services/app-sheet.service';
import { CampaignService } from '@/services/campaign.service';
import {
  AUTOMATIC_TEMPLATE_RULE,
  TemplateService,
  type TemplateRuleOption,
} from '@/services/template.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechSelectImports } from '@/shared/components/select';

interface NoteTypeRow {
  readonly type: string;
  readonly sectionKey: string;
}

/**
 * Settings → Templates: which template each note type uses in the campaign under the sheet (saved in
 * `.lazydm/vault.json`). The templates themselves are managed in the Templates sheet.
 */
@Component({
  selector: 'app-templates-section',
  imports: [
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ...ArcTechSelectImports,
  ],
  templateUrl: './templates-section.component.html',
})
export class TemplatesSectionComponent implements OnInit {
  private readonly templateService = inject(TemplateService);
  private readonly campaignService = inject(CampaignService);
  private readonly appSheetService = inject(AppSheetService);
  private readonly translateService = inject(TranslateService);

  protected readonly templates = signal<readonly TemplateDto[]>([]);
  protected readonly types = signal<readonly string[]>([]);
  protected readonly rules = signal<TemplateRulesDto>({});
  protected readonly errorMessage = signal<string | null>(null);

  /** Campaign of the page under the sheet (`/campaigns/<slug>/…`), or null on the campaign list. */
  protected readonly campaignSlug = signal<string | null>(null);
  protected readonly campaignName = computed(() => {
    const slug = this.campaignSlug();
    const campaign = this.campaignService.activeCampaign();
    return campaign?.slug === slug ? campaign.name : (slug ?? '');
  });

  protected readonly noteTypes = computed<readonly NoteTypeRow[]>(() =>
    CAMPAIGN_SECTIONS.filter(
      (section) => section.noteType && this.types().includes(section.noteType),
    ).map((section) => ({ type: section.noteType!, sectionKey: section.key })),
  );

  ngOnInit(): void {
    this.campaignSlug.set(this.readCampaignSlug());
    void this.load();
  }

  protected getRuleValue(type: string): string {
    return this.rules()[type] ?? AUTOMATIC_TEMPLATE_RULE;
  }

  protected getRuleOptions(type: string): readonly TemplateRuleOption[] {
    return this.templateService.getRuleOptions(
      this.templates(),
      this.campaignSlug() ?? '',
      this.rules()[type],
    );
  }

  protected openLibrary(): void {
    void this.appSheetService.open('templates');
  }

  protected async onRuleChange(type: string, value: string | string[]): Promise<void> {
    const campaign = this.campaignSlug();
    const selectedValue = Array.isArray(value) ? value[0] : value;
    if (!campaign || !selectedValue || selectedValue === this.getRuleValue(type)) {
      return;
    }

    try {
      this.rules.set(
        await this.templateService.setRule(
          campaign,
          type,
          selectedValue === AUTOMATIC_TEMPLATE_RULE ? null : selectedValue,
        ),
      );
      toast.success(this.translateService.instant('settings.templates.rules.saved'));
    } catch (error) {
      toast.error(this.translateService.instant('settings.templates.rules.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const campaign = this.campaignSlug();
      const [library, rules] = await Promise.all([
        this.templateService.list(),
        campaign ? this.templateService.getRules(campaign) : Promise.resolve({}),
      ]);
      this.templates.set(library.rows);
      this.types.set(library.types);
      this.rules.set(rules);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  private readCampaignSlug(): string | null {
    const [root, slug] = this.appSheetService.underlyingPath().split('/');
    return root === 'campaigns' && slug ? slug : null;
  }
}
