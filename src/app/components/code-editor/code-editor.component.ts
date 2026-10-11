import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * Wraps CodeMirror 6 as the markdown source editor. Colours come from the ArcTechUI CSS
 * variables, so the editor follows the active theme without any extra wiring.
 */
@Component({
  selector: 'app-code-editor',
  template: `<div #host class="h-full min-h-0 w-full"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0 w-full overflow-hidden border border-input bg-background',
  },
})
export class AppCodeEditorComponent implements OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private view: EditorView | null = null;
  private previousDocumentKey: string | null = null;

  /** Identifies the open note; the editor content resets whenever this changes (switching notes). */
  readonly documentKey = input.required<string>();
  readonly initialContent = input('');
  readonly readOnly = input(false, { transform: booleanAttribute });
  readonly placeholderText = input('');

  readonly contentChange = output<string>();
  readonly saveRequested = output<void>();

  constructor() {
    afterNextRender(() => this.createView());

    effect(() => {
      const key = this.documentKey();
      if (this.previousDocumentKey !== null && this.previousDocumentKey !== key) {
        this.view?.setState(this.buildState(this.initialContent()));
      }

      this.previousDocumentKey = key;
    });
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  /**
   * Replaces the editor content in place, for the same note (e.g. discarding local edits to
   * reload the version found on disk after a save conflict). Switching to a different note goes
   * through `documentKey` instead, which also resets undo history and scroll position.
   */
  replaceContent(content: string): void {
    this.view?.setState(this.buildState(content));
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
    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: this.buildState(this.initialContent()),
    });
  }

  private buildState(content: string) {
    return EditorState.create({
      doc: content,
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
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        markdown({ codeLanguages: languages }),
        wikilinkHighlightPlugin,
        syntaxHighlighting(markdownHighlightStyle),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.editable.of(!this.readOnly()),
        EditorView.contentAttributes.of({ 'aria-placeholder': this.placeholderText() }),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            this.contentChange.emit(update.state.doc.toString());
          }
        }),
      ],
    });
  }
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

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    color: 'var(--foreground)',
    backgroundColor: 'var(--background)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    caretColor: 'var(--primary)',
    padding: '16px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
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
