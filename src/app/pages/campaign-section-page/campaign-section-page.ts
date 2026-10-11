import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';

import { CAMPAIGN_SECTIONS } from '@/config/menu.config';
import { CampaignService } from '@/services/campaign.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechEmptyComponent } from '@/shared/components/empty';

export const CAMPAIGN_SECTION_PARAM = 'section';

@Component({
  selector: 'app-campaign-section-page',
  imports: [TranslatePipe, ArcTechEmptyComponent],
  template: `
    @if (section(); as section) {
      <div class="mx-auto w-full max-w-5xl p-6">
        <arc-empty
          class="border border-dashed border-border bg-card/60"
          [arcIcon]="section.icon"
          [arcTitle]="'campaigns.sections.emptyTitle' | translate: { section: (sectionLabelKey() | translate) }"
          [arcDescription]="'campaigns.sections.emptyDescription' | translate: { folder: folderPath() }"
        />
      </div>
    }
  `,
})
export class CampaignSectionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly campaignService = inject(CampaignService);
  private readonly toolbarContext = inject(ToolbarContextService);

  private readonly sectionKey = toSignal(
    this.route.paramMap.pipe(map((params) => params.get(CAMPAIGN_SECTION_PARAM) ?? '')),
    { initialValue: '' },
  );

  protected readonly section = computed(
    () => CAMPAIGN_SECTIONS.find((section) => section.key === this.sectionKey()) ?? null,
  );
  protected readonly sectionLabelKey = computed(() => `nav.items.${this.sectionKey()}`);
  protected readonly folderPath = computed(
    () => `${this.campaignService.activeCampaign()?.slug ?? ''}/${this.sectionKey()}`,
  );

  constructor() {
    effect((onCleanup) => {
      const campaign = this.campaignService.activeCampaign();
      if (!campaign) {
        return;
      }

      if (!this.section()) {
        void this.router.navigate(['/campaigns', campaign.slug]);
        return;
      }

      onCleanup(this.toolbarContext.activate({ title: this.sectionLabelKey() }));
    });
  }
}
