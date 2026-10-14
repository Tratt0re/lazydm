import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import {
  CODE_MAP_WIDTH,
  CodeMap,
  type CodeMapBlock,
  type CodeMapContent,
  type CodeMapHeading,
  type CodeMapKind,
} from '@/components/code-map/code-map';
import { findFrontmatterEnd } from './live-preview';

/** Notes longer than this draw only their first lines (headings are always shown). */
const CODE_MAP_MAX_LINES = 20000;
const HEADING_NODE_PATTERN = /^(?:ATXHeading|SetextHeading)([1-6])$/;
/** Markdown syntax nodes and the map kind of every line they cover (the outermost node wins). */
const NODE_KINDS: Readonly<Record<string, CodeMapKind>> = {
  FencedCode: 'code',
  CodeBlock: 'code',
  HTMLBlock: 'code',
  Blockquote: 'quote',
  Table: 'table',
  BulletList: 'list',
  OrderedList: 'list',
  HorizontalRule: 'rule',
};
const EMBED_LINE_PATTERN = /^\s*!\[/;

interface NoteHeading {
  readonly level: 1 | 2 | 3;
  readonly text: string;
  readonly pos: number;
}

/** The map kind of every line (index = line number), and the H1–H3 of the note. */
function analyse(state: EditorState): { kinds: CodeMapKind[]; headings: NoteHeading[] } {
  const doc = state.doc;
  const kinds: CodeMapKind[] = new Array(doc.lines + 1).fill('text');
  const headings: NoteHeading[] = [];
  const mark = (from: number, to: number, kind: CodeMapKind) => {
    for (let line = doc.lineAt(from).number; line <= doc.lineAt(to).number; line++) {
      kinds[line] = kind;
    }
  };

  const frontmatterEnd = findFrontmatterEnd(state);
  if (frontmatterEnd > 0) {
    mark(0, frontmatterEnd, 'frontmatter');
  }

  const tree = ensureSyntaxTree(state, doc.length, 40) ?? syntaxTree(state);
  tree.iterate({
    enter: (node) => {
      if (node.name === 'Document') {
        return undefined;
      }
      if (node.from < frontmatterEnd) {
        return false;
      }

      const heading = HEADING_NODE_PATTERN.exec(node.name);
      if (heading) {
        mark(node.from, node.to, 'heading');
        const level = Number(heading[1]);
        const text = doc
          .lineAt(node.from)
          .text.replace(/^\s{0,3}#{1,6}\s*/, '')
          .replace(/\s+#+\s*$/, '')
          .trim();
        if (level <= 3 && text) {
          headings.push({ level: level as NoteHeading['level'], text, pos: node.from });
        }
        return false;
      }

      const kind = NODE_KINDS[node.name];
      if (kind) {
        mark(node.from, node.to, kind);
      }
      return false;
    },
  });

  for (let line = 1; line <= doc.lines; line++) {
    if (kinds[line] === 'text' && EMBED_LINE_PATTERN.test(doc.line(line).text)) {
      kinds[line] = 'embed';
    }
  }

  return { kinds, headings };
}

/**
 * The code map of the editor (Settings → Editor → Code map): measures the note from the editor's own layout, so
 * the live preview (hidden frontmatter, rendered tables and callouts) and the source view match what is shown;
 * the drawing, labels, frame and pointer handling are the shared `CodeMap`.
 */
class CodeMapPlugin {
  private readonly map: CodeMap;
  private analysis: ReturnType<typeof analyse>;

  constructor(private readonly view: EditorView) {
    this.analysis = analyse(view.state);
    this.map = new CodeMap({
      host: view.dom,
      scroller: view.scrollDOM,
      contentOffset: () =>
        view.documentTop - view.scrollDOM.getBoundingClientRect().top + view.scrollDOM.scrollTop,
      jumpTo: (id) =>
        view.dispatch({
          effects: EditorView.scrollIntoView(Number(id), { y: 'start', yMargin: 24 }),
        }),
    });
    this.schedule();
  }

  update(update: ViewUpdate): void {
    const isTreeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
    if (update.docChanged || isTreeChanged) {
      this.analysis = analyse(update.state);
    }

    if (update.docChanged || isTreeChanged || update.geometryChanged || update.heightChanged) {
      this.schedule();
    }
  }

  destroy(): void {
    this.map.destroy();
  }

  private schedule(): void {
    this.view.requestMeasure({
      key: this,
      read: () => this.measure(),
      write: (content) => this.map.render(content),
    });
  }

  private measure(): CodeMapContent {
    const view = this.view;
    const doc = view.state.doc;
    const { kinds, headings } = this.analysis;
    const blocks: CodeMapBlock[] = [];

    const lineCount = Math.min(doc.lines, CODE_MAP_MAX_LINES);
    let lastBlockFrom = -1;
    for (let number = 1; number <= lineCount; number++) {
      const line = doc.line(number);
      const block = view.lineBlockAt(line.from);
      // Lines replaced by one rendered block (live preview) are drawn once, as that block.
      if (block.from === lastBlockFrom) {
        continue;
      }
      lastBlockFrom = block.from;

      const kind = kinds[number] ?? 'text';
      if (kind === 'heading') {
        continue; // shown as labels
      }

      const text = view.state.sliceDoc(block.from, block.to);
      const chars = text.trim().length;
      if (!chars && kind !== 'rule') {
        continue;
      }

      blocks.push({
        top: block.top,
        height: block.height,
        kind,
        chars,
        indent: text.length - text.trimStart().length,
      });
    }

    return {
      contentHeight: view.contentHeight,
      lineHeight: view.defaultLineHeight,
      blocks,
      headings: headings.map<CodeMapHeading>((heading) => ({
        level: heading.level,
        text: heading.text,
        top: view.lineBlockAt(heading.pos).top,
        id: String(heading.pos),
      })),
    };
  }
}

/** The scroll area keeps room for the map on its right, so its scrollbar comes after the map. */
const codeMapTheme = EditorView.theme({
  '.cm-scroller': {
    paddingRight: `${CODE_MAP_WIDTH}px`,
  },
});

/** The code map (Settings → Editor → Code map). */
export function codeMap(): Extension {
  return [ViewPlugin.fromClass(CodeMapPlugin), codeMapTheme];
}
