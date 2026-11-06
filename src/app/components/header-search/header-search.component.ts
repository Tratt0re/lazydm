import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { toInAppNoteRoute } from '@/components/document-preview/document-preview.markdown';
import type { SearchResultDto } from '@/dtos';
import { CampaignService } from '@/services/campaign.service';
import { SearchService } from '@/services/search.service';
import { SectionService } from '@/services/section.service';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { WorkspaceService } from '@/services/workspace.service';
import { getLinkOpenMode } from '@/shared/utils/link-open-mode';
import { toDisplayPath } from '@/shared/utils/vault-path';

/** Milliseconds to wait after the user stops typing before firing a search. */
const DEBOUNCE_MS = 150;

/** A piece of a result snippet: matched words are `isMatch`. */
interface SnippetPart {
  readonly text: string;
  readonly isMatch: boolean;
}

/** A search result that opens a note, with its route and its snippet split for highlighting. */
interface SearchHit extends SearchResultDto {
  readonly route: string;
  /** Display name of the section the note's folder is, null outside a section. */
  readonly sectionLabel: string | null;
  /** The path shown under the title: the campaign folder left out, the rest as it is in the Codex. */
  readonly displayPath: string;
  readonly snippetParts: readonly SnippetPart[];
}

/** Splits an FTS5 snippet on its `<m>…</m>` markers (rendered as text, never as HTML). */
function toSnippetParts(snippet: string): readonly SnippetPart[] {
  return snippet
    .split(/(<m>[\s\S]*?<\/m>)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('<m>') && part.endsWith('</m>')
        ? { text: part.slice(3, -4), isMatch: true }
        : { text: part, isMatch: false },
    );
}

/**
 * Floating search bar in the header. Searches the active campaign (titles + full text, FTS5).
 * Cmd/Ctrl+K focuses it from anywhere on the page.
 * Arrow keys navigate the results; Enter opens the highlighted row; Escape closes.
 */
@Component({
  selector: 'app-header-search',
  standalone: true,
  imports: [TranslatePipe, ArcTechIconComponent],
  templateUrl: './header-search.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderSearchComponent {
  @ViewChild('searchInput') inputRef!: ElementRef<HTMLInputElement>;

  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchHit[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly isOpen = signal(false);
  protected readonly activeIndex = signal(-1);

  private readonly searchService = inject(SearchService);
  private readonly campaignService = inject(CampaignService);
  private readonly sectionService = inject(SectionService);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceService);
  protected readonly shortcutLabel = window.electronAPI?.platform === 'darwin' ? '⌘K' : 'Ctrl K';
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.open();
      }
    };
    document.addEventListener('keydown', handler);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', handler));
  }

  protected onInput(e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    this.query.set(value);
    this.activeIndex.set(-1);
    clearTimeout(this.debounceTimer);

    if (!value.trim()) {
      this.results.set([]);
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.debounceTimer = setTimeout(() => void this.runSearch(value.trim()), DEBOUNCE_MS);
  }

  protected onKeydown(e: KeyboardEvent): void {
    const rows = this.results();
    if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIndex.update((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIndex.update((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      const row = rows[this.activeIndex()];
      if (row) {
        e.preventDefault();
        this.navigate(row);
      }
    }
  }

  /** The dropdown keeps the focus in the input (mousedown prevented), so a blur means leaving the search. */
  protected onBlur(): void {
    this.close();
  }

  protected navigate(hit: SearchHit, event?: MouseEvent): void {
    const mode = event && this.workspace.isCampaignUrl(hit.route) ? getLinkOpenMode(event) : null;
    if (mode === 'side') {
      void this.workspace.openToSide(hit.route);
    } else if (mode === 'tab') {
      void this.workspace.openTab(hit.route, { background: true });
    } else {
      void this.router.navigateByUrl(hit.route);
    }
    this.close();
  }

  protected close(): void {
    clearTimeout(this.debounceTimer);
    this.isOpen.set(false);
    this.query.set('');
    this.results.set([]);
    this.activeIndex.set(-1);
    this.inputRef?.nativeElement.blur();
  }

  private open(): void {
    this.isOpen.set(true);
    // Wait one tick for the input to appear if it was hidden.
    setTimeout(() => this.inputRef?.nativeElement.focus(), 0);
  }

  private async runSearch(term: string): Promise<void> {
    const campaign = this.campaignService.activeCampaign()?.slug;
    if (!campaign) {
      this.results.set([]);
      this.isLoading.set(false);
      return;
    }
    try {
      const rows = await this.searchService.query(campaign, term);
      if (this.query().trim() !== term) {
        return; // a newer search is on its way
      }
      const hits: SearchHit[] = [];
      for (const row of rows) {
        const route = toInAppNoteRoute(row.path);
        if (route) {
          hits.push({
            ...row,
            route,
            sectionLabel: row.type ? this.sectionService.labelOfPath(row.path) : null,
            displayPath: toDisplayPath(row.path),
            snippetParts: toSnippetParts(row.snippet ?? ''),
          });
        }
      }
      this.results.set(hits);
    } catch {
      this.results.set([]);
    } finally {
      if (this.query().trim() === term) {
        this.isLoading.set(false);
      }
    }
  }
}
