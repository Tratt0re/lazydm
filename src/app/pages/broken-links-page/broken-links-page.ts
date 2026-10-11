import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { toInAppNoteRoute } from '@/components/document-preview/document-preview.markdown';
import type { BrokenLinkDto } from '@/dtos';
import { BrokenLinkActionsService } from '@/services/broken-link-actions.service';
import { CampaignService } from '@/services/campaign.service';
import { DocumentService } from '@/services/document.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';

export const BROKEN_LINKS_ROUTE_SEGMENT = 'broken-links';

const INDEX_UPDATED_EVENT = 'index:updated';

interface BrokenLinkGroup {
  readonly sourcePath: string;
  readonly title: string;
  readonly route: string | null;
  readonly sectionLabel: string;
  readonly links: readonly BrokenLinkDto[];
}

/** Every link of a campaign that points to a note or file that does not exist, grouped by note. */
@Component({
  selector: 'app-broken-links-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechEmptyComponent,
    ArcTechIconComponent,
    ArcTechMenuImports,
  ],
  templateUrl: './broken-links-page.html',
})
export class BrokenLinksPage {
  private readonly campaignService = inject(CampaignService);
  private readonly documentService = inject(DocumentService);
  private readonly toolbarContext = inject(ToolbarContextService);
  protected readonly brokenLinkActions = inject(BrokenLinkActionsService);
  private loadToken = 0;

  protected readonly rows = signal<readonly BrokenLinkDto[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly groups = computed<readonly BrokenLinkGroup[]>(() => {
    const groups = new Map<string, BrokenLinkGroup>();
    for (const link of this.rows()) {
      const group = groups.get(link.sourcePath) ?? {
        sourcePath: link.sourcePath,
        title: link.sourceTitle ?? link.sourcePath.split('/').pop() ?? link.sourcePath,
        route: toInAppNoteRoute(link.sourcePath),
        sectionLabel: `nav.items.${link.sourcePath.split('/')[1] ?? ''}`,
        links: [],
      };
      groups.set(link.sourcePath, { ...group, links: [...group.links, link] });
    }

    return [...groups.values()];
  });

  private readonly handleIndexUpdated = () => {
    const campaign = this.campaignService.activeCampaign();
    if (campaign) {
      void this.load(campaign.slug);
    }
  };

  constructor() {
    effect((onCleanup) => {
      const campaign = this.campaignService.activeCampaign();
      if (!campaign) {
        return;
      }

      onCleanup(
        this.toolbarContext.activate({
          title: 'links.broken.title',
          titleMode: 'breadcrumb',
          titleBreadcrumbs: [
            { label: campaign.name, path: `/campaigns/${campaign.slug}`, translate: false },
          ],
        }),
      );
      void this.load(campaign.slug);
    });

    window.electronAPI?.onIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated);
    inject(DestroyRef).onDestroy(() =>
      window.electronAPI?.offIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated),
    );
  }

  private async load(campaignSlug: string): Promise<void> {
    const token = ++this.loadToken;
    this.errorMessage.set(null);

    try {
      const rows = await this.documentService.listBrokenLinks(campaignSlug);
      if (token === this.loadToken) {
        this.rows.set(rows);
      }
    } catch (error) {
      if (token === this.loadToken) {
        this.errorMessage.set(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (token === this.loadToken) {
        this.isLoading.set(false);
      }
    }
  }
}
