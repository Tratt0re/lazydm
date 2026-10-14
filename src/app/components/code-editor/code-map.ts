import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/** Width of the map column, in px. */
const CODE_MAP_WIDTH = 116;
/** Largest map scale (map px per content px): short notes are not blown up. */
const CODE_MAP_MAX_SCALE = 0.2;
/** A line this long (in characters) fills the map width. */
const CODE_MAP_FULL_LINE = 90;
/** Notes longer than this draw only their first lines as bars (headings are always shown). */
const CODE_MAP_MAX_LINES = 20000;
/** Vertical room each heading label needs, by level. */
const LABEL_HEIGHTS: Readonly<Record<MapHeading['level'], number>> = { 1: 14, 2: 13, 3: 12 };
const HEADING_NODE_PATTERN = /^(?:ATXHeading|SetextHeading)([1-6])$/;

interface MapHeading {
  readonly level: 1 | 2 | 3;
  readonly text: string;
  readonly pos: number;
}

interface MapBar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface MapLayout {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly bars: readonly MapBar[];
  readonly labels: readonly (MapHeading & { readonly y: number })[];
  readonly barColor: string;
}

/** H1–H3 of the note, from the markdown syntax tree (so `#` lines inside code blocks are not headings). */
function headingsOf(state: EditorState): MapHeading[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 40) ?? syntaxTree(state);
  const headings: MapHeading[] = [];
  tree.iterate({
    enter: (node) => {
      const match = HEADING_NODE_PATTERN.exec(node.name);
      if (!match) {
        return;
      }

      const level = Number(match[1]);
      const text = state.doc
        .lineAt(node.from)
        .text.replace(/^\s{0,3}#{1,6}\s*/, '')
        .replace(/\s+#+\s*$/, '')
        .trim();
      if (level <= 3 && text) {
        headings.push({ level: level as MapHeading['level'], text, pos: node.from });
      }
      return false;
    },
  });
  return headings;
}

/**
 * Xcode-like code map on the right of the editor: the whole note at a small scale (one bar per visual line,
 * as long as its text), H1–H3 as readable labels where they are, and the visible part as a frame. Click or drag
 * the map to scroll; click a label to jump to its heading. Positions come from the editor's own layout, so
 * the live preview (hidden frontmatter, rendered blocks) and the source view both match what is shown.
 */
class CodeMapPlugin {
  private readonly dom = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly frame = document.createElement('div');
  private readonly labels = document.createElement('div');
  private readonly themeObserver = new MutationObserver(() => this.schedule());
  private headings: MapHeading[];
  private scale = 0;
  private labelKey = '';

  constructor(private readonly view: EditorView) {
    this.dom.className = 'cm-codemap';
    this.dom.setAttribute('aria-hidden', 'true');
    this.frame.className = 'cm-codemap-frame';
    this.labels.className = 'cm-codemap-labels';
    this.dom.append(this.canvas, this.frame, this.labels);
    view.dom.appendChild(this.dom);

    this.dom.addEventListener('pointerdown', this.handlePointerDown);
    view.scrollDOM.addEventListener('scroll', this.handleScroll, { passive: true });
    // Colours come from the theme tokens: redraw when the theme changes.
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    this.headings = headingsOf(view.state);
    this.schedule();
  }

  update(update: ViewUpdate): void {
    const isTreeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
    if (update.docChanged || isTreeChanged) {
      this.headings = headingsOf(update.state);
    }

    if (update.docChanged || isTreeChanged || update.geometryChanged || update.heightChanged) {
      this.schedule();
    }
  }

  destroy(): void {
    this.dom.removeEventListener('pointerdown', this.handlePointerDown);
    this.view.scrollDOM.removeEventListener('scroll', this.handleScroll);
    this.themeObserver.disconnect();
    this.dom.remove();
  }

  private schedule(): void {
    this.view.requestMeasure({
      key: this,
      read: () => this.measure(),
      write: (layout) => this.draw(layout),
    });
  }

  private readonly handleScroll = () => {
    this.view.requestMeasure({
      key: this.frame,
      read: () => this.measureFrame(),
      write: (frame) => this.placeFrame(frame),
    });
  };

  private measure(): MapLayout {
    const view = this.view;
    const width = this.dom.clientWidth;
    const height = this.dom.clientHeight;
    const scale = Math.min(CODE_MAP_MAX_SCALE, height / Math.max(view.contentHeight, 1));
    const headingLines = new Set(this.headings.map((heading) => view.state.doc.lineAt(heading.pos).number));
    const usableWidth = width - 12;
    const lineHeight = view.defaultLineHeight;
    const bars: MapBar[] = [];

    const lineCount = Math.min(view.state.doc.lines, CODE_MAP_MAX_LINES);
    let lastBlockFrom = -1;
    for (let number = 1; number <= lineCount; number++) {
      const line = view.state.doc.line(number);
      const block = view.lineBlockAt(line.from);
      // Lines replaced by one rendered block (live preview) are drawn once, as that block.
      if (block.from === lastBlockFrom || headingLines.has(number)) {
        continue;
      }
      lastBlockFrom = block.from;

      const text = view.state.sliceDoc(block.from, block.to);
      const trimmed = text.trim();
      if (!trimmed) {
        continue;
      }

      const indent = Math.min(text.length - text.trimStart().length, 16);
      const x = 6 + (indent / CODE_MAP_FULL_LINE) * usableWidth;
      const rows = Math.max(1, Math.round(block.height / lineHeight));
      const rowHeight = (block.height * scale) / rows;
      const charsPerRow = Math.max(1, Math.ceil(trimmed.length / rows));
      for (let row = 0; row < rows; row++) {
        const chars = row === rows - 1 ? trimmed.length - charsPerRow * (rows - 1) : charsPerRow;
        bars.push({
          x,
          y: block.top * scale + row * rowHeight,
          width: Math.max(2, Math.min(1, chars / CODE_MAP_FULL_LINE) * (usableWidth - (x - 6))),
          height: Math.max(1, rowHeight * 0.55),
        });
      }
    }

    return {
      width,
      height,
      scale,
      bars,
      labels: this.headings.map((heading) => ({
        ...heading,
        y: view.lineBlockAt(heading.pos).top * scale,
      })),
      barColor: getComputedStyle(view.dom).getPropertyValue('--muted-foreground').trim() || 'gray',
    };
  }

  private draw(layout: MapLayout): void {
    this.scale = layout.scale;

    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(layout.width * ratio);
    this.canvas.height = Math.round(layout.height * ratio);
    const context = this.canvas.getContext('2d');
    if (context) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, layout.width, layout.height);
      context.fillStyle = layout.barColor;
      context.globalAlpha = 0.45;
      for (const bar of layout.bars) {
        context.fillRect(bar.x, bar.y, bar.width, bar.height);
      }
    }

    this.placeLabels(layout);
    this.placeFrame(this.measureFrame());
  }

  /** H1s first, then H2s, then H3s: a label that would overlap one already placed is left out. */
  private placeLabels(layout: MapLayout): void {
    const placed: { top: number; bottom: number }[] = [];
    const shown: (MapHeading & { y: number })[] = [];
    for (const level of [1, 2, 3] as const) {
      for (const label of layout.labels) {
        if (label.level !== level) {
          continue;
        }

        const top = Math.max(0, Math.min(label.y, layout.height - LABEL_HEIGHTS[level]));
        const bottom = top + LABEL_HEIGHTS[level];
        if (placed.some((box) => top < box.bottom && bottom > box.top)) {
          continue;
        }

        placed.push({ top, bottom });
        shown.push({ ...label, y: top });
      }
    }

    const key = shown.map((label) => `${label.pos}:${label.level}:${label.y}:${label.text}`).join('|');
    if (key === this.labelKey) {
      return;
    }

    this.labelKey = key;
    this.labels.replaceChildren(
      ...shown.map((label) => {
        const element = document.createElement('div');
        element.className = 'cm-codemap-label';
        element.dataset['level'] = String(label.level);
        element.dataset['pos'] = String(label.pos);
        element.style.top = `${label.y}px`;
        element.textContent = label.text;
        element.title = label.text;
        return element;
      }),
    );
  }

  /** Top of the note's content inside the scroller (its padding), and the visible part. */
  private measureFrame(): { top: number; height: number } {
    const scroller = this.view.scrollDOM;
    const contentOffset = this.contentOffset();
    return {
      top: (scroller.scrollTop - contentOffset) * this.scale,
      height: scroller.clientHeight * this.scale,
    };
  }

  private placeFrame(frame: { top: number; height: number }): void {
    this.frame.style.top = `${Math.max(0, frame.top)}px`;
    this.frame.style.height = `${Math.max(8, frame.height)}px`;
  }

  private contentOffset(): number {
    const scroller = this.view.scrollDOM;
    return this.view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.scale <= 0) {
      return;
    }

    event.preventDefault();
    const label = (event.target as HTMLElement).closest<HTMLElement>('.cm-codemap-label');
    if (label) {
      this.view.dispatch({
        effects: EditorView.scrollIntoView(Number(label.dataset['pos']), { y: 'start', yMargin: 24 }),
      });
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

  /** Centres the editor on the point of the map under the pointer. */
  private scrollToMapY(clientY: number): void {
    const scroller = this.view.scrollDOM;
    const mapY = clientY - this.dom.getBoundingClientRect().top;
    scroller.scrollTop = mapY / this.scale + this.contentOffset() - scroller.clientHeight / 2;
  }
}

const codeMapTheme = EditorView.theme({
  '.cm-scroller': {
    marginRight: `${CODE_MAP_WIDTH}px`,
  },
  '.cm-codemap': {
    position: 'absolute',
    top: '0',
    right: '0',
    bottom: '0',
    width: `${CODE_MAP_WIDTH}px`,
    overflow: 'hidden',
    borderLeft: '1px solid var(--border)',
    backgroundColor: 'var(--recessed)',
    cursor: 'pointer',
    userSelect: 'none',
    zIndex: '3',
  },
  '.cm-codemap canvas': {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
  },
  '.cm-codemap-frame': {
    position: 'absolute',
    left: '0',
    right: '0',
    border: '1px solid color-mix(in oklch, var(--primary) 55%, transparent)',
    backgroundColor: 'color-mix(in oklch, var(--foreground) 7%, transparent)',
    pointerEvents: 'none',
  },
  '.cm-codemap-labels': {
    position: 'absolute',
    inset: '0',
  },
  // Labels mask the bars behind them, like Xcode's section marks.
  '.cm-codemap-label': {
    position: 'absolute',
    left: '4px',
    maxWidth: 'calc(100% - 8px)',
    paddingInline: '2px',
    backgroundColor: 'var(--recessed)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.2',
    color: 'var(--primary)',
  },
  '.cm-codemap-label:hover': {
    textDecoration: 'underline',
  },
  '.cm-codemap-label[data-level="1"]': {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  '.cm-codemap-label[data-level="2"]': {
    fontSize: '9.5px',
    fontWeight: '600',
  },
  '.cm-codemap-label[data-level="3"]': {
    paddingLeft: '8px',
    fontSize: '9px',
    opacity: '0.8',
  },
});

/** The code map (Settings → Editor → Code map). */
export function codeMap(): Extension {
  return [ViewPlugin.fromClass(CodeMapPlugin), codeMapTheme];
}
