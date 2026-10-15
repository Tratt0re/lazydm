import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { EditorSelection, EditorState, type Extension, Prec } from '@codemirror/state';
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
