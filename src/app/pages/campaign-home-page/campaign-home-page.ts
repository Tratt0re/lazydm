import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CampaignActionsService } from '@/services/campaign-actions.service';
import { CampaignService } from '@/services/campaign.service';
import { FileActionsService } from '@/services/file-actions.service';
import { countReviewItems, ReviewService } from '@/services/review.service';
import { SectionActionsService } from '@/services/section-actions.service';
import { type AppSection, SectionService } from '@/services/section.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
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
    ArcTechEmptyComponent,
    ArcTechIconComponent,
    ArcTechMenuImports,
  ],
  template: `
    @if (campaign(); as campaign) {
      <div class="flex w-full max-w-5xl flex-col gap-6 py-6">
        @if (campaign.description) {
          <p class="max-w-3xl text-sm text-muted-foreground">{{ campaign.description }}</p>
        }

        @if (reviewCount() > 0) {
          <arc-alert
            arcType="warning"
            arcIcon="unlink"
            [arcTitle]="'review.alertTitle' | translate"
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

        @if (usedSections().length === 0) {
          <!-- A new campaign: one way in instead of a wall of empty tiles. -->
          <arc-empty
            class="border border-dashed border-border bg-card/60"
            arcIcon="book-open"
            [arcTitle]="'campaigns.newAnything.startTitle' | translate"
            [arcDescription]="'campaigns.newAnything.startDescription' | translate"
            [arcActions]="[startAction]"
          />
          <ng-template #startAction>
            <button arc-button type="button" (click)="openNew(campaign.slug)">
              <arc-icon arcType="plus" />
              {{ 'campaigns.newAnything.button' | translate }}
            </button>
          </ng-template>
        }

        <ul class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          @for (section of usedSections(); track section.key) {
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

        @if (unusedSections().length > 0) {
          <!-- Sections with nothing in them yet stay out of the way until they are needed. -->
          <div class="flex flex-col gap-2">
            <button
              type="button"
              class="flex w-fit cursor-pointer items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              [attr.aria-expanded]="showUnused()"
              (click)="showUnused.set(!showUnused())"
            >
              <arc-icon
                arcType="chevron-right"
                class="size-3.5 transition-transform duration-150"
                [class.rotate-90]="showUnused()"
                aria-hidden="true"
              />
              {{ 'campaigns.newAnything.moreSections' | translate }} ({{ unusedSections().length }})
            </button>
            @if (showUnused()) {
              <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                @for (section of unusedSections(); track section.key) {
                  <li>
                    <a
                      [routerLink]="['/campaigns', campaign.slug, section.key]"
                      class="flex items-center gap-3 border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <arc-icon
                        [arcType]="section.icon"
                        class="size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span class="truncate font-semibold">{{
                        sectionService.labelOf(section)
                      }}</span>
                    </a>
                  </li>
                }
              </ul>
            }
          </div>
        }
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
  private readonly fileActions = inject(FileActionsService);
  protected readonly sectionService = inject(SectionService);

  protected readonly campaign = this.campaignService.activeCampaign;

  protected editSection(campaignSlug: string, section: AppSection): void {
    void this.sectionActions.openEditSectionSheet(campaignSlug, section);
  }

  protected deleteSection(campaignSlug: string, section: AppSection): void {
    this.sectionActions.openDeleteSectionSheet(campaignSlug, section);
  }
  protected readonly sections = this.sectionService.visibleCampaignSections;
  /** Sections with something in them get a tile; the rest wait behind *More sections*. */
  protected readonly usedSections = computed(() =>
    this.sections().filter((section) => section.fileCount > 0),
  );
  protected readonly unusedSections = computed(() =>
    this.sections().filter((section) => section.fileCount === 0),
  );
  protected readonly showUnused = signal(false);

  /** *New…* of the toolbar and of the start card: pick a section, then its own form. */
  protected openNew(campaignSlug: string): void {
    this.fileActions.openCreateAnythingSheet(
      campaignSlug,
      this.sections().map((section) => ({
        key: section.key,
        type: section.type,
        isSpecial: section.isSpecial,
        label: this.sectionService.labelOf(section),
        icon: section.icon,
      })),
    );
  }
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
                id: 'new-anything',
                label: 'campaigns.newAnything.button',
                icon: 'plus',
                action: () => this.openNew(campaign.slug),
              },
              {
                id: 'campaign-more',
                type: 'menu',
                label: 'common.moreActions',
                entries: [
                  {
                    id: 'new-section',
                    label: 'settings.campaignSections.add',
                    icon: 'grid-2x2-plus',
                    action: () => void this.sectionActions.openSectionSheet(campaign.slug, null),
                  },
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
