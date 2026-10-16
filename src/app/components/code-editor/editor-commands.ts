import { closeBrackets, closeBracketsKeymap, startCompletion } from '@codemirror/autocomplete';
import { EditorSelection, EditorState, type Extension, type Line, Prec } from '@codemirror/state';
import { type Command, EditorView, keymap } from '@codemirror/view';

/** Typed with a selection, these wrap it (opening → closing) instead of replacing it. */
const WRAP_PAIRS: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
  '*': '*',
  _: '_',
  '~': '~',
};

/** Pairs closed while typing when *Auto-close pairs* is on (no `'`: it would close every apostrophe). */
const AUTO_CLOSE_BRACKETS = ['(', '[', '{', '"', '`'];

/** Length of the run of `char` ending at `position` (direction -1) or starting at it (direction 1). */
function countRun(state: EditorState, position: number, char: string, direction: -1 | 1): number {
  let count = 0;
  let index = direction < 0 ? position - 1 : position;
  while (index >= 0 && index < state.doc.length && state.sliceDoc(index, index + 1) === char) {
    count++;
    index += direction;
  }
  return count;
}

/**
 * Whether marks of `count` characters around a text already apply `marker`. Emphasis shares its
 * character with bold, so `*` counts as applied on odd runs (`*a*`, `***a***`) and `**` on runs of
 * two or more (`**a**`, `***a***`); other markers just need the run to be long enough.
 */
function isMarkerApplied(marker: string, count: number): boolean {
  if (marker === '*' || marker === '_') {
    return count % 2 === 1;
  }
  if (marker === '**' || marker === '__') {
    return count >= 2;
  }
  return count >= marker.length;
}

/**
 * Toggles an inline marker (`**`, `*`, `~~`, `` ` ``) on every selection range: wraps the selection,
 * or removes the marks around it (or at its edges, when they are selected too). An empty range gets
 * the pair with the cursor inside.
 */
export function toggleInlineMarker(marker: string): Command {
  const char = marker[0];
  return (view) => {
    const { state } = view;
    view.dispatch(
      state.changeByRange((range) => {
        if (range.empty) {
          return {
            changes: { from: range.from, insert: `${marker}${marker}` },
            range: EditorSelection.cursor(range.from + marker.length),
          };
        }

        const outside = Math.min(
          countRun(state, range.from, char, -1),
          countRun(state, range.to, char, 1),
        );
        if (isMarkerApplied(marker, outside)) {
          return {
            changes: [
              { from: range.from - marker.length, to: range.from },
              { from: range.to, to: range.to + marker.length },
            ],
            range: EditorSelection.range(range.from - marker.length, range.to - marker.length),
          };
        }

        const inside = Math.min(
          countRun(state, range.from, char, 1),
          countRun(state, range.to, char, -1),
        );
        if (range.to - range.from > marker.length * 2 && isMarkerApplied(marker, inside)) {
          return {
            changes: [
              { from: range.from, to: range.from + marker.length },
              { from: range.to - marker.length, to: range.to },
            ],
            range: EditorSelection.range(range.from, range.to - marker.length * 2),
          };
        }

        return {
          changes: [
            { from: range.from, insert: marker },
            { from: range.to, insert: marker },
          ],
          range: EditorSelection.range(range.from + marker.length, range.to + marker.length),
        };
      }),
      { scrollIntoView: true, userEvent: 'input' },
    );
    return true;
  };
}

/** Cmd/Ctrl+B, Cmd/Ctrl+I. Listed before the default keymap, so they win over its Mod-i. */
export const formattingKeymap = [
  { key: 'Mod-b', preventDefault: true, run: toggleInlineMarker('**') },
  { key: 'Mod-i', preventDefault: true, run: toggleInlineMarker('*') },
];

/**
 * Typing an opening bracket, quote or inline marker with text selected wraps the selection (every
 * range) and keeps it selected; with no selection the character is typed as usual. High precedence,
 * so it runs before the auto-close pairs when those are on.
 */
export const wrapSelectionOnInput: Extension = Prec.high(
  EditorView.inputHandler.of((view, _from, _to, text) => {
    const closing = WRAP_PAIRS[text];
    const { ranges } = view.state.selection;
    if (closing === undefined || view.composing || ranges.some((range) => range.empty)) {
      return false;
    }

    view.dispatch(
      view.state.changeByRange((range) => ({
        changes: [
          { from: range.from, insert: text },
          { from: range.to, insert: closing },
        ],
        range: EditorSelection.range(range.from + text.length, range.to + text.length),
      })),
      { scrollIntoView: true, userEvent: 'input.type' },
    );
    return true;
  }),
);

/** *Auto-close pairs* (Settings → Editor): typed pairs get their closing half; Backspace removes both. */
export function autoClosePairs(): Extension {
  return [
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
    EditorState.languageData.of(() => [{ closeBrackets: { brackets: AUTO_CLOSE_BRACKETS } }]),
  ];
}

// ---------------------------------------------------------------------------------------------
// Insert menu (right-click): headings, line prefixes, blocks, links, clipboard
// ---------------------------------------------------------------------------------------------

/** What the insert menu can do; each one is a command of `INSERT_COMMANDS`. */
export type EditorInsertAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'quote'
  | 'codeBlock'
  | 'table'
  | 'divider'
  | 'calloutNote'
  | 'calloutTip'
  | 'calloutWarning'
  | 'calloutDanger'
  | 'link'
  | 'asset'
  | 'importFile';

type LinePrefixKind = 'bullet' | 'ordered' | 'task' | 'quote';

const HEADING_PREFIX = /^#{1,6}[ \t]+/;
/** Any list or quote prefix a line can have, so switching kinds replaces it instead of stacking. */
const LINE_PREFIX_PATTERNS: Readonly<Record<LinePrefixKind, RegExp>> = {
  task: /^[-*+] \[[ xX]\] /,
  bullet: /^[-*+] /,
  ordered: /^\d+[.)] /,
  quote: /^> ?/,
};
const LINE_PREFIX_KINDS: readonly LinePrefixKind[] = ['task', 'bullet', 'ordered', 'quote'];

const TABLE_TEMPLATE = '| Column | Column |\n| --- | --- |\n|  |  |\n|  |  |';
const CODE_FENCE = '```';

/** The lines touched by the selection ranges, once each, in document order. */
function selectedLines(state: EditorState): Line[] {
  const lines = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    for (let position = range.from; position <= range.to;) {
      const line = state.doc.lineAt(position);
      lines.set(line.number, line);
      position = line.to + 1;
    }
  }
  return [...lines.values()].sort((a, b) => a.number - b.number);
}

/** Leading whitespace of a line, kept when its prefix changes (nested list items). */
function splitIndent(text: string): { indent: string; rest: string } {
  const indent = /^[ \t]*/.exec(text)![0];
  return { indent, rest: text.slice(indent.length) };
}

/**
 * A line's block marks: its indentation, its list or quote prefix and its heading `#` marks (a
 * line is a heading or a list/quote item; the commands below switch it from one to the other).
 */
function parseLineMarks(line: Line) {
  const { indent, rest } = splitIndent(line.text);
  const prefix = findLinePrefix(rest);
  const heading = HEADING_PREFIX.exec(rest.slice(prefix?.length ?? 0));
  return { indent, prefix, headingLength: heading?.[0].length ?? 0 };
}

function findLinePrefix(rest: string): { kind: LinePrefixKind; length: number } | null {
  for (const kind of LINE_PREFIX_KINDS) {
    const match = LINE_PREFIX_PATTERNS[kind].exec(rest);
    if (match) {
      return { kind, length: match[0].length };
    }
  }
  return null;
}

/**
 * H1–H3 on the selected lines: their `#` marks (and any list or quote prefix) are replaced by
 * `level` ones; the text stays.
 */
function setHeading(level: number): Command {
  return (view) => {
    const marks = `${'#'.repeat(level)} `;
    const ends = new Map<number, number>();
    const changes = view.state.changes(
      selectedLines(view.state).map((line) => {
        const { indent, prefix, headingLength } = parseLineMarks(line);
        const to = line.from + indent.length + (prefix?.length ?? 0) + headingLength;
        ends.set(line.number, to);
        return { from: line.from, to, insert: marks };
      }),
    );
    // As for lists: a cursor at the start of the line (or in its marks) goes after the new `#` marks.
    const selection = EditorSelection.create(
      view.state.selection.ranges.map((range) => {
        const marksEnd = ends.get(view.state.doc.lineAt(range.head).number) ?? range.head;
        const head = changes.mapPos(Math.max(range.head, marksEnd), 1);
        return range.empty ? EditorSelection.cursor(head) : range.map(changes, 1);
      }),
      view.state.selection.mainIndex,
    );
    view.dispatch({ changes, selection, scrollIntoView: true, userEvent: 'input' });
    return true;
  };
}

/**
 * Lists and quotes on the selected lines: removed when every line already has that prefix,
 * otherwise set on each line (replacing another list or quote prefix, and heading marks).
 * Numbered lists count up.
 */
function toggleLinePrefix(kind: LinePrefixKind): Command {
  return (view) => {
    const parsed = selectedLines(view.state).map((line) => ({ line, ...parseLineMarks(line) }));
    const isRemoving = parsed.every(({ prefix }) => prefix?.kind === kind);
    let number = 0;
    const changes = view.state.changes(
      parsed.map(({ line, indent, prefix, headingLength }) => {
        const from = line.from + indent.length;
        const prefixTo = from + (prefix?.length ?? 0);
        if (isRemoving) {
          return { from, to: prefixTo };
        }
        const to = prefixTo + headingLength;
        number++;
        const insert =
          kind === 'bullet'
            ? '- '
            : kind === 'task'
              ? '- [ ] '
              : kind === 'ordered'
                ? `${number}. `
                : '> ';
        return { from, to, insert };
      }),
    );
    // A cursor left at the start of the line (or inside the old prefix) goes after the new prefix: typing
    // then writes the item's text, not text before the mark. `1` maps positions past inserted text.
    const selection = EditorSelection.create(
      view.state.selection.ranges.map((range) => {
        const lineFrom = view.state.doc.lineAt(range.head).from;
        const { indent, prefix } = parseLineMarks(view.state.doc.lineAt(range.head));
        const marksEnd = lineFrom + indent.length + (prefix?.length ?? 0);
        const head = range.head <= marksEnd ? changes.mapPos(marksEnd, 1) : changes.mapPos(range.head, 1);
        return range.empty ? EditorSelection.cursor(head) : range.map(changes, 1);
      }),
      view.state.selection.mainIndex,
    );
    view.dispatch({ changes, selection, scrollIntoView: true, userEvent: 'input' });
    return true;
  };
}

/**
 * Inserts a block on its own lines: at the cursor's line when it is empty, otherwise after it with a
 * blank line between. `select` is the part of `text` left selected (or the cursor), as offsets.
 */
function insertBlock(
  text: string,
  select: readonly [number, number] = [text.length, text.length],
): Command {
  return (view) => {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const isEmpty = line.text.trim() === '';
    const from = isEmpty ? line.from : line.to;
    const before = isEmpty ? '' : '\n\n';
    const start = from + before.length;
    view.dispatch({
      changes: { from, to: line.to, insert: `${before}${text}` },
      selection: EditorSelection.range(start + select[0], start + select[1]),
      scrollIntoView: true,
      userEvent: 'input',
    });
    return true;
  };
}

/** A fenced code block around the selected lines, or an empty one with the cursor inside. */
const insertCodeBlock: Command = (view) => {
  const range = view.state.selection.main;
  if (range.empty) {
    return insertBlock(`${CODE_FENCE}\n\n${CODE_FENCE}`, [4, 4])(view);
  }

  const first = view.state.doc.lineAt(range.from);
  const last = view.state.doc.lineAt(range.to);
  view.dispatch({
    changes: [
      { from: first.from, insert: `${CODE_FENCE}\n` },
      { from: last.to, insert: `\n${CODE_FENCE}` },
    ],
    selection: EditorSelection.cursor(first.from + CODE_FENCE.length),
    scrollIntoView: true,
    userEvent: 'input',
  });
  return true;
};

/** A callout (`> [!type]`) with the cursor on its first content line. */
function insertCallout(type: string): Command {
  return insertBlock(`> [!${type}]\n> `);
}

/**
 * Starts a `[[link]]` or `![[embed]]` at the cursor and opens the link suggestions; selected text
 * becomes what the suggestions are filtered on.
 */
function startLink(opening: string): Command {
  return (view) => {
    const range = view.state.selection.main;
    const query = view.state.sliceDoc(range.from, range.to);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `${opening}${query}` },
      selection: EditorSelection.cursor(range.from + opening.length + query.length),
      scrollIntoView: true,
      userEvent: 'input',
    });
    startCompletion(view);
    return true;
  };
}

/**
 * Cut / copy / paste as the native menu would. In the app, paste is a real paste (the main process
 * pastes into the focused editor), so it goes through the editor's paste handling like Cmd/Ctrl+V and
 * media files become assets; without Electron it falls back to the clipboard's plain text.
 */
function clipboardCommand(action: 'cut' | 'copy' | 'paste'): Command {
  return (view) => {
    const range = view.state.selection.main;
    const windowControls = window.electronAPI?.ipcClient?.window;
    if (action === 'paste' && windowControls) {
      windowControls
        .paste()
        .catch((error: unknown) => console.warn('[app] Paste failed:', error));
      return true;
    }

    if (action === 'paste') {
      void navigator.clipboard
        .readText()
        .then((text) =>
          view.dispatch(view.state.replaceSelection(text), {
            scrollIntoView: true,
            userEvent: 'input.paste',
          }),
        )
        .catch((error: unknown) => console.warn('[app] Clipboard read failed:', error));
      return true;
    }

    if (range.empty) {
      return false;
    }

    void navigator.clipboard
      .writeText(view.state.sliceDoc(range.from, range.to))
      .then(() => {
        if (action === 'cut') {
          view.dispatch({
            changes: { from: range.from, to: range.to },
            userEvent: 'delete.cut',
          });
        }
      })
      .catch((error: unknown) => console.warn('[app] Clipboard write failed:', error));
    return true;
  };
}

/** *Import file…* needs the note page (file dialog, saving): the editor emits it instead of running a command. */
export const INSERT_COMMANDS: Readonly<Record<Exclude<EditorInsertAction, 'importFile'>, Command>> = {
  cut: clipboardCommand('cut'),
  copy: clipboardCommand('copy'),
  paste: clipboardCommand('paste'),
  bold: toggleInlineMarker('**'),
  italic: toggleInlineMarker('*'),
  strikethrough: toggleInlineMarker('~~'),
  inlineCode: toggleInlineMarker('`'),
  heading1: setHeading(1),
  heading2: setHeading(2),
  heading3: setHeading(3),
  bulletList: toggleLinePrefix('bullet'),
  orderedList: toggleLinePrefix('ordered'),
  taskList: toggleLinePrefix('task'),
  quote: toggleLinePrefix('quote'),
  codeBlock: insertCodeBlock,
  table: insertBlock(TABLE_TEMPLATE, [2, 8]),
  divider: insertBlock('---\n'),
  calloutNote: insertCallout('note'),
  calloutTip: insertCallout('tip'),
  calloutWarning: insertCallout('warning'),
  calloutDanger: insertCallout('danger'),
  link: startLink('[['),
  asset: startLink('![['),
};
