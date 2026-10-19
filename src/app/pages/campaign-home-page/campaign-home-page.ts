import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CampaignService } from '@/services/campaign.service';
import { countReviewItems, ReviewService } from '@/services/review.service';
import { SectionActionsService } from '@/services/section-actions.service';
import { SectionService } from '@/services/section.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';

@Component({
  selector: 'app-campaign-home-page',
  imports: [RouterLink, TranslatePipe, ArcTechAlertComponent, ArcTechButtonComponent, ArcTechIconComponent],
  template: `
    @if (campaign(); as campaign) {
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        @if (campaign.description) {
          <p class="max-w-3xl text-sm text-muted-foreground">{{ campaign.description }}</p>
        }

        @if (reviewCount() > 0) {
          <arc-alert
            arcType="destructive"
            arcIcon="unlink"
            [arcTitle]="'review.alertTitle' | translate: { count: reviewCount() }"
            [arcDescription]="'review.alertDescription' | translate"
          >
            <a
              arc-button
              arcType="outline"
              arcSize="sm"
              class="shrink-0"
              [routerLink]="['/campaigns', campaign.slug, 'review']"
            >
              {{ 'review.open' | translate }}
            </a>
          </arc-alert>
        }

        <ul class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          @for (section of sections(); track section.key) {
            <li>
              <a
                [routerLink]="['/campaigns', campaign.slug, section.key]"
                class="flex h-full flex-col gap-3 border border-border bg-card p-4 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <arc-icon [arcType]="section.icon" class="size-6 text-primary" />
                <h2 class="text-xs font-bold tracking-[0.08em] uppercase">
                  {{ sectionService.labelOf(section) }}<span class="text-primary" aria-hidden="true">.</span>
                </h2>
                <p class="text-sm text-muted-foreground">
                  @if (section.description) {
                    {{ section.description }}
                  } @else {
                    {{
                      (section.isCustom
                        ? 'campaigns.sections.customDescription'
                        : 'campaigns.sections.' + section.key + '.description'
                      ) | translate
                    }}
                  }
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
  private readonly reviewService = inject(ReviewService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly sectionActions = inject(SectionActionsService);
  protected readonly sectionService = inject(SectionService);

  protected readonly campaign = this.campaignService.activeCampaign;
  protected readonly sections = this.sectionService.visibleCampaignSections;
  /** Things the Review page lists (broken links, misplaced notes, unknown folders…). */
  protected readonly reviewCount = signal(0);

  constructor() {
    effect((onCleanup) => {
      const campaign = this.campaign();
      if (campaign) {
        onCleanup(
          this.toolbarContext.activate({
            title: campaign.name,
            itemActions: [
              {
                id: 'new-section',
                label: 'settings.campaignSections.add',
                icon: 'plus',
                action: () => void this.sectionActions.openSectionSheet(campaign.slug, null),
              },
            ],
          }),
        );
        this.reviewService
          .list(campaign.slug)
          .then((review) => this.reviewCount.set(countReviewItems(review)))
          .catch((error: unknown) => console.warn('[app] Failed to load the review:', error));
      }
    });
  }
}
