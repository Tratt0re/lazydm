import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import DOMPurify from 'dompurify';

import type { BrokenLinkFixRequest } from '@/components/document-links-panel/document-links-panel.component';
import type { DocumentLinkDto } from '@/dtos';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { renderMarkdownBody } from './document-preview.markdown';

const BROKEN_LINK_SELECTOR = '[data-broken-raw]';

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
  imports: [TranslatePipe, ArcTechIconComponent, ArcTechMenuImports],
  template: `<div
      class="arc-markdown-body"
      [innerHTML]="renderedHtml()"
      (click)="onContentClick($event)"
      (keydown)="onContentKeyDown($event)"
    ></div>

    <span
      class="hidden"
      arc-context-menu
      [arcContextMenuTriggerFor]="brokenLinkMenu"
      aria-hidden="true"
    ></span>

    <ng-template #brokenLinkMenu>
      <div arc-menu-content class="w-56">
        <button type="button" arc-menu-item (click)="emitFix('create')">
          <arc-icon arcType="plus" />
          {{ 'links.actions.create' | translate }}
        </button>
        <button type="button" arc-menu-item (click)="emitFix('remove')">
          <arc-icon arcType="unlink" />
          {{ 'links.actions.remove' | translate }}
        </button>
      </div>
    </ng-template>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0 w-full overflow-auto border border-input bg-card p-6',
  },
})
export class AppDocumentPreviewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly brokenLinkMenuTrigger = viewChild.required(CdkContextMenuTrigger);
  private readonly menuLink = signal<DocumentLinkDto | null>(null);

  /** A broken `[[link]]` of the preview should be fixed (create the note, or keep only its text). */
  readonly fixBrokenLink = output<BrokenLinkFixRequest>();
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

  protected emitFix(action: BrokenLinkFixRequest['action']): void {
    const link = this.menuLink();
    if (link) {
      this.fixBrokenLink.emit({ action, link });
    }
  }

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
    this.menuLink.set({
      raw: element.dataset['brokenRaw'] ?? '',
      kind: 'wikilink',
      targetName: element.dataset['brokenTarget'] ?? '',
      heading: null,
      resolvedPath: null,
    });

    const trigger = this.brokenLinkMenuTrigger();
    trigger.close();
    trigger.open({ x, y });
  }
}
