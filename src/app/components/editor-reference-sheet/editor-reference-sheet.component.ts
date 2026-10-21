import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  type MediaEmbedLabels,
  renderMarkdownToSafeHtml,
} from '@/components/document-preview/document-preview.markdown';
import type { DocumentLinkDto } from '@/dtos';
import { ArcTechKbdComponent } from '@/shared/components/kbd';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

/** Sample paths: the examples resolve like real links, without touching the vault. */
const SAMPLE_SOURCE = 'reference/notes/sample.md';
const GOBLIN_PATH = 'reference/npcs/Goblin.md';
const SAMPLE_LINKS: readonly DocumentLinkDto[] = [
  {
    raw: 'Goblin',
    kind: 'wikilink',
    targetName: 'Goblin',
    heading: null,
    resolvedPath: GOBLIN_PATH,
  },
  {
    raw: 'Goblin|the goblin',
    kind: 'wikilink',
    targetName: 'Goblin',
    heading: null,
    resolvedPath: GOBLIN_PATH,
  },
  {
    raw: 'Goblin#Tactics',
    kind: 'wikilink',
    targetName: 'Goblin',
    heading: 'Tactics',
    resolvedPath: GOBLIN_PATH,
  },
  {
    raw: 'Missing note',
    kind: 'wikilink',
    targetName: 'Missing note',
    heading: null,
    resolvedPath: null,
  },
  {
    raw: 'roar.mp3',
    kind: 'embed',
    targetName: 'roar.mp3',
    heading: null,
    resolvedPath: 'reference/assets/roar.mp3',
  },
  {
    raw: 'handout.pdf',
    kind: 'embed',
    targetName: 'handout.pdf',
    heading: null,
    resolvedPath: 'reference/assets/handout.pdf',
  },
];

/** One entry: its key under `document.reference.items`, and the syntax as typed. */
interface ReferenceItem {
  readonly key: string;
  readonly syntax: string;
  /** Shown with the Reading renderer; otherwise a note (`document.reference.notes.<key>`) says what it does. */
  readonly render?: boolean;
}

const GROUPS: readonly { readonly key: string; readonly items: readonly ReferenceItem[] }[] = [
  {
    key: 'text',
    items: [
      { key: 'bold', syntax: '**bold**', render: true },
      { key: 'italic', syntax: '*italic*', render: true },
      { key: 'strikethrough', syntax: '~~struck~~', render: true },
      { key: 'inlineCode', syntax: '`code`', render: true },
    ],
  },
  {
    key: 'headings',
    items: [
      { key: 'heading1', syntax: '# Heading 1', render: true },
      { key: 'heading2', syntax: '## Heading 2', render: true },
      { key: 'heading3', syntax: '### Heading 3', render: true },
    ],
  },
  {
    key: 'lists',
    items: [
      { key: 'bulletList', syntax: '- Item\n- Item\n  - Nested', render: true },
      { key: 'orderedList', syntax: '1. First\n2. Second', render: true },
      { key: 'taskList', syntax: '- [ ] To do\n- [x] Done', render: true },
    ],
  },
  {
    key: 'links',
    items: [
      { key: 'wikilink', syntax: '[[Goblin]]', render: true },
      { key: 'wikilinkLabel', syntax: '[[Goblin|the goblin]]', render: true },
      { key: 'wikilinkHeading', syntax: '[[Goblin#Tactics]]', render: true },
      { key: 'brokenLink', syntax: '[[Missing note]]', render: true },
      { key: 'markdownLink', syntax: '[Rules](https://example.com)', render: true },
    ],
  },
  {
    key: 'blocks',
    items: [
      { key: 'quote', syntax: '> A quote', render: true },
      { key: 'callout', syntax: '> [!warning] Careful\n> The dragon is awake.', render: true },
      { key: 'codeBlock', syntax: '```\nroll 1d20\n```', render: true },
      { key: 'table', syntax: '| Name | HP |\n| --- | --- |\n| Goblin | 7 |', render: true },
      { key: 'divider', syntax: '---', render: true },
    ],
  },
  {
    key: 'media',
    items: [
      { key: 'image', syntax: '![[map.png]]' },
      { key: 'audio', syntax: '![[roar.mp3]]', render: true },
      { key: 'pdf', syntax: '![[handout.pdf]]', render: true },
    ],
  },
  {
    key: 'properties',
    items: [{ key: 'frontmatter', syntax: '---\ntype: npc\nlevel: 3\n---' }],
  },
];

/** Shortcuts (`document.reference.shortcuts.<key>`) and their keys; `keys` empty for mouse-only ones. */
const SHORTCUTS: readonly { readonly key: string; readonly keys: readonly string[] }[] = [
  { key: 'save', keys: [MOD, 'S'] },
  { key: 'bold', keys: [MOD, 'B'] },
  { key: 'italic', keys: [MOD, 'I'] },
  { key: 'linkSuggestions', keys: ['[['] },
  { key: 'acceptSuggestion', keys: ['Tab'] },
  { key: 'wrapSelection', keys: ['*', '_', '`', '('] },
  { key: 'insertMenu', keys: [] },
  { key: 'openInNewTab', keys: [] },
];

/**
 * The editor reference (the *info* button next to the view buttons): everything the note editor understands,
 * each entry's syntax next to how Reading renders it — with the real renderer, so it never drifts — and the
 * keyboard shortcuts. Read-only; it never edits the note.
 */
@Component({
  selector: 'app-editor-reference-sheet',
  imports: [TranslatePipe, ArcTechKbdComponent],
  template: `
    <div class="flex flex-col gap-6 p-4">
      @for (group of groups; track group.key) {
        <section>
          <h3
            class="font-mono text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
          >
            {{ 'document.reference.groups.' + group.key | translate }}
          </h3>
          <ul class="mt-2 flex flex-col divide-y divide-border border border-border bg-card">
            @for (item of group.items; track item.key) {
              <li class="grid grid-cols-2 gap-4 p-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium">
                    {{ 'document.reference.items.' + item.key | translate }}
                  </p>
                  <pre
                    class="mt-1.5 overflow-x-auto bg-recessed px-2 py-1 font-mono text-xs text-foreground"
                    >{{ item.syntax }}</pre>
                </div>
                <div class="min-w-0 self-center">
                  @if (item.html) {
                    <div
                      class="arc-markdown-body arc-reference-sample"
                      [innerHTML]="item.html"
                    ></div>
                  } @else {
                    <p class="text-xs text-muted-foreground">
                      {{ 'document.reference.notes.' + item.key | translate }}
                    </p>
                  }
                </div>
              </li>
            }
          </ul>
        </section>
      }

      <section>
        <h3
          class="font-mono text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
        >
          {{ 'document.reference.groups.shortcuts' | translate }}
        </h3>
        <ul class="mt-2 flex flex-col divide-y divide-border border border-border bg-card">
          @for (shortcut of shortcuts; track shortcut.key) {
            <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>{{ 'document.reference.shortcuts.' + shortcut.key | translate }}</span>
              @if (shortcut.keys.length > 0) {
                <span class="flex shrink-0 items-center gap-1">
                  @for (key of shortcut.keys; track $index) {
                    <arc-kbd>{{ key }}</arc-kbd>
                  }
                </span>
              }
            </li>
          }
        </ul>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AppEditorReferenceSheetComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly translate = inject(TranslateService);
  private readonly mediaLabels: MediaEmbedLabels = {
    play: this.translate.instant('document.media.play'),
    open: this.translate.instant('document.media.open'),
    volume: this.translate.instant('document.media.volume'),
    brokenNote: this.translate.instant('document.brokenLinkTitle', { name: '{{name}}' }),
  };

  protected readonly shortcuts = SHORTCUTS;
  protected readonly groups = GROUPS.map((group) => ({
    key: group.key,
    items: group.items.map((item) => ({
      ...item,
      html: item.render ? this.render(item.syntax) : null,
    })),
  }));

  private render(syntax: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      renderMarkdownToSafeHtml(syntax, {
        links: SAMPLE_LINKS,
        sourcePath: SAMPLE_SOURCE,
        mediaLabels: this.mediaLabels,
      }),
    );
  }
}
