import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';

import { AppBrokenLinkMenuComponent } from '@/components/broken-link-menu/broken-link-menu.component';
import {
  CODE_MAP_WIDTH,
  CodeMap,
  type CodeMapBlock,
  type CodeMapContent,
  type CodeMapHeading,
  type CodeMapKind,
} from '@/components/code-map/code-map';
import type { BrokenLinkFixRequest } from '@/components/document-links-panel/document-links-panel.component';
import type { DocumentLinkDto } from '@/dtos';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import type { CodeEditorAssetAction } from '@/components/code-editor/code-editor.component';
import {
  attachLinkPreviewHover,
  type LinkPreviewRequest,
} from '@/components/link-preview-card/link-preview-hover';
import type { NoteAudioProgress } from '@/services/note-audio.service';
import {
  type MediaEmbedLabels,
  renderMarkdownToSafeHtml,
  syncAudioRow,
} from './document-preview.markdown';

const BROKEN_LINK_SELECTOR = '[data-broken-raw]';
const ASSET_ACTION_SELECTOR = '[data-asset-action]';
/** Padding of the reading pane on its right when the code map takes room there (p-6 + the map). */
const CODE_MAP_PADDING = 24 + CODE_MAP_WIDTH;
/** The map of a narrow host (a side sheet) is this wide, in px. */
const CODE_MAP_COMPACT_WIDTH = 64;

/** Map kind of a rendered block (headings are handled apart, as labels). */
function readingKindOf(element: Element): CodeMapKind {
  const tag = element.tagName;
  if (tag === 'PRE') {
    return 'code';
  }
  if (tag === 'BLOCKQUOTE' || element.classList.contains('arc-callout')) {
    return 'quote';
  }
  if (tag === 'TABLE' || element.querySelector(':scope > table')) {
    return 'table';
  }
  if (tag === 'HR') {
    return 'rule';
  }
  if (tag === 'IMG' || (element.querySelector('img') && !element.textContent?.trim())) {
    return 'embed';
  }
  return /^H[4-6]$/.test(tag) ? 'heading' : 'text';
}

/**
 * Reading mode for a note: renders its markdown body as sanitized HTML, with `[[wikilinks]]`
 * resolved to in-app note links (or shown as broken) and `![[image.png]]` embeds via the vault
 * asset protocol. Non-image embeds and links outside the campaign/section shape are shown but
 * are not yet clickable — browsing the compendium and other vault-level content comes later. With the code map
 * on (Settings → Editor), the map of the rendered note sits right before the pane's scrollbar.
 */
@Component({
  selector: 'app-document-preview',
  imports: [AppBrokenLinkMenuComponent],
  template: `<div
      #scroller
      class="h-full overflow-auto p-6"
      [style.padding-right.px]="isCodeMapOn() ? codeMapPadding() : null"
    >
      <div
        #body
        class="arc-markdown-body"
        [innerHTML]="renderedHtml()"
        (click)="onContentClick($event)"
        (input)="onContentInput($event)"
        (keydown)="onContentKeyDown($event)"
      ></div>
    </div>

    <app-broken-link-menu (fixBrokenLink)="fixBrokenLink.emit($event)" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block h-full min-h-0 w-full overflow-hidden border border-input bg-card',
    '[style.--codemap-width.px]': 'isCompact() ? 64 : null',
  },
})
export class AppDocumentPreviewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly brokenLinkMenu = viewChild.required(AppBrokenLinkMenuComponent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly bodyElement = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly editorSettings = inject(LocalPreferencesService).editorSettings;
  protected readonly isCodeMapOn = computed(() => this.editorSettings().codeMap);
  /** A narrow host (the note sheet) gets a slimmer map and less padding. */
  readonly isCompact = input(false);
  protected readonly codeMapPadding = computed(() =>
    this.isCompact() ? 16 + CODE_MAP_COMPACT_WIDTH : CODE_MAP_PADDING,
  );
  private codeMap: CodeMap | null = null;
  private codeMapObserver: ResizeObserver | null = null;
  private codeMapRequest = 0;
  /** Headings shown as map labels, by label id. */
  private codeMapHeadings: HTMLElement[] = [];

  /** A broken `[[link]]` of the preview should be fixed (create the note, or keep only its text). */
  readonly fixBrokenLink = output<BrokenLinkFixRequest>();
  readonly body = input.required<string>();
  readonly links = input<readonly DocumentLinkDto[]>([]);
  readonly sourcePath = input.required<string>();
  /** The note's audio playing now, shown as *stop* on its row. */
  readonly playingAudioPath = input<string | null>(null);
  readonly audioProgress = input<NoteAudioProgress | undefined>(undefined);
  readonly audioVolume = input<number>(1);
  /** Lengths of the note's audio files (seconds, by path), shown before they play. */
  readonly audioDurations = input<ReadonlyMap<string, number>>(new Map());
  readonly mediaLabels = input<MediaEmbedLabels | undefined>(undefined);
  /** Play/stop an embedded audio, open a PDF, or set the volume. */
  readonly assetAction = output<CodeEditorAssetAction>();
  /** Accessible name of the eye button shown on hovered note links. */
  readonly linkPreviewLabel = input('');
  /** Accessible name of the eye button shown on hovered images. */
  readonly imagePreviewLabel = input('');
  /** The eye button of a note link was pressed: show its preview card. */
  readonly linkPreview = output<LinkPreviewRequest>();

  protected readonly renderedHtml = computed(() => {
    return this.sanitizer.bypassSecurityTrustHtml(
      renderMarkdownToSafeHtml(this.body(), {
        links: this.links(),
        sourcePath: this.sourcePath(),
        mediaLabels: this.mediaLabels(),
      }),
    );
  });

  constructor() {
    // After each render: the code map follows the setting and the rendered note.
    afterRenderEffect(() => {
      const isOn = this.isCodeMapOn();
      this.renderedHtml();
      this.syncCodeMap(isOn);
    });
    inject(DestroyRef).onDestroy(() => this.syncCodeMap(false));

    afterNextRender(() => {
      const detach = attachLinkPreviewHover(
        this.scroller().nativeElement,
        () => this.linkPreviewLabel(),
        (request) => this.linkPreview.emit(request),
        () => this.imagePreviewLabel(),
      );
      this.destroyRef.onDestroy(detach);
    });

    // Sync playing state, time and volume onto the rendered rows without re-rendering the note.
    afterRenderEffect(() => {
      this.renderedHtml();
      const playingPath = this.playingAudioPath();
      const progress = this.audioProgress();
      const volume = this.audioVolume();
      const durations = this.audioDurations();
      for (const row of this.bodyElement().nativeElement.querySelectorAll<HTMLElement>(
        '[data-asset-kind="audio"]',
      )) {
        const isPlaying = row.dataset['assetPath'] === playingPath;
        row.dataset['playing'] = String(isPlaying);
        row.querySelector('[aria-pressed]')?.setAttribute('aria-pressed', String(isPlaying));
        const path = row.dataset['assetPath'] ?? '';
        syncAudioRow(row, isPlaying ? progress : undefined, durations.get(path), volume);
      }
    });
  }

  protected onContentKeyDown(event: KeyboardEvent): void {
    const brokenLink = (event.target as HTMLElement).closest<HTMLElement>(BROKEN_LINK_SELECTOR);
    if (brokenLink && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const rect = brokenLink.getBoundingClientRect();
      this.openBrokenLinkMenu(brokenLink, rect.left, rect.bottom);
    }
  }

  /** Handles `input` events from the volume range slider inside a rendered audio row. */
  protected onContentInput(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.dataset['assetAction'] !== 'set-volume') {
      return;
    }

    const path = target.closest<HTMLElement>('[data-asset-path]')?.dataset['assetPath'] ?? '';
    const volume = parseFloat((target as HTMLInputElement).value);
    if (Number.isFinite(volume)) {
      this.assetAction.emit({ action: 'set-volume', path, volume });
    }
  }

  protected onContentClick(event: MouseEvent): void {
    const assetControl = (event.target as HTMLElement).closest<HTMLElement>(ASSET_ACTION_SELECTOR);
    const action = assetControl?.dataset['assetAction'];
    if (assetControl && (action === 'toggle-audio' || action === 'open')) {
      event.preventDefault();
      const path = assetControl.closest<HTMLElement>('[data-asset-path]')?.dataset['assetPath'];
      if (path) {
        this.assetAction.emit({ action, path });
      }
      return;
    }

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

  private syncCodeMap(isOn: boolean): void {
    if (!isOn) {
      cancelAnimationFrame(this.codeMapRequest);
      this.codeMapObserver?.disconnect();
      this.codeMapObserver = null;
      this.codeMap?.destroy();
      this.codeMap = null;
      return;
    }

    if (!this.codeMap) {
      const scroller = this.scroller().nativeElement;
      const body = this.bodyElement().nativeElement;
      this.codeMap = new CodeMap({
        host: this.host.nativeElement,
        scroller,
        contentOffset: () => 0,
        jumpTo: (id) => {
          const heading = this.codeMapHeadings[Number(id)];
          if (heading) {
            scroller.scrollTop +=
              heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
          }
        },
      });
      // Images loading and the pane resizing move the blocks.
      this.codeMapObserver = new ResizeObserver(() => this.refreshCodeMap());
      this.codeMapObserver.observe(scroller);
      this.codeMapObserver.observe(body);
    }

    this.refreshCodeMap();
  }

  private refreshCodeMap(): void {
    cancelAnimationFrame(this.codeMapRequest);
    this.codeMapRequest = requestAnimationFrame(() => this.codeMap?.render(this.measureReading()));
  }

  /** The rendered note's blocks, in the scroll area's content px (its padding included). */
  private measureReading(): CodeMapContent {
    const scroller = this.scroller().nativeElement;
    const body = this.bodyElement().nativeElement;
    const base = scroller.scrollTop - scroller.getBoundingClientRect().top;
    const blocks: CodeMapBlock[] = [];
    const headings: CodeMapHeading[] = [];
    this.codeMapHeadings = [];

    const add = (element: Element, kind: CodeMapKind, indent = 0) => {
      const rect = element.getBoundingClientRect();
      if (rect.height > 0) {
        const chars = element.textContent?.trim().length ?? 0;
        blocks.push({ top: rect.top + base, height: rect.height, kind, chars, indent });
      }
    };
    const addList = (list: Element, depth: number) => {
      for (const item of Array.from(list.children)) {
        add(item, 'list', depth * 2);
      }
    };

    for (const element of Array.from(body.children)) {
      const heading = /^H([1-3])$/.exec(element.tagName);
      if (heading && element.textContent?.trim()) {
        headings.push({
          level: Number(heading[1]) as CodeMapHeading['level'],
          text: element.textContent.trim(),
          top: element.getBoundingClientRect().top + base,
          id: String(this.codeMapHeadings.push(element as HTMLElement) - 1),
        });
      } else if (element.tagName === 'UL' || element.tagName === 'OL') {
        addList(element, 0);
      } else {
        add(element, readingKindOf(element));
      }
    }

    return {
      contentHeight: scroller.scrollHeight,
      lineHeight: parseFloat(getComputedStyle(body).lineHeight) || 24,
      blocks,
      headings,
    };
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
