import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  type TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  renderMarkdownToSafeHtml,
  toAssetUrl,
  toInAppAssetRoute,
} from '@/components/document-preview/document-preview.markdown';
import { DocumentService } from '@/services/document.service';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

const CARD_WIDTH = 420;
const CARD_MAX_HEIGHT = 440;
const CARD_GAP = 8;

/** The note's first line when it is a heading repeating the title: the card's header already shows it. */
export function withoutTitleHeading(body: string, title: string): string {
  const match = /^\s*#{1,6}[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/.exec(body);
  return match && match[1].trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase()
    ? body.slice(match[0].length)
    : body;
}

/** What the card shows: the linked note, loaded when the card opens. */
interface PreviewState {
  readonly path: string;
  readonly route: string;
  readonly title: string;
  readonly html: SafeHtml | null;
  /** Source of the image when the card previews an image instead of a note. */
  readonly imageUrl: string | null;
  readonly hasError: boolean;
}

/**
 * The floating, read-only preview of a linked note (eye button next to a note link, Live and Reading): its
 * title and its body as in Reading, with *Open* (Cmd/Ctrl-click: a new tab). Escape or a click outside
 * closes it. One card at a time; opening another replaces it.
 */
@Component({
  selector: 'app-link-preview-card',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent, ...ArcTechTooltipImports],
  template: `
    <ng-template #card>
      @if (state(); as preview) {
        <section
          class="arc-link-preview-card flex flex-col border-2 border-primary bg-popover text-popover-foreground shadow-overlay outline-none"
          role="dialog"
          tabindex="-1"
          [attr.aria-label]="preview.title"
          [style.width.px]="cardWidth"
          [style.max-height.px]="cardMaxHeight"
        >
          <header class="relative shrink-0 px-4 pt-3 pb-4">
            <div class="flex items-center justify-between gap-3">
              <h2
                class="min-w-0 truncate font-display text-xl font-extrabold tracking-[0.02em] uppercase"
              >
                {{ preview.title }}<span class="text-primary" aria-hidden="true">.</span>
              </h2>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  arc-button
                  arcType="ghost"
                  class="size-8"
                  [attr.aria-label]="'document.linkPreview.open' | translate"
                  arcPosition="bottom"
                  [arcTooltip]="'document.linkPreview.open' | translate"
                  (click)="open($event)"
                >
                  <arc-icon arcType="arrow-up-right" />
                </button>
                <button
                  type="button"
                  arc-button
                  arcType="ghost"
                  class="size-8"
                  [attr.aria-label]="'document.linkPreview.close' | translate"
                  arcPosition="bottom"
                  [arcTooltip]="'document.linkPreview.close' | translate"
                  (click)="close()"
                >
                  <arc-icon arcType="x" />
                </button>
              </div>
            </div>
            <div
              class="arc-ornament-rule absolute inset-x-4 bottom-0 translate-y-1/2"
              aria-hidden="true"
            >
              <span>◇</span>
            </div>
          </header>

          <div class="min-h-0 overflow-auto px-4 pt-4 pb-4">
            @if (preview.hasError) {
              <p class="text-sm text-destructive">
                {{
                  (preview.imageUrl ? 'campaigns.assets.loadError' : 'document.linkPreview.loadError')
                    | translate
                }}
              </p>
            } @else if (preview.imageUrl) {
              <img
                class="mx-auto block max-h-[320px] max-w-full border border-border object-contain"
                [src]="preview.imageUrl"
                [alt]="preview.title"
                (error)="onImageError()"
              />
            } @else if (preview.html) {
              <div class="arc-markdown-body arc-link-preview-body" [innerHTML]="preview.html"></div>
            } @else {
              <p class="font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                {{ 'document.linkPreview.loading' | translate }}
              </p>
            }
          </div>
        </section>
      }
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLinkPreviewCardComponent {
  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly documentService = inject(DocumentService);
  private readonly workspace = inject(WorkspaceService);
  private readonly cardTemplate = viewChild.required<TemplateRef<unknown>>('card');
  private overlayRef: OverlayRef | null = null;
  private loadToken = 0;

  protected readonly cardWidth = CARD_WIDTH;
  protected readonly cardMaxHeight = CARD_MAX_HEIGHT;
  protected readonly state = signal<PreviewState | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.close());
  }

  /** Whether the card shows the note at `path` now (its eye button then closes it instead). */
  isShowing(path: string): boolean {
    return this.overlayRef !== null && this.state()?.path === path;
  }

  /** Opens the card below (or above) `anchor` for the note at `path` (vault path), shown at `route`. */
  async show(anchor: Element, path: string, route: string): Promise<void> {
    this.close();
    const token = ++this.loadToken;
    const fallbackTitle = path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
    this.state.set({
      path,
      route,
      title: fallbackTitle,
      html: null,
      imageUrl: null,
      hasError: false,
    });

    const overlayRef = this.attach(anchor);

    try {
      const document = await this.documentService.read(path);
      if (token !== this.loadToken) {
        return;
      }
      const title = document.title || fallbackTitle;
      const html = renderMarkdownToSafeHtml(withoutTitleHeading(document.body, title), {
        links: document.links,
        sourcePath: document.path,
      });
      this.state.set({
        path,
        route,
        title,
        html: this.sanitizer.bypassSecurityTrustHtml(html),
        imageUrl: null,
        hasError: false,
      });
    } catch (error) {
      console.warn('[app] Failed to load the link preview:', path, error);
      if (token === this.loadToken) {
        this.state.update((state) => (state ? { ...state, hasError: true } : state));
      }
    }

    // The card grows once the note is in: keep it within the window.
    requestAnimationFrame(() => overlayRef.updatePosition());
  }

  /** Opens the card below (or above) `anchor` for the image at `path` (vault path): the image itself. */
  showImage(anchor: Element, path: string): void {
    this.close();
    const route = toInAppAssetRoute(path) ?? '';
    this.state.set({
      path,
      route,
      title: path.split('/').pop() ?? path,
      html: null,
      imageUrl: toAssetUrl(path),
      hasError: false,
    });
    this.attach(anchor);
  }

  protected onImageError(): void {
    this.state.update((state) => (state ? { ...state, hasError: true } : state));
  }

  /** Creates the overlay under (or over) `anchor` with the card in it; returns it. */
  private attach(anchor: Element): OverlayRef {
    const overlayRef = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(new ElementRef(anchor))
        .withPositions([
          {
            originX: 'start',
            originY: 'bottom',
            overlayX: 'start',
            overlayY: 'top',
            offsetY: CARD_GAP,
          },
          {
            originX: 'start',
            originY: 'top',
            overlayX: 'start',
            overlayY: 'bottom',
            offsetY: -CARD_GAP,
          },
        ])
        .withPush(true)
        .withViewportMargin(12),
      scrollStrategy: this.overlay.scrollStrategies.close(),
    });
    this.overlayRef = overlayRef;
    overlayRef.attach(new TemplatePortal(this.cardTemplate(), this.viewContainerRef));
    overlayRef.outsidePointerEvents().subscribe((event) => {
      // The eye button toggles the card itself.
      if (!(event.target as Element | null)?.closest?.('[data-link-preview]')) {
        this.close();
      }
    });
    overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });

    return overlayRef;
  }

  close(): void {
    this.loadToken++;
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.state.set(null);
  }

  /** *Open*: the note in this tab, or in a new background tab with Cmd/Ctrl. */
  protected open(event: MouseEvent): void {
    const route = this.state()?.route;
    if (!route) {
      return;
    }

    this.close();
    if ((event.metaKey || event.ctrlKey) && this.workspace.isCampaignUrl(route)) {
      void this.workspace.openTab(route, { background: true });
    } else {
      void this.router.navigateByUrl(route);
    }
  }
}
