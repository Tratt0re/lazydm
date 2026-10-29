import type { EditorView } from '@codemirror/view';

import { getLinkCompletionContext, type LinkSuggestion, suggestLinks } from './link-completion';

const EDITING_CLASS = 'cm-lp-cell-editing';
const STYLE_ID = 'lazydm-table-suggest-style';
const POPUP_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

/** Same look as the editor's own suggestion list; the popup lives in `body`, outside the editor's scoped theme. */
const POPUP_STYLE = `
.lazydm-table-suggest {
  position: fixed; z-index: 70; box-sizing: border-box; min-width: 18rem; max-width: 32rem; max-height: 18rem;
  margin: 0; padding: 0; overflow-y: auto; list-style: none;
  border: 1px solid var(--border); background-color: var(--popover); color: var(--foreground);
  font-family: var(--font-sans); font-size: 13px;
  box-shadow: 0 8px 24px color-mix(in oklch, black 25%, transparent);
}
.lazydm-table-suggest > li {
  display: flex; align-items: baseline; gap: 12px; padding: 6px 12px; line-height: 1.4; cursor: pointer;
}
.lazydm-table-suggest > li[aria-selected="true"] {
  background-color: var(--accent); color: var(--primary); box-shadow: inset 2px 0 0 var(--primary);
}
.lazydm-table-suggest .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lazydm-table-suggest .detail {
  margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--muted-foreground);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = POPUP_STYLE;
  document.head.append(style);
}

/** The caret's offset in the text of an edited cell, or null when the caret is not inside it. */
function getCaretOffset(cell: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !selection.isCollapsed || !cell.contains(selection.anchorNode)) {
    return null;
  }

  return selection.anchorNode === cell
    ? selection.anchorOffset > 0
      ? (cell.textContent ?? '').length
      : 0
    : selection.anchorOffset;
}

function placeCaretAt(cell: HTMLElement, offset: number): void {
  const text = cell.firstChild;
  const range = document.createRange();
  if (text?.nodeType === Node.TEXT_NODE) {
    range.setStart(text, Math.min(offset, text.textContent?.length ?? 0));
    range.collapse(true);
  } else {
    range.selectNodeContents(cell);
    range.collapse(false);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Where the popup goes: under the caret, or the cell when the caret has no box yet (an empty cell). */
function getAnchorRect(cell: HTMLElement): DOMRect {
  const selection = window.getSelection();
  const caret =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;
  return caret && (caret.height > 0 || caret.width > 0) ? caret : cell.getBoundingClientRect();
}

/**
 * File-name suggestions for a table cell edited in place, like the editor's own list: typing `[[`, `![[` or
 * `[label](` opens the files of the note's scope. The list never takes focus, so the cell keeps its caret, blur
 * and Tab / Enter handling; while it is open Arrow keys move in it, Enter or Tab pick, Escape closes it.
 */
export function attachTableLinkSuggest(view: EditorView, cell: HTMLElement): void {
  let popup: HTMLUListElement | null = null;
  let items: readonly LinkSuggestion[] = [];
  let replaceFrom = 0;
  let selected = 0;

  const close = () => {
    if (popup) {
      window.removeEventListener('scroll', close, true);
    }
    popup?.remove();
    popup = null;
    items = [];
  };

  const paintSelection = () => {
    popup?.querySelectorAll('li').forEach((item, index) => {
      item.setAttribute('aria-selected', String(index === selected));
      if (index === selected) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const pick = (index: number) => {
    const suggestion = items[index];
    const caret = getCaretOffset(cell);
    if (!suggestion || caret === null) {
      close();
      return;
    }

    const text = cell.textContent ?? '';
    const { linkTarget, closing } = suggestion;
    const hasClosing = text.slice(caret, caret + closing.length) === closing;
    const insert = hasClosing ? linkTarget : `${linkTarget}${closing}`;
    cell.textContent = `${text.slice(0, replaceFrom)}${insert}${text.slice(caret)}`;
    placeCaretAt(cell, replaceFrom + linkTarget.length + closing.length);
    close();
  };

  const place = () => {
    if (!popup) {
      return;
    }

    const anchor = getAnchorRect(cell);
    const { width, height } = popup.getBoundingClientRect();
    const fitsBelow =
      anchor.bottom + POPUP_GAP_PX + height <= window.innerHeight - VIEWPORT_MARGIN_PX;
    const top = fitsBelow
      ? anchor.bottom + POPUP_GAP_PX
      : Math.max(VIEWPORT_MARGIN_PX, anchor.top - POPUP_GAP_PX - height);
    const left = Math.min(anchor.left, window.innerWidth - width - VIEWPORT_MARGIN_PX);
    popup.style.top = `${top}px`;
    popup.style.left = `${Math.max(VIEWPORT_MARGIN_PX, left)}px`;
  };

  const update = () => {
    const context = getLinkCompletionContext(view.state);
    const caret = getCaretOffset(cell);
    const found =
      context && caret !== null && cell.classList.contains(EDITING_CLASS)
        ? suggestLinks((cell.textContent ?? '').slice(0, caret), context)
        : null;
    if (!found || found.suggestions.length === 0) {
      close();
      return;
    }

    ensureStyle();
    items = found.suggestions;
    replaceFrom = found.from;
    selected = 0;
    if (!popup) {
      popup = document.createElement('ul');
      popup.className = 'lazydm-table-suggest';
      popup.setAttribute('role', 'listbox');
      // Clicking an item must not blur the cell: that would end its edit before the pick.
      popup.addEventListener('mousedown', (event) => event.preventDefault());
      document.body.append(popup);
      // The list is fixed to the screen, so a scroll would leave it behind.
      window.addEventListener('scroll', close, true);
    }

    popup.replaceChildren(
      ...items.map((suggestion, index) => {
        const item = document.createElement('li');
        item.setAttribute('role', 'option');
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = suggestion.label;
        const detail = document.createElement('span');
        detail.className = 'detail';
        detail.textContent = suggestion.detail;
        item.append(label, detail);
        item.addEventListener('click', () => pick(index));
        return item;
      }),
    );
    paintSelection();
    place();
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (!popup || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      selected = (selected + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      paintSelection();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      pick(selected);
    } else if (event.key === 'Escape') {
      close();
    } else {
      return;
    }

    // The cell's own key handling (move to the next cell, leave the edit) must not also run.
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  // Registered before the table's own key handling, so an open list gets its keys first.
  cell.addEventListener('keydown', onKeydown);
  cell.addEventListener('input', update);
  cell.addEventListener('blur', close);
}
