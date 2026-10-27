import { EditorView, WidgetType } from '@codemirror/view';

import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  parseTable,
  serializeTable,
  setCell,
  type TableModel,
  toCellSource,
} from './table-edit';

/** Accessible names of the table's own controls (i18n, set by the editor). */
export interface TableLabels {
  readonly addRow: string;
  readonly addColumn: string;
}

/** The cell to edit once the table has been rebuilt from the changed note (`row` -1 is the header). */
interface CellTarget {
  readonly row: number;
  readonly column: number;
  /** Where the caret goes in the cell's text; the end when missing. */
  readonly offset?: number;
  /** Open the cell's menu here instead of editing it (a right-click that had to write a pending edit first). */
  readonly menuAt?: { readonly x: number; readonly y: number };
}

export type TableMenuAction =
  'rowAbove' | 'rowBelow' | 'deleteRow' | 'columnLeft' | 'columnRight' | 'deleteColumn';

/** A cell's menu is asked for: where, what it may do, and how to do it (the editor hosts the menu). */
export interface TableMenuRequest {
  readonly x: number;
  readonly y: number;
  readonly canInsertAbove: boolean;
  readonly canDeleteRow: boolean;
  readonly canDeleteColumn: boolean;
  readonly run: (action: TableMenuAction) => void;
}

/** Bubbles from a table to the editor, carrying a `TableMenuRequest`. */
export const TABLE_MENU_EVENT = 'lazydm-table-menu';

/** Which cell of a table to open, and where the caret goes in it. */
export interface TableSpot {
  readonly row: 'first' | 'last';
  readonly column: 'first' | 'last';
  readonly caret: 'start' | 'end';
}

/** Set just before a table edit is dispatched; the rebuilt table takes it and puts the cursor back. */
const pendingCell = new WeakMap<EditorView, CellTarget>();

const ENTER_EVENT = 'lazydm-table-enter';

/**
 * Opens a cell of the table that starts at `from`, as when arrowing onto it from the line above or below.
 * False when that table is not editable in place.
 */
export function enterTable(view: EditorView, from: number, spot: TableSpot): boolean {
  for (const wrap of view.contentDOM.querySelectorAll<HTMLElement>('.cm-lp-table-wrap')) {
    if (view.posAtDOM(wrap) === from) {
      return !wrap.dispatchEvent(new CustomEvent(ENTER_EVENT, { detail: spot, cancelable: true }));
    }
  }

  return false;
}

/** The caret's offset in an edited cell, or undefined when the caret is not in it. */
function caretOffset(element: HTMLElement): number | undefined {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !element.contains(selection.anchorNode)) {
    return undefined;
  }

  return selection.anchorNode === element
    ? selection.anchorOffset > 0
      ? (element.textContent ?? '').length
      : 0
    : selection.anchorOffset;
}

function placeCaret(element: HTMLElement, offset?: number): void {
  const range = document.createRange();
  const text = element.firstChild;
  if (offset !== undefined && text?.nodeType === Node.TEXT_NODE) {
    range.setStart(text, Math.min(offset, text.textContent?.length ?? 0));
    range.collapse(true);
  } else {
    range.selectNodeContents(element);
    range.collapse(false);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * A markdown table rendered in the live preview whose cells are edited in place: a click turns a cell into its
 * markdown source, leaving it (or Enter / Tab) writes the table back to the note as one change, and the buttons
 * add rows and columns. The rendered HTML comes from the same renderer as Reading.
 */
export class TableWidget extends WidgetType {
  constructor(
    /** The table's source lines, as in the note. */
    private readonly text: string,
    /** The same table rendered (sanitized HTML), used for the cells that are not being edited. */
    private readonly html: string,
    private readonly labels: TableLabels,
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return (
      other.text === this.text &&
      other.html === this.html &&
      other.labels.addRow === this.labels.addRow &&
      other.labels.addColumn === this.labels.addColumn
    );
  }

  /** The widget handles its own mouse and keys; the editor must not move its cursor into the table. */
  override ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-lp-block-wrap cm-lp-table-wrap';
    const block = document.createElement('div');
    block.className = 'cm-lp-block arc-markdown-body cm-lp-table';
    block.innerHTML = this.html;
    wrap.append(block);

    const model = parseTable(this.text);
    const table = block.querySelector('table');
    if (!model || !table) {
      return wrap;
    }

    const cellAt = (row: number, column: number): HTMLElement | null =>
      (table.rows[row + 1]?.cells[column] as HTMLElement | undefined) ?? null;
    const sourceOf = (row: number, column: number) =>
      row < 0 ? model.header[column] : model.rows[row][column];

    /** Writes a changed table back to the note: one change (one undo step) over the range the widget covers. */
    const apply = (next: TableModel, focus: CellTarget | null) => {
      const from = view.posAtDOM(wrap);
      if (view.state.sliceDoc(from, from + this.text.length) !== this.text) {
        return;
      }

      if (focus) {
        pendingCell.set(view, focus);
      }
      view.dispatch({
        changes: { from, to: from + this.text.length, insert: serializeTable(next) },
        userEvent: 'input',
      });
    };

    let editing: { cell: HTMLElement; row: number; column: number; saved: string } | null = null;

    const begin = (row: number, column: number, offset?: number) => {
      const cell = cellAt(row, column);
      if (!cell) {
        return;
      }

      editing = { cell, row, column, saved: cell.innerHTML };
      cell.textContent = sourceOf(row, column);
      cell.classList.add('cm-lp-cell-editing');
      cell.contentEditable = 'plaintext-only';
      cell.focus();
      placeCaret(cell, offset);
    };

    /**
     * Leaves the table for the line above or below it (Up from the header, Down from the last row), writing
     * the edited cell on the way; the cursor lands on that line, so the table stays rendered.
     */
    const leave = (direction: 'before' | 'after') => {
      let next = model;
      const current = editing;
      if (current) {
        editing = null;
        const source = toCellSource(current.cell.textContent ?? '');
        current.cell.removeAttribute('contenteditable');
        current.cell.classList.remove('cm-lp-cell-editing');
        if (source === sourceOf(current.row, current.column)) {
          current.cell.innerHTML = current.saved;
        } else {
          next = setCell(model, current.row, current.column, source);
        }
      }

      const from = view.posAtDOM(wrap);
      if (view.state.sliceDoc(from, from + this.text.length) !== this.text) {
        return;
      }

      const insert = next === model ? this.text : serializeTable(next);
      const docLength = view.state.doc.length - this.text.length + insert.length;
      const anchor = direction === 'before' ? from - 1 : from + insert.length + 1;
      view.dispatch({
        changes: next === model ? undefined : { from, to: from + this.text.length, insert },
        selection: anchor >= 0 && anchor <= docLength ? { anchor } : undefined,
        userEvent: next === model ? undefined : 'input',
      });
      view.focus();
    };

    /** Ends the edit; a changed cell rewrites the table (and `focus` is edited next). True if it did. */
    const finish = (focus: CellTarget | null, save = true): boolean => {
      const current = editing;
      if (!current) {
        return false;
      }

      editing = null;
      const source = toCellSource(current.cell.textContent ?? '');
      current.cell.removeAttribute('contenteditable');
      current.cell.classList.remove('cm-lp-cell-editing');
      if (!save || source === sourceOf(current.row, current.column)) {
        current.cell.innerHTML = current.saved;
        return false;
      }

      apply(setCell(model, current.row, current.column, source), focus);
      return true;
    };

    /** Moves the edit to another cell; when leaving rewrote the table, the rebuilt table opens that cell. */
    const moveTo = (row: number, column: number, offset?: number) => {
      if (!finish({ row, column, offset })) {
        begin(row, column, offset);
      }
    };

    /** Asks the editor for the cell's menu (it hosts it): insert and delete for the cell's row and column. */
    const showMenu = (row: number, column: number, x: number, y: number) => {
      const request: TableMenuRequest = {
        x,
        y,
        canInsertAbove: row >= 0,
        canDeleteRow: row >= 0,
        canDeleteColumn: model.header.length > 1,
        run: (action) => {
          switch (action) {
            case 'rowAbove':
              apply(insertRow(model, row), { row, column });
              break;
            case 'rowBelow':
              apply(insertRow(model, row + 1), { row: row + 1, column });
              break;
            case 'deleteRow':
              apply(deleteRow(model, row), null);
              break;
            case 'columnLeft':
              apply(insertColumn(model, column), { row, column });
              break;
            case 'columnRight':
              apply(insertColumn(model, column + 1), { row, column: column + 1 });
              break;
            case 'deleteColumn':
              apply(deleteColumn(model, column), null);
              break;
          }
        },
      };
      wrap.dispatchEvent(new CustomEvent(TABLE_MENU_EVENT, { bubbles: true, detail: request }));
    };

    /** Writes any pending cell edit first; if that rebuilt the table, the new one opens the menu. */
    const openMenu = (row: number, column: number, x: number, y: number) => {
      if (!finish({ row, column, menuAt: { x, y } })) {
        showMenu(row, column, x, y);
      }
    };

    for (const [rowIndex, tableRow] of [...table.rows].entries()) {
      for (const [column, cell] of [...tableRow.cells].entries()) {
        const row = rowIndex - 1;
        cell.addEventListener('mousedown', (event) => {
          if (
            event.button !== 0 ||
            (event.target as HTMLElement).closest('a, [data-broken-raw]') ||
            editing?.cell === cell
          ) {
            return;
          }

          event.preventDefault();
          if (!finish({ row, column })) {
            begin(row, column);
          }
        });
        cell.addEventListener('contextmenu', (event) => {
          // The cell's own menu, not the editor's.
          event.preventDefault();
          event.stopPropagation();
          openMenu(row, column, event.clientX, event.clientY);
        });
        cell.addEventListener('blur', () => finish(null));
        cell.addEventListener('keydown', (event) => {
          if (editing?.cell !== cell) {
            return;
          }

          const lastRow = model.rows.length - 1;
          const lastColumn = model.header.length - 1;
          if (event.key === 'Escape') {
            event.preventDefault();
            finish(null, false);
            view.focus();
          } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (row < lastRow) {
              moveTo(row + 1, column);
            } else {
              finish(null);
              view.focus();
            }
          } else if (event.key === 'Tab') {
            event.preventDefault();
            let nextRow = row;
            let nextColumn = column + (event.shiftKey ? -1 : 1);
            if (nextColumn > lastColumn) {
              nextColumn = 0;
              nextRow += 1;
            } else if (nextColumn < 0) {
              nextColumn = lastColumn;
              nextRow -= 1;
            }

            if (nextRow < -1) {
              return;
            }
            if (nextRow > lastRow) {
              // Tab out of the last cell adds a row, as in a spreadsheet.
              const changed = toCellSource(cell.textContent ?? '');
              const base =
                changed === sourceOf(row, column) ? model : setCell(model, row, column, changed);
              editing = null;
              cell.removeAttribute('contenteditable');
              apply(insertRow(base, model.rows.length), { row: model.rows.length, column: 0 });
              return;
            }
            moveTo(nextRow, nextColumn);
          } else if (
            (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
            !event.shiftKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.ctrlKey
          ) {
            // Up / Down move between cells; past the first or last row they leave the table.
            event.preventDefault();
            const nextRow = row + (event.key === 'ArrowUp' ? -1 : 1);
            if (nextRow < -1) {
              leave('before');
            } else if (nextRow > lastRow) {
              leave('after');
            } else {
              moveTo(nextRow, column);
            }
          } else if (
            (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
            !event.shiftKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.ctrlKey
          ) {
            // Left at the start of a cell and Right at its end go on to the neighbouring cell; past the first
            // or last cell they leave the table. Elsewhere in the text they move the caret as usual.
            const caret = caretOffset(cell);
            const length = (cell.textContent ?? '').length;
            if (!window.getSelection()?.isCollapsed || caret === undefined) {
              return;
            }

            if (event.key === 'ArrowLeft' && caret === 0) {
              event.preventDefault();
              if (column > 0) {
                moveTo(row, column - 1);
              } else if (row > -1) {
                moveTo(row - 1, lastColumn);
              } else {
                leave('before');
              }
            } else if (event.key === 'ArrowRight' && caret === length) {
              event.preventDefault();
              if (column < lastColumn) {
                moveTo(row, column + 1, 0);
              } else if (row < lastRow) {
                moveTo(row + 1, 0, 0);
              } else {
                leave('after');
              }
            }
          } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const rect = cell.getBoundingClientRect();
            openMenu(row, column, rect.left, rect.bottom);
          } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            // Keys inside a widget never reach the editor: write the cell, then hand the save to it.
            // Writing a changed cell rebuilds the table, which reopens this cell with the caret where it was.
            event.preventDefault();
            const source = toCellSource(cell.textContent ?? '');
            if (source !== sourceOf(row, column)) {
              const offset = caretOffset(cell);
              editing = null;
              apply(setCell(model, row, column, source), { row, column, offset });
            }
            view.contentDOM.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 's',
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
        });
      }
    }

    const addButton = (className: string, label: string, onClick: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cm-lp-table-add ${className}`;
      button.textContent = '+';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        finish(null);
        onClick();
      });
      wrap.append(button);
    };
    addButton('cm-lp-table-add-row', this.labels.addRow, () =>
      apply(insertRow(model, model.rows.length), { row: model.rows.length, column: 0 }),
    );
    addButton('cm-lp-table-add-column', this.labels.addColumn, () =>
      apply(insertColumn(model, model.header.length), { row: -1, column: model.header.length }),
    );

    wrap.addEventListener(ENTER_EVENT, (event) => {
      event.preventDefault();
      const spot = (event as CustomEvent<TableSpot>).detail;
      begin(
        spot.row === 'first' ? -1 : model.rows.length - 1,
        spot.column === 'first' ? 0 : model.header.length - 1,
        spot.caret === 'start' ? 0 : undefined,
      );
    });

    const target = pendingCell.get(view);
    if (target) {
      pendingCell.delete(view);
      // The wrapper is attached to the editor by the next frame.
      requestAnimationFrame(() => {
        if (target.menuAt) {
          showMenu(target.row, target.column, target.menuAt.x, target.menuAt.y);
        } else {
          begin(target.row, target.column, target.offset);
        }
      });
    }

    return wrap;
  }
}
