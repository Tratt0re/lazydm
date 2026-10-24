import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  parseVaultFilePath,
  toInAppAssetRoute,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import type { DocumentLinkDto, DocumentLinksDto } from '@/dtos';
import { DocumentService } from '@/services/document.service';
import { SectionService } from '@/services/section.service';
import { ArcTechBadgeComponent } from '@/shared/components/badge';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { onIndexUpdated } from '@/services/ipc-events';

/** A file linked with the note, in either direction. */
interface LinkedFile {
  readonly path: string;
  readonly title: string;
  readonly route: string | null;
  /** An image, sound or PDF rather than a note. */
  readonly isAsset: boolean;
  readonly sectionLabel: string;
  /** The file links to this note. */
  readonly isFrom: boolean;
  /** This note links to the file. */
  readonly isTo: boolean;
  /** Lines of the file that hold the links to this note. */
  readonly snippets: readonly string[];
}

export interface BrokenLinkFixRequest {
  readonly action: 'remove' | 'create';
  readonly link: DocumentLinkDto;
}

function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Side panel of a note: files linked with it (from / to) and its own broken links; follows index updates. */
@Component({
  selector: 'app-document-links-panel',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslatePipe,
    ArcTechBadgeComponent,
    ArcTechIconComponent,
    ArcTechMenuImports,
    ArcTechTooltipImports,
  ],
  templateUrl: './document-links-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full min-h-0 w-80 flex-col overflow-hidden border border-border bg-card p-2',
  },
})
export class AppDocumentLinksPanelComponent {
  private readonly documentService = inject(DocumentService);
  private readonly sectionService = inject(SectionService);
  private loadToken = 0;

  readonly path = input.required<string>();
  /** A broken link of this note should be fixed; the page saves pending edits first. */
  readonly fixBrokenLink = output<BrokenLinkFixRequest>();
  /** How many files this note links to or is linked from, plus its broken links (for the toolbar button). */
  readonly linkCount = output<number>();

  protected readonly links = signal<DocumentLinksDto | null>(null);
  protected readonly brokenLinks = computed(() => this.links()?.brokenLinks ?? []);
  protected readonly linkedFiles = computed<readonly LinkedFile[]>(() => {
    const files = new Map<string, LinkedFile>();
    const getFile = (path: string, title: string | null | undefined): LinkedFile =>
      files.get(path) ?? {
        path,
        title: title || getFileName(path),
        route: toInAppNoteRoute(path) ?? toInAppAssetRoute(path),
        isAsset: !/\.md$/i.test(path),
        sectionLabel: this.sectionService.labelOfPath(path),
        isFrom: false,
        isTo: false,
        snippets: [],
      };

    for (const link of this.links()?.backlinks ?? []) {
      const file = getFile(link.sourcePath, link.sourceTitle);
      files.set(link.sourcePath, {
        ...file,
        isFrom: true,
        snippets: file.snippets.includes(link.snippet)
          ? file.snippets
          : [...file.snippets, link.snippet],
      });
    }

    for (const link of this.links()?.outgoingLinks ?? []) {
      if (link.resolvedPath) {
        files.set(link.resolvedPath, {
          ...getFile(link.resolvedPath, link.resolvedTitle),
          isTo: true,
        });
      }
    }

    return [...files.values()].sort((left, right) => left.title.localeCompare(right.title));
  });
  protected readonly linkedNotes = computed(() =>
    this.linkedFiles().filter((file) => !file.isAsset),
  );
  protected readonly linkedAssets = computed(() =>
    this.linkedFiles().filter((file) => file.isAsset),
  );
  /** Broken links page of the note's campaign or compendium system. */
  protected readonly brokenLinksRoute = computed(() => {
    const location = parseVaultFilePath(this.path());
    return location ? `${location.scopeRoute}/broken-links` : null;
  });

  private readonly handleIndexUpdated = () => void this.load(this.path());

  constructor() {
    effect(() => void this.load(this.path()));

    onIndexUpdated(this.handleIndexUpdated);
  }

  private async load(path: string): Promise<void> {
    const token = ++this.loadToken;
    try {
      const links = await this.documentService.links(path);
      if (token === this.loadToken) {
        this.links.set(links);
        this.linkCount.emit(this.linkedFiles().length + this.brokenLinks().length);
      }
    } catch (error) {
      console.warn('[app] Failed to load note links:', path, error);
    }
  }
}
