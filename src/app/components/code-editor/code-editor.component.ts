import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

import type { EditorSettings } from '@/config/local-preferences.config';
import { AppEditorInsertMenuComponent } from '@/components/editor-insert-menu/editor-insert-menu.component';
import {
  syncAudioRow,
  type MediaEmbedLabels,
} from '@/components/document-preview/document-preview.markdown';
import type { DocumentLinkDto, LinkTargetDto } from '@/dtos';
import { AssetService } from '@/services/asset.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import type { NoteAudioProgress } from '@/services/note-audio.service';
import { codeMap } from './code-map';
import {
  autoClosePairs,
  type EditorInsertAction,
  formattingKeymap,
  INSERT_COMMANDS,
  wrapSelectionOnInput,
} from './editor-commands';
import { linkCompletion, setLinkCompletionContext } from './link-completion';
import { findFrontmatterEnd, livePreview, setLivePreviewContext } from './live-preview';

/** `live`: Obsidian-like live preview (rendered while editable); `source`: plain markdown. */
export type CodeEditorMode = 'live' | 'source';

/** A broken link clicked in the live preview, with where to open its fix menu. */
export interface CodeEditorBrokenLinkEvent {
  readonly raw: string;
  readonly targetName: string;
  readonly x: number;
  readonly y: number;
}

/** Links of the live preview and of its rendered blocks (tables, callouts). */
const LIVE_LINK_SELECTOR =
  '.cm-lp-link, .cm-lp-block a[data-route], .cm-lp-block [data-broken-raw], [data-asset-action]:not([data-asset-action="set-volume"])';

/** A control of an embedded audio / PDF row: play/stop, open in the system viewer, or set volume. */
export interface CodeEditorAssetAction {
  readonly action: 'toggle-audio' | 'open' | 'set-volume';
  readonly path: string;
  /** Volume (0–1) for `set-volume` actions. */
  readonly volume?: number;
}

/**
 * Wraps CodeMirror 6 as the markdown editor, in live preview (default) or source mode. Colours come
 * from the ArcTechUI CSS variables, so the editor follows the active theme without extra wiring; the
 * Settings → Editor choices (code map, line numbers, wrapping…) apply as soon as they change.
 */
@Component({
  selector: 'app-code-editor',
  imports: [AppEditorInsertMenuComponent],
  template: `
    <div #host class="h-full min-h-0 w-full"></div>
    <app-editor-insert-menu
      [canLink]="canLink()"
      (action)="runInsertAction($event)"
      (menuClosed)="focusEditor()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0 w-full overflow-hidden border border-input bg-recessed',
  },
})
export class AppCodeEditorComponent implements OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly insertMenu = viewChild.required(AppEditorInsertMenuComponent);
  private view: EditorView | null = null;
  private previousDocumentKey: string | null = null;
  private readonly modeCompartment = new Compartment();
  private readonly settingsCompartment = new Compartment();
  private readonly editorSettings = inject(LocalPreferencesService).editorSettings;
  private readonly assetService = inject(AssetService);

  /** Identifies the open note; the editor content resets whenever this changes (switching notes). */
  readonly documentKey = input.required<string>();
  readonly initialContent = input('');
  readonly readOnly = input(false, { transform: booleanAttribute });
  readonly placeholderText = input('');
  readonly mode = input<CodeEditorMode>('live');
  /** Resolved links of the note (vault index), for the live preview's links and embeds. */
  readonly links = input<readonly DocumentLinkDto[]>([]);
  /** Files of the note's scope, suggested while a link is typed (none: no suggestions). */
  readonly linkTargets = input<readonly LinkTargetDto[]>([]);
  readonly sourcePath = input('');
  /** The note's audio playing now, shown as *stop* on its row. */
  readonly playingAudioPath = input<string | null>(null);
  /** 0–1 volume, the same for every sound; the row's slider is initialised to this. */
  readonly audioVolume = input<number>(1);
  /** Time of the playing audio, written into its row (no decoration rebuild). */
  readonly audioProgress = input<NoteAudioProgress | undefined>(undefined);
  readonly mediaLabels = input<MediaEmbedLabels | undefined>(undefined);

  readonly contentChange = output<string>();
  readonly saveRequested = output<void>();
  /** A link of the live preview was clicked: its in-app route. */
  readonly linkOpen = output<string>();
  readonly brokenLinkOpen = output<CodeEditorBrokenLinkEvent>();
  /** Media files were pasted (the page saves them as assets, then calls `insertEmbeds`). */
  readonly filesPasted = output<readonly File[]>();
  /** *Import file…* was chosen in the insert menu (the page opens the file dialog). */
  readonly importFileRequested = output<void>();
  /** Play/stop an embedded audio or open an embedded PDF (live preview rows). */
  readonly assetAction = output<CodeEditorAssetAction>();

  /** Link and asset entries of the insert menu need files to suggest (none in templates). */
  protected readonly canLink = computed(() => this.linkTargets().length > 0);

  constructor() {
    afterNextRender(() => this.createView());

    effect(() => {
      const extensions = this.modeExtensions(this.mode());
      this.view?.dispatch({ effects: this.modeCompartment.reconfigure(extensions) });
      this.syncLinks();
    });

    effect(() => {
      const extensions = settingsExtensions(this.editorSettings());
      this.view?.dispatch({ effects: this.settingsCompartment.reconfigure(extensions) });
    });

    effect(() => {
      this.links();
      this.linkTargets();
      this.sourcePath();
      this.playingAudioPath();
      this.mediaLabels();
      this.syncLinks();
    });

    // Time and volume go straight into the rendered audio rows, so playing does not rebuild decorations.
    effect(() => {
      const progress = this.audioProgress();
      const volume = this.audioVolume();
      const playingPath = this.playingAudioPath();
      for (const row of this.host().nativeElement.querySelectorAll<HTMLElement>(
        '[data-asset-kind="audio"]',
      )) {
        syncAudioRow(row, row.dataset['assetPath'] === playingPath ? progress : undefined, volume);
      }
    });

    effect(() => {
      const key = this.documentKey();
      if (this.previousDocumentKey !== null && this.previousDocumentKey !== key) {
        this.view?.setState(this.buildState(this.initialContent()));
        this.syncLinks();
      }

      this.previousDocumentKey = key;
    });
  }

  ngOnDestroy(): void {
    const host = this.host().nativeElement;
    host.removeEventListener('mousedown', this.handleLinkMouseDown, true);
    host.removeEventListener('click', this.handleLinkClick, true);
    host.removeEventListener('input', this.handleVolumeInput, true);
    host.removeEventListener('contextmenu', this.handleContextMenu);
    this.view?.destroy();
  }

  /**
   * Replaces the editor content in place, for the same note (e.g. discarding local edits to
   * reload the version found on disk after a save conflict). Switching to a different note goes
   * through `documentKey` instead, which also resets undo history and scroll position.
   */
  replaceContent(content: string): void {
    this.view?.setState(this.buildState(content));
    this.syncLinks();
  }

  /** Writes `![[…]]` embeds of saved assets in place of the selection, one per line. */
  insertEmbeds(linkTargets: readonly string[]): void {
    const view = this.view;
    if (!view || linkTargets.length === 0) {
      return;
    }

    const embeds = linkTargets.map((target) => `![[${target}]]`).join('\n');
    view.dispatch(view.state.replaceSelection(embeds), {
      scrollIntoView: true,
      userEvent: 'input.paste',
    });
    view.focus();
  }

  /** Places the cursor at a given line (1-based), used when a backlink points at a heading. */
  focusLine(lineNumber: number): void {
    const view = this.view;
    if (!view) {
      return;
    }

    const clampedLine = Math.min(Math.max(lineNumber, 1), view.state.doc.lines);
    const position = view.state.doc.line(clampedLine).from;
    view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    view.focus();
  }

  private createView(): void {
    const host = this.host().nativeElement;
    this.view = new EditorView({ parent: host, state: this.buildState(this.initialContent()) });
    this.syncLinks();

    // Capture phase: CodeMirror would otherwise move the cursor into the link (showing its source).
    host.addEventListener('mousedown', this.handleLinkMouseDown, true);
    host.addEventListener('click', this.handleLinkClick, true);
    host.addEventListener('input', this.handleVolumeInput, true);
    host.addEventListener('contextmenu', this.handleContextMenu);
  }

  protected runInsertAction(action: EditorInsertAction): void {
    const view = this.view;
    if (!view) {
      return;
    }

    // Focus first: the link suggestions and the clipboard both need the editor focused.
    view.focus();
    if (action === 'importFile') {
      this.importFileRequested.emit();
    } else {
      INSERT_COMMANDS[action](view);
    }
  }

  /** Pasted media files become assets (when the note has a scope to save them in); text pastes as usual. */
  private readonly handlePaste = (event: ClipboardEvent): boolean => {
    const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
      this.assetService.isMediaFile(file),
    );
    if (files.length === 0 || !this.canLink() || this.readOnly()) {
      return false;
    }

    event.preventDefault();
    this.filesPasted.emit(files);
    return true;
  };

  protected focusEditor(): void {
    this.view?.focus();
  }

  /**
   * Right-click opens the insert menu (not in read-only notes). Like a native menu, a click outside
   * the selection first moves the cursor there; inside it the selection stays, for wrapping.
   */
  private readonly handleContextMenu = (event: MouseEvent) => {
    const view = this.view;
    if (!view || this.readOnly()) {
      return;
    }

    event.preventDefault();
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const isInSelection = view.state.selection.ranges.some(
      (range) => position !== null && position >= range.from && position <= range.to,
    );
    if (position !== null && !isInSelection) {
      view.dispatch({ selection: { anchor: position } });
    }
    this.insertMenu().open(event.clientX, event.clientY);
  };

  private syncLinks(): void {
    this.view?.dispatch({
      effects: [
        setLivePreviewContext.of({
          links: this.links(),
          sourcePath: this.sourcePath(),
          playingAudioPath: this.playingAudioPath(),
          mediaLabels: this.mediaLabels(),
          // Read untracked: volume changes (slider drags) must not trigger decoration rebuilds.
          volume: untracked(this.audioVolume),
        }),
        setLinkCompletionContext.of({ targets: this.linkTargets(), sourcePath: this.sourcePath() }),
      ],
    });
  }

  private modeExtensions(mode: CodeEditorMode): Extension {
    return mode === 'live'
      ? [livePreview(), syntaxHighlighting(liveHighlightStyle)]
      : [wikilinkHighlightPlugin, syntaxHighlighting(markdownHighlightStyle), sourceTheme];
  }

  private getLiveLink(event: MouseEvent): HTMLElement | null {
    if (this.mode() !== 'live' || event.button !== 0) {
      return null;
    }

    return (event.target as HTMLElement).closest<HTMLElement>(LIVE_LINK_SELECTOR);
  }

  private readonly handleLinkMouseDown = (event: MouseEvent) => {
    if (this.getLiveLink(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  /** Dragging the volume slider emits a `set-volume` action (fires on every `input` event). */
  private readonly handleVolumeInput = (event: Event) => {
    if (this.mode() !== 'live') {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.dataset['assetAction'] !== 'set-volume') {
      return;
    }

    const path = target.closest<HTMLElement>('[data-asset-path]')?.dataset['assetPath'] ?? '';
    const volume = parseFloat((target as HTMLInputElement).value);
    if (Number.isFinite(volume)) {
      this.assetAction.emit({ action: 'set-volume', path, volume });
    }
  };

  /** Click opens the link; Cmd/Ctrl-click is left to the tab bar (opens it in a new tab). */
  private readonly handleLinkClick = (event: MouseEvent) => {
    const link = this.getLiveLink(event);
    const action = link?.dataset['assetAction'];
    if (link && (action === 'toggle-audio' || action === 'open')) {
      event.preventDefault();
      event.stopPropagation();
      const path = link.closest<HTMLElement>('[data-asset-path]')?.dataset['assetPath'];
      if (path) {
        this.assetAction.emit({ action, path });
      }
      return;
    }

    if (!link || event.metaKey || event.ctrlKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (link.dataset['brokenRaw'] !== undefined) {
      this.brokenLinkOpen.emit({
        raw: link.dataset['brokenRaw'],
        targetName: link.dataset['brokenTarget'] ?? '',
        x: event.clientX,
        y: event.clientY,
      });
    } else if (link.dataset['route']) {
      this.linkOpen.emit(link.dataset['route']);
    } else if (link.dataset['href']) {
      window.open(link.dataset['href'], '_blank', 'noopener');
    }
  };

  private buildState(content: string) {
    // Open below the frontmatter, so the live preview shows it as properties until the cursor goes there.
    const frontmatterEnd = findFrontmatterEnd(EditorState.create({ doc: content }));
    return EditorState.create({
      doc: content,
      selection: { anchor: frontmatterEnd > 0 ? Math.min(frontmatterEnd + 1, content.length) : 0 },
      extensions: [
        history(),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              this.saveRequested.emit();
              return true;
            },
          },
          ...formattingKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        linkCompletion(),
        wrapSelectionOnInput,
        this.modeCompartment.of(this.modeExtensions(this.mode())),
        editorTheme,
        this.settingsCompartment.of(settingsExtensions(this.editorSettings())),
        EditorView.editable.of(!this.readOnly()),
        EditorView.contentAttributes.of({ 'aria-placeholder': this.placeholderText() }),
        EditorView.domEventHandlers({ paste: (event) => this.handlePaste(event) }),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            this.contentChange.emit(update.state.doc.toString());
          }
        }),
      ],
    });
  }
}

/** Settings → Editor, as editor extensions (text size and column width are CSS variables instead). */
function settingsExtensions(settings: EditorSettings): Extension {
  return [
    settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
    settings.highlightActiveLine ? highlightActiveLine() : [],
    settings.lineWrapping ? EditorView.lineWrapping : [],
    EditorView.contentAttributes.of({ spellcheck: settings.spellcheck ? 'true' : 'false' }),
    settings.codeMap ? codeMap() : [],
    settings.autoClosePairs ? autoClosePairs() : [],
  ];
}

const WIKILINK_PATTERN = /!?\[\[[^[\]\n]+?\]\]/g;

const wikilinkDecorator = new MatchDecorator({
  regexp: WIKILINK_PATTERN,
  decoration: () => Decoration.mark({ class: 'cm-wikilink' }),
});

const wikilinkHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = wikilinkDecorator.createDeco(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = wikilinkDecorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (instance) => instance.decorations },
);

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--primary)', fontWeight: '800' },
  { tag: tags.heading2, color: 'var(--primary)', fontWeight: '700' },
  {
    tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6],
    color: 'var(--primary)',
    fontWeight: '600',
  },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--primary)' },
  { tag: tags.url, color: 'var(--muted-foreground)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', color: 'var(--accent-foreground)' },
  { tag: tags.quote, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: tags.contentSeparator, color: 'var(--border)' },
  { tag: tags.processingInstruction, color: 'var(--muted-foreground)' },
  { tag: tags.list, color: 'var(--primary)' },
]);

/** Live preview: inline styles only; headings and blocks are styled by the live preview itself. */
const liveHighlightStyle = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.url, color: 'var(--muted-foreground)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)' },
  { tag: tags.processingInstruction, color: 'var(--muted-foreground)' },
]);

/** Source mode: the whole note in the mono font, markdown syntax visible. */
const sourceTheme = EditorView.theme({
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(13px * var(--editor-text-scale, 1))',
    padding: '16px',
  },
});

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--foreground)',
    backgroundColor: 'var(--recessed)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    caretColor: 'var(--primary)',
    // Readable line width: a centred column (Settings → Editor); `none` fills the editor.
    maxWidth: 'var(--editor-max-width, none)',
    marginInline: 'auto',
  },
  '.cm-scroller': {
    lineHeight: '1.65',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--card)',
    color: 'var(--muted-foreground)',
    border: 'none',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklch, var(--foreground) 6%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--primary)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklch, var(--primary) 28%, transparent) !important',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--primary)',
  },
  '.cm-placeholder': {
    color: 'var(--muted-foreground)',
  },
  '.cm-wikilink': {
    color: 'var(--primary)',
  },
});
