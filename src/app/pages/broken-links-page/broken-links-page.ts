import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { toInAppNoteRoute } from '@/components/document-preview/document-preview.markdown';
import type { BrokenLinkDto } from '@/dtos';
import { BrokenLinkActionsService } from '@/services/broken-link-actions.service';
import { DocumentService } from '@/services/document.service';
import { SectionService } from '@/services/section.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
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

/**
 * Every link of a campaign that points to a note or file that does not exist, grouped by note. Shown as the
 * *Broken links* group of the Review page (`embedded`: no toolbar of its own, nothing when there are none).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  /** A campaign, or a compendium system (both list their broken links here). */
  private readonly scope = inject(NoteScopeService).scopeOf(
    getNoteScopeKind(inject(ActivatedRoute)),
  );
  private readonly documentService = inject(DocumentService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly sectionService = inject(SectionService);
  protected readonly brokenLinkActions = inject(BrokenLinkActionsService);
  private loadToken = 0;

  readonly embedded = input(false, { transform: booleanAttribute });

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
        sectionLabel: this.sectionService.labelOfPath(link.sourcePath),
        links: [],
      };
      groups.set(link.sourcePath, { ...group, links: [...group.links, link] });
    }

    return [...groups.values()];
  });

  private readonly handleIndexUpdated = () => {
    const scope = this.scope();
    if (scope) {
      void this.load(scope.rootPath);
    }
  };

  constructor() {
    effect((onCleanup) => {
      const scope = this.scope();
      if (!scope) {
        return;
      }

      if (!this.embedded()) {
        onCleanup(
          this.toolbarContext.activate({
            title: 'links.broken.title',
            titleMode: 'breadcrumb',
            titleBreadcrumbs: [{ label: scope.name, path: scope.routeBase, translate: false }],
          }),
        );
      }
      void this.load(scope.rootPath);
    });

    window.electronAPI?.onIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated);
    inject(DestroyRef).onDestroy(() =>
      window.electronAPI?.offIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated),
    );
  }

  private async load(scopePath: string): Promise<void> {
    const token = ++this.loadToken;
    this.errorMessage.set(null);

    try {
      const rows = await this.documentService.listBrokenLinks(scopePath);
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
