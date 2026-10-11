import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import DOMPurify from 'dompurify';

import type { DocumentLinkDto } from '@/dtos';
import { renderMarkdownBody } from './document-preview.markdown';

const SANITIZE_OPTIONS: { readonly ADD_TAGS: string[]; readonly ADD_ATTR: string[] } = {
  ADD_TAGS: ['img'],
  ADD_ATTR: ['loading', 'target', 'rel'],
};

/**
 * Reading mode for a note: renders its markdown body as sanitized HTML, with `[[wikilinks]]`
 * resolved to in-app note links (or shown as broken) and `![[image.png]]` embeds via the vault
 * asset protocol. Non-image embeds and links outside the campaign/section shape are shown but
 * are not yet clickable — browsing the compendium and other vault-level content comes later.
 */
@Component({
  selector: 'app-document-preview',
  template: `<div
    class="arc-markdown-body"
    [innerHTML]="renderedHtml()"
    (click)="onContentClick($event)"
  ></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0 w-full overflow-auto border border-input bg-card p-6',
  },
})
export class AppDocumentPreviewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);

  readonly body = input.required<string>();
  readonly links = input<readonly DocumentLinkDto[]>([]);
  readonly sourcePath = input.required<string>();

  protected readonly renderedHtml = computed(() => {
    const html = renderMarkdownBody(this.body(), {
      links: this.links(),
      sourcePath: this.sourcePath(),
    });
    return this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(html, SANITIZE_OPTIONS));
  });

  protected onContentClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a[data-route]');
    const route = anchor?.getAttribute('data-route');
    if (!route) {
      return;
    }

    event.preventDefault();
    void this.router.navigateByUrl(route);
  }
}
