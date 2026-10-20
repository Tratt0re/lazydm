import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  renderMarkdownToSafeHtml,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { withoutTitleHeading } from '@/components/link-preview-card/link-preview-card.component';
import { DocumentService } from '@/services/document.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

/** Side panel of an encounter: the linked note of an entity, read-only and rendered as in Reading. */
@Component({
  selector: 'app-encounter-note-panel',
  imports: [
    RouterLink,
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ...ArcTechTooltipImports,
  ],
  template: `
    <header class="flex shrink-0 items-center justify-between gap-2 px-2 pb-2">
      <h2 class="min-w-0 truncate font-display text-xl font-extrabold tracking-[0.02em] uppercase">
        {{ title() }}<span class="text-primary" aria-hidden="true">.</span>
      </h2>
      <span class="flex shrink-0 items-center gap-1">
        @if (route(); as route) {
          <a
            [routerLink]="route"
            arc-button
            arcType="ghost"
            arcSize="sm"
            class="size-8"
            [attr.aria-label]="'encounters.note.open' | translate"
            [arcTooltip]="'encounters.note.open' | translate"
          >
            <arc-icon arcType="arrow-up-right" />
          </a>
        }
        <button
          type="button"
          arc-button
          arcType="ghost"
          arcSize="sm"
          class="size-8"
          [attr.aria-label]="'encounters.note.close' | translate"
          [arcTooltip]="'encounters.note.close' | translate"
          (click)="closed.emit()"
        >
          <arc-icon arcType="x" />
        </button>
      </span>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-2">
      @if (hasError()) {
        <p class="text-xs leading-5 text-destructive">
          {{ 'encounters.note.loadError' | translate }}
        </p>
      } @else if (html(); as html) {
        <div class="arc-markdown-body arc-link-preview-body" [innerHTML]="html"></div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full min-h-0 w-80 flex-col overflow-hidden border border-border bg-card p-2',
  },
})
export class AppEncounterNotePanelComponent {
  private readonly documentService = inject(DocumentService);
  private readonly sanitizer = inject(DomSanitizer);
  private loadToken = 0;

  /** Vault path of the note to show. */
  readonly path = input.required<string>();
  readonly closed = output<void>();

  protected readonly title = signal('');
  protected readonly html = signal<SafeHtml | null>(null);
  protected readonly hasError = signal(false);
  protected readonly route = signal<string | null>(null);

  constructor() {
    effect(() => void this.load(this.path()));
  }

  private async load(path: string): Promise<void> {
    const token = ++this.loadToken;
    this.title.set(path.split('/').pop()?.replace(/\.md$/i, '') ?? path);
    this.route.set(toInAppNoteRoute(path));
    this.html.set(null);
    this.hasError.set(false);

    try {
      const document = await this.documentService.read(path);
      if (token === this.loadToken) {
        this.title.set(document.title);
        this.html.set(
          this.sanitizer.bypassSecurityTrustHtml(
            renderMarkdownToSafeHtml(withoutTitleHeading(document.body, document.title), {
              links: document.links,
              sourcePath: document.path,
            }),
          ),
        );
      }
    } catch (error) {
      console.warn('[app] Failed to load the entity note:', path, error);
      if (token === this.loadToken) {
        this.hasError.set(true);
      }
    }
  }
}
