import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CampaignActionsService } from '@/services/campaign-actions.service';
import { CampaignService } from '@/services/campaign.service';
import { countReviewItems, ReviewService } from '@/services/review.service';
import { SectionActionsService } from '@/services/section-actions.service';
import { type AppSection, SectionService } from '@/services/section.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-campaign-home-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechMenuImports,
  ],
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
            [arcDescription]="reviewSummary()"
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
                arc-context-menu
                [arcContextMenuTriggerFor]="sectionMenu"
                [style.cursor]="'pointer'"
                class="arc-section-card flex h-full flex-col gap-3 border border-border bg-card p-4 pr-32 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span class="arc-section-card-icon" aria-hidden="true">
                  <arc-icon [arcType]="section.icon" [arcStrokeWidth]="1.25" />
                </span>
                <h2 class="relative text-xs font-bold tracking-[0.08em] uppercase">
                  {{ sectionService.labelOf(section)
                  }}<span class="text-primary" aria-hidden="true">.</span>
                </h2>
                <p class="relative text-sm text-muted-foreground">
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

              <ng-template #sectionMenu>
                <div arc-menu-content class="w-56">
                  <a arc-menu-item [routerLink]="['/campaigns', campaign.slug, section.key]">
                    <arc-icon arcType="arrow-up-right" />
                    {{ 'explorer.openPage' | translate }}
                  </a>
                  <div class="-mx-1 my-1 h-px bg-border-subtle" role="separator"></div>
                  <button type="button" arc-menu-item (click)="editSection(campaign.slug, section)">
                    <arc-icon arcType="pencil" />
                    {{ 'settings.campaignSections.edit.title' | translate }}
                  </button>
                  @if (!section.isSpecial) {
                    <button
                      type="button"
                      arc-menu-item
                      arcType="destructive"
                      (click)="deleteSection(campaign.slug, section)"
                    >
                      <arc-icon arcType="trash" />
                      {{ 'settings.campaignSections.remove.button' | translate }}
                    </button>
                  }
                </div>
              </ng-template>
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
  private readonly campaignActions = inject(CampaignActionsService);
  protected readonly sectionService = inject(SectionService);

  protected readonly campaign = this.campaignService.activeCampaign;

  protected editSection(campaignSlug: string, section: AppSection): void {
    void this.sectionActions.openEditSectionSheet(campaignSlug, section);
  }

  protected deleteSection(campaignSlug: string, section: AppSection): void {
    this.sectionActions.openDeleteSectionSheet(campaignSlug, section);
  }
  protected readonly sections = this.sectionService.visibleCampaignSections;
  /** Things the Review page lists (broken links, misplaced notes, unknown folders…). */
  protected readonly reviewCount = signal(0);
  /** The same things in words ("2 broken links, 1 note outside any section"), the alert's description. */
  protected readonly reviewSummary = signal('');

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
                icon: 'grid-2x2-plus',
                iconOnly: true,
                action: () => void this.sectionActions.openSectionSheet(campaign.slug, null),
              },
              {
                id: 'campaign-more',
                type: 'menu',
                label: 'common.moreActions',
                entries: [
                  {
                    id: 'edit-campaign',
                    label: 'campaigns.overview.edit',
                    icon: 'pencil',
                    action: () => this.campaignActions.openEditSheet(campaign),
                  },
                  {
                    id: 'delete-campaign',
                    label: 'campaigns.overview.delete',
                    icon: 'trash',
                    destructive: true,
                    action: () => void this.campaignActions.openDeleteSheet(campaign),
                  },
                ],
              },
            ],
          }),
        );
        this.reviewService
          .list(campaign.slug)
          .then((review) => {
            this.reviewCount.set(countReviewItems(review));
            this.reviewSummary.set(this.reviewService.describe(review));
          })
          .catch((error: unknown) => console.warn('[app] Failed to load the review:', error));
      }
    });
  }
}
