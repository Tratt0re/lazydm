import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  EditorState,
  type Extension,
  Prec,
  type Range,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  type Command,
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  WidgetType,
} from '@codemirror/view';

import {
  getMediaEmbedKind,
  type MediaEmbedKind,
  type MediaEmbedLabels,
  renderMarkdownToSafeHtml,
  renderMediaEmbedHtml,
  renderTaskBoxHtml,
  toAssetUrl,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { type ImageFrame, parseImageEmbed } from '@/components/code-editor/image-frame';
import type { DocumentLinkDto } from '@/dtos';

/** What the live preview needs besides the text: the note's resolved links (from the vault index). */
export interface LivePreviewContext {
  readonly links: readonly DocumentLinkDto[];
  readonly sourcePath: string;
  /** Show the properties box; collapsed (nothing drawn) when false. Missing means shown. */
  readonly showProperties?: boolean;
  /** The note's title: a `title` property that says the same is left out of the box. */
  readonly pageTitle?: string;
  /** The audio of the note playing now (its row shows *stop*). */
  readonly playingAudioPath?: string | null;
  readonly mediaLabels?: MediaEmbedLabels;
  /** 0–1 volume for the audio row's slider initial value. */
  readonly volume?: number;
  /** Lengths of the note's audio files (seconds, by path), shown on their rows. */
  readonly audioDurations?: ReadonlyMap<string, number>;
}

/** Updates the links the live preview resolves `[[wikilinks]]` and embeds with. */
export const setLivePreviewContext = StateEffect.define<LivePreviewContext>();

const WIKILINK_PATTERN = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const CALLOUT_HEADER_PATTERN = /^\s*>\s*\[![A-Za-z][\w-]*\]/;
const FRONTMATTER_CLOSE = new Set(['---', '...']);
const BULLET_MARKS = new Set(['-', '*', '+']);
const INLINE_MARKS: Readonly<Record<string, string>> = {
  Emphasis: 'EmphasisMark',
  StrongEmphasis: 'EmphasisMark',
  Strikethrough: 'StrikethroughMark',
  InlineCode: 'CodeMark',
};

const contextField = StateField.define<LivePreviewContext>({
  create: () => ({ links: [], sourcePath: '' }),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setLivePreviewContext)) {
        return effect.value;
      }
    }
    return value;
  },
});

// ---------------------------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------------------------

/** Divider: the simple ornament (◇ then the line). */
class DividerWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'cm-lp-hr';
    element.setAttribute('aria-hidden', 'true');
    element.textContent = '◇';
    return element;
  }
}

class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'cm-lp-bullet';
    element.textContent = '•';
    return element;
  }
}

/** `[ ]` / `[x]` of a task: a real checkbox that edits the marker. */
class TaskWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly markerFrom: number,
  ) {
    super();
  }

  override eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.markerFrom === this.markerFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    // The app's checkbox (square, primary when checked), the same box as in Reading.
    const container = document.createElement('span');
    container.innerHTML = renderTaskBoxHtml(this.checked);
    const input = container.firstElementChild as HTMLElement;
    input.classList.add('cm-lp-task');
    input.addEventListener('mousedown', (event) => event.preventDefault());
    input.addEventListener('click', (event) => {
      event.preventDefault();
      view.dispatch({
        changes: {
          from: this.markerFrom + 1,
          to: this.markerFrom + 2,
          insert: this.checked ? ' ' : 'x',
        },
      });
    });
    return input;
  }
}

/**
 * An embedded image. While its source is being edited (`isEditing`) it stays shown on its own line above
 * the `![[…]]` / `![](…)` text, so editing the link does not make the image disappear.
 */
class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly isEditing = false,
    /** Vault path of the image (none for a web image): lets the eye button preview it. */
    private readonly path: string | null = null,
    /** Frame of a `![[…]]` embed (width); null for a markdown image, which has no "…" menu. */
    private readonly frame: ImageFrame | null = null,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.isEditing === this.isEditing &&
      other.path === this.path &&
      other.frame?.width === this.frame?.width &&
      (other.frame === null) === (this.frame === null)
    );
  }

  toDOM(): HTMLElement {
    const image = document.createElement('img');
    image.className = this.isEditing ? 'cm-lp-image cm-lp-image-editing' : 'cm-lp-image';
    image.src = this.src;
    image.alt = this.alt;
    image.loading = 'lazy';
    if (this.path) {
      image.dataset['path'] = this.path;
    }
    if (this.frame) {
      // The "…" button of the hover toolbar only appears on embeds that can carry a frame.
      image.dataset['frameEmbed'] = '';
      if (this.frame.width) {
        image.classList.add(`arc-image-width-${this.frame.width}`);
      }
    }
    // Collapsed (not being edited), the widget replaces its whole `![[…]]` / `![](…)` text: CodeMirror's
    // own drag handling (dragstart) picks up that full range from a draggable element, so dragging the
    // image moves its embed like dragging the link text already does.
    image.draggable = !this.isEditing;
    return image;
  }

  /** Widgets' events are ignored by default; the editor must see the drag to move the embed text. */
  override ignoreEvent(event: Event): boolean {
    return this.isEditing || event.type !== 'dragstart';
  }
}

/** An embedded audio (play/stop) or PDF (opens in the system viewer): the reading view's row. */
class MediaEmbedWidget extends WidgetType {
  constructor(
    private readonly kind: MediaEmbedKind,
    private readonly path: string,
    private readonly name: string,
    private readonly labels: MediaEmbedLabels | undefined,
    private readonly isPlaying: boolean,
    private readonly volume: number = 1,
    private readonly durationSeconds: number = NaN,
  ) {
    super();
  }

  override eq(other: MediaEmbedWidget): boolean {
    return (
      other.path === this.path &&
      other.name === this.name &&
      other.isPlaying === this.isPlaying &&
      other.labels === this.labels &&
      other.volume === this.volume &&
      Object.is(other.durationSeconds, this.durationSeconds)
    );
  }

  toDOM(): HTMLElement {
    // Our own escaped HTML, the same row as in the reading view.
    const container = document.createElement('span');
    container.innerHTML = renderMediaEmbedHtml(
      this.kind,
      this.path,
      this.name,
      this.labels,
      this.isPlaying,
      /* currentSeconds */ 0,
      this.durationSeconds,
      this.volume,
    );
    return container.firstElementChild as HTMLElement;
  }
}

/**
 * A rendered block (table, callout) or the frontmatter properties: clicking anywhere but on a link
 * puts the cursor inside it, which turns it back into editable source.
 */
class BlockWidget extends WidgetType {
  constructor(
    private readonly key: string,
    private readonly build: () => HTMLElement,
    private readonly revealAt: number,
  ) {
    super();
  }

  override eq(other: BlockWidget): boolean {
    return other.key === this.key && other.revealAt === this.revealAt;
  }

  toDOM(view: EditorView): HTMLElement {
    // The wrapper holds the block's spacing (and any margin of its content): CodeMirror measures a block
    // widget's border box, so margins outside it would shift every line below from where it is drawn —
    // clicks and arrow keys would then land on the line above or below.
    const element = document.createElement('div');
    element.className = 'cm-lp-block-wrap';
    element.append(this.build());
    element.addEventListener('mousedown', (event) => {
      if ((event.target as HTMLElement).closest('a, [data-broken-raw]')) {
        return;
      }

      event.preventDefault();
      view.dispatch({ selection: { anchor: this.revealAt } });
      view.focus();
    });
    return element;
  }
}

function renderHtmlBlock(html: string, className: string): () => HTMLElement {
  return () => {
    const element = document.createElement('div');
    element.className = `cm-lp-block arc-markdown-body ${className}`;
    element.innerHTML = html;
    return element;
  };
}

function renderProperties(entries: readonly (readonly [string, string])[]): () => HTMLElement {
  return () => {
    const element = document.createElement('div');
    element.className = 'cm-lp-block cm-lp-properties';
    for (const [key, value] of entries) {
      const keyElement = document.createElement('span');
      keyElement.className = 'cm-lp-property-key';
      keyElement.textContent = key;
      const valueElement = document.createElement('span');
      valueElement.className = 'cm-lp-property-value';
      valueElement.textContent = value;
      element.append(keyElement, valueElement);
    }
    return element;
  };
}

// ---------------------------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------------------------

interface DecorationContext {
  readonly state: EditorState;
  readonly context: LivePreviewContext;
  readonly ranges: Range<Decoration>[];
  /** Ranges replaced by a block widget: nothing else is decorated inside them. */
  readonly blocks: [number, number][];
}

const hidden = Decoration.replace({});

/** Whether the selection touches a range (its source is then shown for editing). */
function isTouched(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

/** Whether the selection is on one of the lines of a range. */
function isOnLines(state: EditorState, from: number, to: number): boolean {
  const firstLine = state.doc.lineAt(from).number;
  const lastLine = state.doc.lineAt(to).number;
  return state.selection.ranges.some(
    (range) =>
      state.doc.lineAt(range.from).number <= lastLine &&
      state.doc.lineAt(range.to).number >= firstLine,
  );
}

function isInBlock(blocks: readonly [number, number][], position: number): boolean {
  return blocks.some(([from, to]) => position >= from && position <= to);
}

function findLink(context: LivePreviewContext, raw: string): DocumentLinkDto | null {
  return context.links.find((link) => link.raw === raw) ?? null;
}

/** Links of a snippet, in order, as the markdown renderer pairs them (tables and callouts). */
function linksForSnippet(context: LivePreviewContext, text: string): DocumentLinkDto[] {
  return [...text.matchAll(WIKILINK_PATTERN)].map(
    (match) =>
      findLink(context, match[2]) ?? {
        raw: match[2],
        kind: match[1] ? 'embed' : 'wikilink',
        targetName: match[2].split(/[|#]/)[0].trim(),
        heading: null,
        resolvedPath: null,
      },
  );
}

/** Attributes of a rendered link: in-app route, broken-link menu trigger, or nothing to open. */
function linkAttributes(
  context: LivePreviewContext,
  link: DocumentLinkDto | null,
  raw: string,
): { className: string; attributes: Record<string, string> } {
  if (!link?.resolvedPath) {
    return {
      className: 'cm-lp-link cm-lp-link-broken',
      attributes: {
        'data-broken-raw': raw,
        'data-broken-target': link?.targetName ?? raw.split(/[|#]/)[0].trim(),
        title: link?.targetName ?? raw,
      },
    };
  }

  const route =
    link.resolvedPath === context.sourcePath ? null : toInAppNoteRoute(link.resolvedPath);
  return route
    ? {
        className: 'cm-lp-link',
        attributes: {
          'data-route': route,
          'data-path': link.resolvedPath,
          title: link.resolvedPath,
        },
      }
    : { className: 'cm-lp-link cm-lp-link-plain', attributes: { title: link.resolvedPath } };
}

/** End offset of the YAML header at the top of the note (its closing `---` line), or 0 without one. */
export function findFrontmatterEnd(state: EditorState): number {
  if (state.doc.line(1).text.trim() !== '---' || state.doc.lines < 2) {
    return 0;
  }

  for (let lineNumber = 2; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    if (FRONTMATTER_CLOSE.has(line.text.trim())) {
      return line.to;
    }
  }

  return 0;
}

/**
 * The properties box lists: key and value of each top-level line of the YAML header (`header` is the text between
 * the two fences). A `title` that repeats the page title is left out. Shared by the live preview and Reading.
 */
export function frontmatterProperties(
  header: string,
  pageTitle?: string,
): readonly (readonly [string, string])[] {
  return header
    .split('\n')
    .map((entry) => /^([^:#\s][^:]*):\s?(.*)$/.exec(entry))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [match[1].trim(), match[2].trim()] as const)
    .filter(([key, value]) => !isTitleOf(pageTitle, key, value));
}

/** A `title: …` property that repeats the note's title (quotes around the value ignored). */
function isTitleOf(pageTitle: string | undefined, key: string, value: string): boolean {
  return (
    !!pageTitle &&
    key.toLowerCase() === 'title' &&
    value.replace(/^(["'])(.*)\1$/, '$2') === pageTitle
  );
}

/** The YAML header at the top of the note, shown as a properties box. */
function decorateFrontmatter(target: DecorationContext): number {
  const { state } = target;
  const end = findFrontmatterEnd(state);
  if (end === 0) {
    return 0;
  }

  const firstLine = state.doc.line(1);
  const closeLine = state.doc.lineAt(end);
  if (!isOnLines(state, 0, end)) {
    const entries = frontmatterProperties(
      state.doc.sliceString(firstLine.to + 1, closeLine.from),
      target.context.pageTitle,
    );
    // Collapsed (or nothing left to show): the header is replaced by nothing; the cursor reaching it shows the source.
    const isShown = target.context.showProperties !== false && entries.length > 0;
    target.ranges.push(
      Decoration.replace({
        block: true,
        widget: isShown
          ? new BlockWidget(
              `fm:${state.doc.sliceString(0, end)}:${target.context.pageTitle ?? ''}`,
              renderProperties(entries),
              firstLine.to,
            )
          : undefined,
      }).range(0, end),
    );
    target.blocks.push([0, end]);
  } else {
    for (let position = 0; position <= end;) {
      const frontmatterLine = state.doc.lineAt(position);
      target.ranges.push(
        Decoration.line({ class: 'cm-lp-frontmatter' }).range(frontmatterLine.from),
      );
      position = frontmatterLine.to + 1;
    }
  }

  return end;
}

function decorateSyntax(target: DecorationContext, frontmatterEnd: number): void {
  const { state, ranges, blocks, context } = target;
  const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state);

  tree.iterate({
    enter: (node) => {
      if (frontmatterEnd > 0 && node.to <= frontmatterEnd) {
        return false;
      }

      const name = node.name;

      if (name.startsWith('ATXHeading')) {
        const level = Number(name.slice('ATXHeading'.length)) || 1;
        ranges.push(
          Decoration.line({ class: `cm-lp-heading cm-lp-h${level}` }).range(
            state.doc.lineAt(node.from).from,
          ),
        );
        if (!isOnLines(state, node.from, node.to)) {
          for (const mark of node.node.getChildren('HeaderMark')) {
            const hideTo = state.sliceDoc(mark.to, mark.to + 1) === ' ' ? mark.to + 1 : mark.to;
            ranges.push(hidden.range(mark.from, hideTo));
          }
        }
        return;
      }

      const inlineMark = INLINE_MARKS[name];
      if (inlineMark) {
        if (name === 'InlineCode') {
          ranges.push(Decoration.mark({ class: 'cm-lp-inline-code' }).range(node.from, node.to));
        }
        if (!isTouched(state, node.from, node.to)) {
          for (const mark of node.node.getChildren(inlineMark)) {
            ranges.push(hidden.range(mark.from, mark.to));
          }
        }
        return name === 'InlineCode' ? false : undefined;
      }

      if (name === 'Link' || name === 'Image') {
        const marks = node.node.getChildren('LinkMark');
        const url = node.node.getChild('URL');
        // Only `[text](url)`: bare brackets (like the inside of a `[[wikilink]]`) are not links here.
        if (!url || marks.length < 2) {
          return false;
        }

        const href = state.sliceDoc(url.from, url.to);
        const isEditing = isTouched(state, node.from, node.to);
        if (name === 'Image') {
          const link = findLink(context, href);
          const src = /^https?:/i.test(href)
            ? href
            : link?.resolvedPath
              ? toAssetUrl(link.resolvedPath)
              : '';
          if (src && isEditing) {
            const alt = state.sliceDoc(marks[0].to, marks[1].from);
            ranges.push(
              Decoration.widget({
                widget: new ImageWidget(src, alt, true, link?.resolvedPath ?? null),
                side: -1,
              }).range(node.from),
            );
          } else if (src) {
            ranges.push(
              Decoration.replace({
                widget: new ImageWidget(
                  src,
                  state.sliceDoc(marks[0].to, marks[1].from),
                  false,
                  link?.resolvedPath ?? null,
                ),
              }).range(node.from, node.to),
            );
          }
          return false;
        }

        if (isEditing) {
          return false;
        }

        const textFrom = marks[0].to;
        const textTo = marks[1].from;
        ranges.push(hidden.range(node.from, textFrom), hidden.range(textTo, node.to));
        if (textTo > textFrom) {
          const external = /^(https?|mailto):/i.test(href);
          const { className, attributes } = external
            ? { className: 'cm-lp-link', attributes: { 'data-href': href, title: href } }
            : linkAttributes(context, findLink(context, href), href);
          ranges.push(
            Decoration.mark({ tagName: 'a', class: className, attributes }).range(textFrom, textTo),
          );
        }
        return false;
      }

      if (name === 'Blockquote') {
        const firstLine = state.doc.lineAt(node.from);
        const end = state.doc.lineAt(node.to).to;
        if (CALLOUT_HEADER_PATTERN.test(firstLine.text) && !isOnLines(state, node.from, end)) {
          const text = state.sliceDoc(firstLine.from, end);
          const html = renderMarkdownToSafeHtml(text, {
            links: linksForSnippet(context, text),
            sourcePath: context.sourcePath,
          });
          ranges.push(
            Decoration.replace({
              block: true,
              widget: new BlockWidget(
                `callout:${text}`,
                renderHtmlBlock(html, 'cm-lp-callout'),
                firstLine.to,
              ),
            }).range(firstLine.from, end),
          );
          blocks.push([firstLine.from, end]);
          return false;
        }

        for (let position = firstLine.from; position <= end;) {
          const line = state.doc.lineAt(position);
          ranges.push(Decoration.line({ class: 'cm-lp-quote' }).range(line.from));
          position = line.to + 1;
        }
        if (!isOnLines(state, node.from, end)) {
          node.node.cursor().iterate((child) => {
            if (child.name === 'QuoteMark') {
              const hideTo =
                state.sliceDoc(child.to, child.to + 1) === ' ' ? child.to + 1 : child.to;
              ranges.push(hidden.range(child.from, hideTo));
            }
          });
        }
        return;
      }

      if (name === 'HorizontalRule') {
        if (!isOnLines(state, node.from, node.to)) {
          ranges.push(
            Decoration.replace({ widget: new DividerWidget() }).range(node.from, node.to),
          );
        }
        return false;
      }

      if (name === 'Table') {
        const from = state.doc.lineAt(node.from).from;
        const to = state.doc.lineAt(node.to).to;
        if (!isOnLines(state, from, to)) {
          const text = state.sliceDoc(from, to);
          const html = renderMarkdownToSafeHtml(text, {
            links: linksForSnippet(context, text),
            sourcePath: context.sourcePath,
          });
          ranges.push(
            Decoration.replace({
              block: true,
              widget: new BlockWidget(
                `table:${text}`,
                renderHtmlBlock(html, 'cm-lp-table'),
                state.doc.lineAt(from).to,
              ),
            }).range(from, to),
          );
          blocks.push([from, to]);
        }
        return false;
      }

      if (name === 'FencedCode' || name === 'CodeBlock') {
        const firstLineFrom = state.doc.lineAt(node.from).from;
        const lastLineFrom = state.doc.lineAt(node.to).from;
        for (let position = firstLineFrom; position <= node.to;) {
          const line = state.doc.lineAt(position);
          const isFence =
            name === 'FencedCode' && (line.from === firstLineFrom || line.from === lastLineFrom);
          ranges.push(
            Decoration.line({
              class: isFence ? 'cm-lp-codeblock cm-lp-codefence' : 'cm-lp-codeblock',
            }).range(line.from),
          );
          position = line.to + 1;
        }
        return false;
      }

      if (name === 'ListMark') {
        const text = state.sliceDoc(node.from, node.to);
        if (BULLET_MARKS.has(text) && !isOnLines(state, node.from, node.to)) {
          // A task shows only its checkbox: its `- ` goes away instead of becoming a bullet.
          const isTask = node.node.nextSibling?.name === 'Task';
          const end =
            isTask && state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
          ranges.push(
            (isTask
              ? Decoration.replace({})
              : Decoration.replace({ widget: new BulletWidget() })
            ).range(node.from, end),
          );
        }
        return;
      }

      if (name === 'TaskMarker') {
        if (!isTouched(state, node.from, node.to)) {
          const checked = /x/i.test(state.sliceDoc(node.from, node.to));
          ranges.push(
            Decoration.replace({ widget: new TaskWidget(checked, node.from) }).range(
              node.from,
              node.to,
            ),
          );
        }
        return;
      }

      return;
    },
  });
}

/** `[[wikilinks]]` and `![[embeds]]`, which the markdown grammar does not know about. */
function decorateWikilinks(target: DecorationContext, frontmatterEnd: number): void {
  const { state, ranges, blocks, context } = target;
  const tree = syntaxTree(state);
  const text = state.doc.toString();

  for (const match of text.matchAll(WIKILINK_PATTERN)) {
    const from = match.index;
    const to = from + match[0].length;
    if (from < frontmatterEnd || isInBlock(blocks, from)) {
      continue;
    }

    if (tree.resolveInner(from, 1).name.includes('Code')) {
      continue;
    }

    const isEmbed = match[1] === '!';
    const raw = match[2];
    const link = findLink(context, raw);
    if (isTouched(state, from, to)) {
      if (isEmbed && link?.resolvedPath && IMAGE_PATTERN.test(link.resolvedPath)) {
        ranges.push(
          Decoration.widget({
            widget: new ImageWidget(
              toAssetUrl(link.resolvedPath),
              raw,
              true,
              link.resolvedPath,
              parseImageEmbed(raw).frame,
            ),
            side: -1,
          }).range(from),
        );
      }
      ranges.push(Decoration.mark({ class: 'cm-wikilink' }).range(from, to));
      continue;
    }

    if (isEmbed && link?.resolvedPath && IMAGE_PATTERN.test(link.resolvedPath)) {
      ranges.push(
        Decoration.replace({
          widget: new ImageWidget(
            toAssetUrl(link.resolvedPath),
            raw,
            false,
            link.resolvedPath,
            parseImageEmbed(raw).frame,
          ),
        }).range(from, to),
      );
      continue;
    }

    const mediaKind = isEmbed && link?.resolvedPath ? getMediaEmbedKind(link.resolvedPath) : null;
    if (mediaKind && link?.resolvedPath) {
      const pipeIndex = raw.indexOf('|');
      ranges.push(
        Decoration.replace({
          widget: new MediaEmbedWidget(
            mediaKind,
            link.resolvedPath,
            pipeIndex >= 0
              ? raw.slice(pipeIndex + 1)
              : mediaKind === 'encounter' || mediaKind === 'map'
                ? (link.resolvedTitle ?? link.targetName)
                : link.targetName,
            context.mediaLabels,
            context.playingAudioPath === link.resolvedPath,
            context.volume ?? 1,
            context.audioDurations?.get(link.resolvedPath) ?? NaN,
          ),
        }).range(from, to),
      );
      continue;
    }

    const innerFrom = from + match[1].length + 2;
    const innerTo = to - 2;
    const pipeIndex = raw.indexOf('|');
    const labelFrom = pipeIndex >= 0 ? innerFrom + pipeIndex + 1 : innerFrom;
    ranges.push(hidden.range(from, labelFrom), hidden.range(innerTo, to));

    if (innerTo > labelFrom) {
      const { className, attributes } = linkAttributes(context, link, raw);
      ranges.push(
        Decoration.mark({
          tagName: 'a',
          class: isEmbed ? `${className} cm-lp-embed` : className,
          attributes,
        }).range(labelFrom, innerTo),
      );
    }
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const target: DecorationContext = {
    state,
    context: state.field(contextField),
    ranges: [],
    blocks: [],
  };
  const frontmatterEnd = decorateFrontmatter(target);
  decorateSyntax(target, frontmatterEnd);
  decorateWikilinks(target, frontmatterEnd);
  return Decoration.set(target.ranges, true);
}

const livePreviewField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update(decorations, transaction) {
    const isContextChange = transaction.effects.some((effect) => effect.is(setLivePreviewContext));
    if (
      transaction.docChanged ||
      transaction.selection ||
      isContextChange ||
      syntaxTree(transaction.state) !== syntaxTree(transaction.startState)
    ) {
      return buildDecorations(transaction.state);
    }

    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const livePreviewTheme = EditorView.theme({
  '.cm-content': {
    fontFamily: 'var(--font-sans)',
    fontSize: 'calc(15px * var(--editor-text-scale, 1))',
    lineHeight: '1.65',
    padding: '24px 28px',
  },
  '.cm-lp-heading': {
    color: 'var(--foreground-strong)',
    fontFamily: 'var(--font-display)',
    fontWeight: '800',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    lineHeight: '1.15',
  },
  '.cm-lp-h1': { fontSize: '2.1em', paddingTop: '0.4em' },
  '.cm-lp-h2': { fontSize: '1.65em', paddingTop: '0.35em' },
  '.cm-lp-h3': { fontSize: '1.35em', paddingTop: '0.3em' },
  '.cm-lp-h4, .cm-lp-h5, .cm-lp-h6': { fontSize: '1.1em', paddingTop: '0.25em' },
  '.cm-lp-link': {
    color: 'var(--primary)',
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in oklch, var(--primary) 45%, transparent)',
    textUnderlineOffset: '3px',
  },
  '.cm-lp-link:hover': { color: 'var(--highlight)' },
  '.cm-lp-link-plain': { cursor: 'default' },
  '.cm-lp-link-broken': {
    color: 'var(--destructive)',
    textDecorationStyle: 'dashed',
    textDecorationColor: 'var(--destructive)',
  },
  '.cm-lp-inline-code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
    backgroundColor: 'var(--raised)',
    padding: '1px 4px',
  },
  // Same as a Reading quote: primary bar, muted text.
  '.cm-lp-quote': {
    borderLeft: '3px solid var(--primary)',
    paddingLeft: '1em !important',
    color: 'var(--muted-foreground)',
  },
  '.cm-lp-codeblock': {
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    backgroundColor: 'var(--card)',
    paddingLeft: '12px !important',
  },
  '.cm-lp-codefence': { color: 'var(--muted-foreground)' },
  '.cm-lp-frontmatter': { fontFamily: 'var(--font-mono)', fontSize: '13px' },
  '.cm-lp-bullet': { color: 'var(--primary)', fontWeight: '700', padding: '0 2px' },
  '.cm-lp-task': { marginRight: '0.3em', verticalAlign: '-0.12em', cursor: 'pointer' },
  '.cm-lp-image': {
    display: 'inline-block',
    maxWidth: '100%',
    margin: '4px 0',
    border: '1px solid var(--border)',
  },
  '.cm-lp-image-editing': {
    display: 'block',
  },
  '.cm-lp-hr': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    color: 'var(--primary)',
    fontSize: '12px',
    verticalAlign: 'middle',
  },
  '.cm-lp-hr::after': {
    content: '""',
    flex: '1',
    height: '1px',
    backgroundColor: 'var(--border)',
  },
  // Rendered HTML must not inherit the editor's `break-spaces` (it would show its newlines as blank lines).
  '.cm-lp-block-wrap': { display: 'flow-root', padding: '6px 0' },
  '.cm-lp-block': { margin: '0', cursor: 'text', whiteSpace: 'normal' },
  '.cm-lp-block > :first-child': { marginTop: '0' },
  '.cm-lp-block > :last-child': { marginBottom: '0' },
  '.cm-lp-properties': {
    display: 'grid',
    gridTemplateColumns: 'minmax(6rem, max-content) 1fr',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--card)',
    fontSize: '13px',
  },
  '.cm-lp-property-key': {
    padding: '6px 12px',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted-foreground)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  '.cm-lp-property-value': {
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-subtle)',
  },
});

/** Whether a line is inside a block the live preview shows rendered (table, callout, properties). */
function isInRenderedBlock(state: EditorState, lineFrom: number, lineTo: number): boolean {
  let found = false;
  state.field(livePreviewField).between(lineFrom, lineTo, (from, to, decoration) => {
    if (decoration.spec.block && from <= lineFrom && to >= lineTo) {
      found = true;
      return false;
    }
    return undefined;
  });
  return found;
}

/**
 * Up/Down onto a rendered block step onto its next line (which shows the block's source) instead of
 * jumping over the whole block, so the cursor always moves one line at a time.
 */
function stepIntoBlock(direction: -1 | 1): Command {
  return (view) => {
    const range = view.state.selection.main;
    if (!range.empty) {
      return false;
    }

    const line = view.state.doc.lineAt(range.head);
    const targetNumber = line.number + direction;
    if (targetNumber < 1 || targetNumber > view.state.doc.lines) {
      return false;
    }

    const target = view.state.doc.line(targetNumber);
    if (!isInRenderedBlock(view.state, target.from, target.to)) {
      return false;
    }

    const column = Math.min(range.head - line.from, target.length);
    view.dispatch({ selection: { anchor: target.from + column }, scrollIntoView: true });
    return true;
  };
}

/** Block marks at the start of a line: indentation, then a list / task / quote / heading prefix. */
const LINE_MARKS_PATTERN = /^[ \t]*(?:(?:[-*+]|\d+[.)]) (?:\[[ xX]\] )?|(?:> ?)+|#{1,6} )/;

/**
 * A click on a list, task, quote or heading line that lands in its (hidden) marks puts the cursor after
 * them, so typing writes the line's text instead of text before the `- ` / `> ` / `#`.
 */
const clickAfterLineMarks = EditorState.transactionFilter.of((transaction) => {
  const range = transaction.selection?.main;
  if (!range?.empty || !transaction.isUserEvent('select.pointer') || transaction.docChanged) {
    return transaction;
  }

  const line = transaction.state.doc.lineAt(range.head);
  const marks = LINE_MARKS_PATTERN.exec(line.text);
  if (!marks || range.head - line.from >= marks[0].length) {
    return transaction;
  }

  return [transaction, { selection: { anchor: line.from + marks[0].length }, sequential: true }];
});

// Above the default keymap, whose Up/Down would otherwise run first.
const livePreviewKeymap = Prec.high(
  keymap.of([
    { key: 'ArrowUp', run: stepIntoBlock(-1) },
    { key: 'ArrowDown', run: stepIntoBlock(1) },
  ]),
);

/**
 * Obsidian-like live preview for the markdown editor: the text stays editable, its markdown is shown
 * rendered, and the syntax of an element comes back while the cursor is on it. Links open on click.
 */
export function livePreview(): Extension {
  return [contextField, livePreviewField, livePreviewTheme, livePreviewKeymap, clickAfterLineMarks];
}
