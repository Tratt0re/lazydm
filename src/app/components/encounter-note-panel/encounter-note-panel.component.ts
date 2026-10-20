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
import { TranslatePipe } from '@ngx-translate/core';

import { renderMarkdownToSafeHtml } from '@/components/document-preview/document-preview.markdown';
import { withoutTitleHeading } from '@/components/link-preview-card/link-preview-card.component';
import { DocumentService } from '@/services/document.service';
import { ARC_SHEET_DATA } from '@/shared/components/sheet';

/** Content of the side sheet that shows an entity's linked note, read-only and rendered as in Reading. */
@Component({
  selector: 'app-encounter-note-panel',
  imports: [TranslatePipe],
  template: `
    @if (hasError()) {
      <p class="p-4 text-xs leading-5 text-destructive">{{ 'encounters.note.loadError' | translate }}</p>
    } @else if (html(); as html) {
      <div class="arc-markdown-body arc-link-preview-body p-4" [innerHTML]="html"></div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AppEncounterNotePanelComponent {
  private readonly documentService = inject(DocumentService);
  private readonly sanitizer = inject(DomSanitizer);
  /** The note to show (vault path), handed over by the sheet. */
  private readonly data = inject<{ readonly path: string }>(ARC_SHEET_DATA);
  private loadToken = 0;

  protected readonly html = signal<SafeHtml | null>(null);
  protected readonly hasError = signal(false);

  constructor() {
    void this.load(this.data.path);
  }

  private async load(path: string): Promise<void> {
    const token = ++this.loadToken;

    try {
      const document = await this.documentService.read(path);
      if (token === this.loadToken) {
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
