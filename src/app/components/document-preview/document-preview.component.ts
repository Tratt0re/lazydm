import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';

import { AppBrokenLinkMenuComponent } from '@/components/broken-link-menu/broken-link-menu.component';
import type { BrokenLinkFixRequest } from '@/components/document-links-panel/document-links-panel.component';
import type { DocumentLinkDto } from '@/dtos';
import { renderMarkdownToSafeHtml } from './document-preview.markdown';

const BROKEN_LINK_SELECTOR = '[data-broken-raw]';

/**
 * Reading mode for a note: renders its markdown body as sanitized HTML, with `[[wikilinks]]`
 * resolved to in-app note links (or shown as broken) and `![[image.png]]` embeds via the vault
 * asset protocol. Non-image embeds and links outside the campaign/section shape are shown but
 * are not yet clickable — browsing the compendium and other vault-level content comes later.
 */
@Component({
  selector: 'app-document-preview',
  imports: [AppBrokenLinkMenuComponent],
  template: `<div
      class="arc-markdown-body"
      [innerHTML]="renderedHtml()"
      (click)="onContentClick($event)"
      (keydown)="onContentKeyDown($event)"
    ></div>

    <app-broken-link-menu (fixBrokenLink)="fixBrokenLink.emit($event)" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0 w-full overflow-auto border border-input bg-card p-6',
  },
})
export class AppDocumentPreviewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly brokenLinkMenu = viewChild.required(AppBrokenLinkMenuComponent);

  /** A broken `[[link]]` of the preview should be fixed (create the note, or keep only its text). */
  readonly fixBrokenLink = output<BrokenLinkFixRequest>();
  readonly body = input.required<string>();
  readonly links = input<readonly DocumentLinkDto[]>([]);
  readonly sourcePath = input.required<string>();

  protected readonly renderedHtml = computed(() => {
    return this.sanitizer.bypassSecurityTrustHtml(
      renderMarkdownToSafeHtml(this.body(), { links: this.links(), sourcePath: this.sourcePath() }),
    );
  });

  protected onContentKeyDown(event: KeyboardEvent): void {
    const brokenLink = (event.target as HTMLElement).closest<HTMLElement>(BROKEN_LINK_SELECTOR);
    if (brokenLink && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const rect = brokenLink.getBoundingClientRect();
      this.openBrokenLinkMenu(brokenLink, rect.left, rect.bottom);
    }
  }

  protected onContentClick(event: MouseEvent): void {
    const brokenLink = (event.target as HTMLElement).closest<HTMLElement>(BROKEN_LINK_SELECTOR);
    if (brokenLink) {
      event.preventDefault();
      this.openBrokenLinkMenu(brokenLink, event.clientX, event.clientY);
      return;
    }

    const anchor = (event.target as HTMLElement).closest('a[data-route]');
    const route = anchor?.getAttribute('data-route');
    if (!route) {
      return;
    }

    event.preventDefault();
    void this.router.navigateByUrl(route);
  }

  private openBrokenLinkMenu(element: HTMLElement, x: number, y: number): void {
    this.brokenLinkMenu().open(
      element.dataset['brokenRaw'] ?? '',
      element.dataset['brokenTarget'] ?? '',
      x,
      y,
    );
  }
}
