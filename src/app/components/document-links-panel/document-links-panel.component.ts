import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { toInAppNoteRoute } from '@/components/document-preview/document-preview.markdown';
import type { DocumentLinksDto } from '@/dtos';
import { DocumentService } from '@/services/document.service';
import { ArcTechIconComponent } from '@/shared/components/icon';

const INDEX_UPDATED_EVENT = 'index:updated';

interface BacklinkGroup {
  readonly sourcePath: string;
  readonly title: string;
  readonly route: string | null;
  readonly sectionLabel: string;
  readonly snippets: readonly string[];
}

/** Side panel of a note: the notes linking to it and its own broken links; follows index updates. */
@Component({
  selector: 'app-document-links-panel',
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, ArcTechIconComponent],
  templateUrl: './document-links-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex h-full min-h-0 w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card',
  },
})
export class AppDocumentLinksPanelComponent {
  private readonly documentService = inject(DocumentService);
  private loadToken = 0;

  readonly path = input.required<string>();

  protected readonly links = signal<DocumentLinksDto | null>(null);
  protected readonly backlinkCount = computed(() => this.links()?.backlinks.length ?? 0);
  protected readonly brokenLinks = computed(() => this.links()?.brokenLinks ?? []);
  protected readonly backlinkGroups = computed<readonly BacklinkGroup[]>(() => {
    const groups = new Map<string, BacklinkGroup>();
    for (const link of this.links()?.backlinks ?? []) {
      const group = groups.get(link.sourcePath) ?? {
        sourcePath: link.sourcePath,
        title: link.sourceTitle ?? link.sourcePath.split('/').pop() ?? link.sourcePath,
        route: toInAppNoteRoute(link.sourcePath),
        sectionLabel: `nav.items.${link.sourcePath.split('/')[1] ?? ''}`,
        snippets: [],
      };
      groups.set(link.sourcePath, {
        ...group,
        snippets: group.snippets.includes(link.snippet)
          ? group.snippets
          : [...group.snippets, link.snippet],
      });
    }

    return [...groups.values()];
  });
  protected readonly brokenLinksRoute = computed(
    () => `/campaigns/${this.path().split('/')[0]}/broken-links`,
  );

  private readonly handleIndexUpdated = () => void this.load(this.path());

  constructor() {
    effect(() => void this.load(this.path()));

    window.electronAPI?.onIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated);
    inject(DestroyRef).onDestroy(() =>
      window.electronAPI?.offIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated),
    );
  }

  private async load(path: string): Promise<void> {
    const token = ++this.loadToken;
    try {
      const links = await this.documentService.links(path);
      if (token === this.loadToken) {
        this.links.set(links);
      }
    } catch (error) {
      console.warn('[app] Failed to load note links:', path, error);
    }
  }
}
