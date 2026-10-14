/** Width of the code map column, in px (the scroll area keeps this much room on its right). */
export const CODE_MAP_WIDTH = 116;
/** Largest map scale (map px per content px): short notes are not blown up. */
const CODE_MAP_MAX_SCALE = 0.2;
/** A line this long (in characters) fills the map width. */
const CODE_MAP_FULL_LINE = 90;
/** Vertical room each heading label needs, by level. */
const LABEL_HEIGHTS: Readonly<Record<CodeMapHeading['level'], number>> = { 1: 14, 2: 13, 3: 12 };

/** The markdown elements the map tells apart, each with its own colour. */
export type CodeMapKind =
  'heading' | 'text' | 'list' | 'code' | 'quote' | 'table' | 'embed' | 'frontmatter' | 'rule';

/** Theme token of each kind (both themes define them), in the order of the Settings legend. */
export const CODE_MAP_COLORS: Readonly<Record<CodeMapKind, string>> = {
  heading: '--chart-1',
  text: '--muted-foreground',
  list: '--chart-3',
  code: '--chart-4',
  quote: '--chart-5',
  table: '--chart-6',
  embed: '--chart-2',
  frontmatter: '--chart-8',
  rule: '--border',
};

/** Kinds drawn on a faint tinted background, so a block of them reads as one shape. */
const TINTED_KINDS: ReadonlySet<CodeMapKind> = new Set(['code', 'quote', 'table', 'embed']);

/** A block of the note in content px (0 = top of the scrollable content). */
export interface CodeMapBlock {
  readonly top: number;
  readonly height: number;
  readonly kind: CodeMapKind;
  /** Characters of text in the block, spread over its visual lines. */
  readonly chars: number;
  /** Leading indentation, in characters (nested lists, indented code). */
  readonly indent: number;
}

export interface CodeMapHeading {
  readonly level: 1 | 2 | 3;
  readonly text: string;
  readonly top: number;
  /** Handed back to the source to jump to this heading. */
  readonly id: string;
}

export interface CodeMapContent {
  readonly contentHeight: number;
  readonly lineHeight: number;
  readonly blocks: readonly CodeMapBlock[];
  readonly headings: readonly CodeMapHeading[];
}

/** What the map is drawn for: the editor (CodeMirror) or the reading view (rendered HTML). */
export interface CodeMapSource {
  /** Positioned element the map is placed in; its right edge is the scroll area's right edge. */
  readonly host: HTMLElement;
  readonly scroller: HTMLElement;
  /** Scroll position at which the content's top (block `top` 0) is at the top of the scroll area. */
  contentOffset(): number;
  jumpTo(id: string): void;
}

/**
 * Xcode-like code map: the whole note at a small scale, one bar per visual line coloured by the markdown element
 * it belongs to, H1–H3 as readable labels where they are, and the visible part as a frame. It sits right before
 * the scroll area's scrollbar. Click or drag to scroll there, use the wheel to scroll the note, click a label to
 * jump to its heading. The source measures the note and calls `render`; the map follows scrolling by itself.
 */
export class CodeMap {
  private readonly dom = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly frame = document.createElement('div');
  private readonly labels = document.createElement('div');
  private readonly themeObserver = new MutationObserver(() => this.paint());
  private content: CodeMapContent | null = null;
  private scale = 0;
  private labelKey = '';
  private frameRequest = 0;

  constructor(private readonly source: CodeMapSource) {
    this.dom.className = 'app-codemap';
    this.dom.setAttribute('aria-hidden', 'true');
    this.frame.className = 'app-codemap-frame';
    this.labels.className = 'app-codemap-labels';
    this.dom.append(this.canvas, this.frame, this.labels);
    source.host.appendChild(this.dom);

    this.dom.addEventListener('pointerdown', this.handlePointerDown);
    this.dom.addEventListener('wheel', this.handleWheel, { passive: false });
    source.scroller.addEventListener('scroll', this.handleScroll, { passive: true });
    // Colours come from the theme tokens: repaint when the theme changes.
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
  }

  render(content: CodeMapContent): void {
    this.content = content;
    this.paint();
  }

  destroy(): void {
    cancelAnimationFrame(this.frameRequest);
    this.dom.removeEventListener('pointerdown', this.handlePointerDown);
    this.dom.removeEventListener('wheel', this.handleWheel);
    this.source.scroller.removeEventListener('scroll', this.handleScroll);
    this.themeObserver.disconnect();
    this.dom.remove();
  }

  private paint(): void {
    const content = this.content;
    if (!content) {
      return;
    }

    this.place();
    const width = this.dom.clientWidth;
    const height = this.dom.clientHeight;
    this.scale = Math.min(CODE_MAP_MAX_SCALE, height / Math.max(content.contentHeight, 1));

    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    const context = this.canvas.getContext('2d');
    if (context) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const styles = getComputedStyle(this.source.host);
      const colors = new Map<CodeMapKind, string>();
      const colorOf = (kind: CodeMapKind) => {
        if (!colors.has(kind)) {
          colors.set(kind, styles.getPropertyValue(CODE_MAP_COLORS[kind]).trim() || 'gray');
        }
        return colors.get(kind) as string;
      };
      for (const block of content.blocks) {
        this.paintBlock(context, block, colorOf(block.kind), width, content.lineHeight);
      }
    }

    this.placeLabels(content.headings, height);
    this.placeFrame();
  }

  private paintBlock(
    context: CanvasRenderingContext2D,
    block: CodeMapBlock,
    color: string,
    width: number,
    lineHeight: number,
  ): void {
    const scale = this.scale;
    const top = block.top * scale;
    const height = Math.max(1, block.height * scale);
    const usable = width - 12;
    context.fillStyle = color;

    if (block.kind === 'rule') {
      context.globalAlpha = 0.9;
      context.fillRect(6, top + height / 2, usable, 1);
      return;
    }

    if (TINTED_KINDS.has(block.kind)) {
      context.globalAlpha = 0.14;
      context.fillRect(4, top, width - 8, height);
      if (block.kind === 'quote') {
        context.globalAlpha = 0.8;
        context.fillRect(4, top, 2, height);
      }
      if (block.kind === 'embed') {
        return;
      }
    }

    const x =
      6 +
      (Math.min(block.indent, 16) / CODE_MAP_FULL_LINE) * usable +
      (block.kind === 'quote' ? 4 : 0);
    const rows = Math.max(1, Math.round(block.height / Math.max(lineHeight, 1)));
    const rowHeight = height / rows;
    const perRow = Math.max(1, Math.ceil(block.chars / rows));
    context.globalAlpha = block.kind === 'text' ? 0.45 : 0.75;
    for (let row = 0; row < rows; row++) {
      const chars = row === rows - 1 ? block.chars - perRow * (rows - 1) : perRow;
      if (chars <= 0) {
        continue;
      }
      const barWidth = Math.max(2, Math.min(1, chars / CODE_MAP_FULL_LINE) * (usable - (x - 6)));
      context.fillRect(x, top + row * rowHeight, barWidth, Math.max(1, rowHeight * 0.55));
    }
  }

  /** H1s first, then H2s, then H3s: a label that would overlap one already placed is left out. */
  private placeLabels(headings: readonly CodeMapHeading[], height: number): void {
    const placed: { top: number; bottom: number }[] = [];
    const shown: (CodeMapHeading & { y: number })[] = [];
    for (const level of [1, 2, 3] as const) {
      for (const heading of headings) {
        if (heading.level !== level) {
          continue;
        }

        const top = Math.max(0, Math.min(heading.top * this.scale, height - LABEL_HEIGHTS[level]));
        const bottom = top + LABEL_HEIGHTS[level];
        if (placed.some((box) => top < box.bottom && bottom > box.top)) {
          continue;
        }

        placed.push({ top, bottom });
        shown.push({ ...heading, y: top });
      }
    }

    const key = shown
      .map((label) => `${label.id}:${label.level}:${label.y}:${label.text}`)
      .join('|');
    if (key === this.labelKey) {
      return;
    }

    this.labelKey = key;
    this.labels.replaceChildren(
      ...shown.map((label) => {
        const element = document.createElement('div');
        element.className = 'app-codemap-label';
        element.dataset['level'] = String(label.level);
        element.dataset['id'] = label.id;
        element.style.top = `${label.y}px`;
        element.textContent = label.text;
        element.title = label.text;
        return element;
      }),
    );
  }

  /** Right before the scroll area's scrollbar (and above a horizontal one). */
  private place(): void {
    const scroller = this.source.scroller;
    const scrollbarWidth = scroller.offsetWidth - scroller.clientWidth;
    const scrollbarHeight = scroller.offsetHeight - scroller.clientHeight;
    const hostRect = this.source.host.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    this.dom.style.top = `${scrollerRect.top - hostRect.top}px`;
    this.dom.style.right = `${hostRect.right - scrollerRect.right + scrollbarWidth}px`;
    this.dom.style.bottom = `${hostRect.bottom - scrollerRect.bottom + scrollbarHeight}px`;
  }

  private placeFrame(): void {
    const scroller = this.source.scroller;
    const top = (scroller.scrollTop - this.source.contentOffset()) * this.scale;
    this.frame.style.top = `${Math.max(0, top)}px`;
    this.frame.style.height = `${Math.max(8, scroller.clientHeight * this.scale)}px`;
  }

  private readonly handleScroll = () => {
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = requestAnimationFrame(() => this.placeFrame());
  };

  /** The wheel over the map scrolls the note, as if it were over the text. */
  private readonly handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    this.source.scroller.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit });
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.scale <= 0) {
      return;
    }

    event.preventDefault();
    const label = (event.target as HTMLElement).closest<HTMLElement>('.app-codemap-label');
    if (label) {
      this.source.jumpTo(label.dataset['id'] ?? '');
      return;
    }

    this.scrollToMapY(event.clientY);
    this.dom.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => this.scrollToMapY(moveEvent.clientY);
    const up = () => {
      this.dom.removeEventListener('pointermove', move);
      this.dom.removeEventListener('pointerup', up);
      this.dom.removeEventListener('pointercancel', up);
    };
    this.dom.addEventListener('pointermove', move);
    this.dom.addEventListener('pointerup', up);
    this.dom.addEventListener('pointercancel', up);
  };

  /** Centres the note on the point of the map under the pointer. */
  private scrollToMapY(clientY: number): void {
    const scroller = this.source.scroller;
    const mapY = clientY - this.dom.getBoundingClientRect().top;
    scroller.scrollTop =
      mapY / this.scale + this.source.contentOffset() - scroller.clientHeight / 2;
  }
}
