import { Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CAMPAIGN_SECTIONS } from '@/config/menu.config';
import { CampaignService } from '@/services/campaign.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechIconComponent } from '@/shared/components/icon';

@Component({
  selector: 'app-campaign-home-page',
  imports: [RouterLink, TranslatePipe, ArcTechIconComponent],
  template: `
    @if (campaign(); as campaign) {
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        @if (campaign.description) {
          <p class="max-w-3xl text-sm text-muted-foreground">{{ campaign.description }}</p>
        }

        <ul class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          @for (section of sections; track section.key) {
            <li>
              <a
                [routerLink]="['/campaigns', campaign.slug, section.key]"
                class="flex h-full flex-col gap-3 border border-border bg-card p-4 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <arc-icon [arcType]="section.icon" class="size-6 text-primary" />
                <h2 class="text-xs font-bold tracking-[0.08em] uppercase">
                  {{ 'nav.items.' + section.key | translate }}<span class="text-primary" aria-hidden="true">.</span>
                </h2>
                <p class="text-sm text-muted-foreground">
                  {{ 'campaigns.sections.' + section.key + '.description' | translate }}
                </p>
              </a>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class CampaignHomePage {
  private readonly campaignService = inject(CampaignService);
  private readonly toolbarContext = inject(ToolbarContextService);

  protected readonly campaign = this.campaignService.activeCampaign;
  protected readonly sections = CAMPAIGN_SECTIONS;

  constructor() {
    effect((onCleanup) => {
      const campaign = this.campaign();
      if (campaign) {
        onCleanup(this.toolbarContext.activate({ title: campaign.name }));
      }
    });
  }
}
