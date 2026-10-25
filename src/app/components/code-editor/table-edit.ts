export type TableAlign = 'left' | 'center' | 'right' | null;

/**
 * A markdown table as data: the header cells, one alignment per column and the body rows. Cells keep their
 * markdown source (`**bold**`, `[[link]]`, `\|`), so rewriting a table never loses formatting.
 */
export interface TableModel {
  readonly header: readonly string[];
  readonly aligns: readonly TableAlign[];
  readonly rows: readonly (readonly string[])[];
}

const DELIMITER_CELL = /^:?-+:?$/;
/** A `|` that is not escaped as `\|`. */
const UNESCAPED_PIPE = /(?<!\\)\|/;

function splitCells(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) {
    text = text.slice(1);
  }
  if (/(?<!\\)\|$/.test(text)) {
    text = text.slice(0, -1);
  }

  return text.split(UNESCAPED_PIPE).map((cell) => cell.trim());
}

function alignOf(cell: string): TableAlign {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) {
    return 'center';
  }

  return right ? 'right' : left ? 'left' : null;
}

/** Fits a row to `width` cells: short rows get empty cells, long ones lose the extra (as markdown does). */
function fit(cells: readonly string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => cells[index] ?? '');
}

/** The table in `text` (its source lines), or null when it is not a header, a delimiter row and rows. */
export function parseTable(text: string): TableModel | null {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    return null;
  }

  const header = splitCells(lines[0]);
  const delimiter = splitCells(lines[1]);
  if (!delimiter.every((cell) => DELIMITER_CELL.test(cell)) || delimiter.length !== header.length) {
    return null;
  }

  const width = header.length;
  return {
    header,
    aligns: delimiter.map(alignOf),
    rows: lines.slice(2).map((line) => fit(splitCells(line), width)),
  };
}

function delimiterOf(align: TableAlign, width: number): string {
  const dashes = '-'.repeat(Math.max(width, 3));
  if (align === 'center') {
    return `:${dashes.slice(2)}:`;
  }

  return align === 'left'
    ? `:${dashes.slice(1)}`
    : align === 'right'
      ? `${dashes.slice(1)}:`
      : dashes;
}

/** The table as aligned markdown: every column as wide as its widest cell. */
export function serializeTable(model: TableModel): string {
  const widths = model.header.map((cell, column) =>
    Math.max(3, cell.length, ...model.rows.map((row) => row[column].length)),
  );
  const line = (cells: readonly string[]) =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
  return [
    line(model.header),
    `| ${model.aligns.map((align, column) => delimiterOf(align, widths[column])).join(' | ')} |`,
    ...model.rows.map(line),
  ].join('\n');
}

/** Text typed in a cell as its markdown source: one line, with its pipes escaped. */
export function toCellSource(text: string): string {
  return text
    .replace(/\s*\n\s*/g, ' ')
    .replace(/(?<!\\)\|/g, '\\|')
    .trim();
}

/** A new empty body row at `index` (0 = first row, `rows.length` = last). */
export function insertRow(model: TableModel, index: number): TableModel {
  const rows = [...model.rows];
  rows.splice(
    index,
    0,
    model.header.map(() => ''),
  );
  return { ...model, rows };
}

export function deleteRow(model: TableModel, index: number): TableModel {
  return { ...model, rows: model.rows.filter((_, row) => row !== index) };
}

/** A new empty column at `index` (0 = first, `header.length` = last). */
export function insertColumn(model: TableModel, index: number): TableModel {
  const add = <T>(cells: readonly T[], value: T) => [
    ...cells.slice(0, index),
    value,
    ...cells.slice(index),
  ];
  return {
    header: add(model.header, ''),
    aligns: add<TableAlign>(model.aligns, null),
    rows: model.rows.map((row) => add(row, '')),
  };
}

/** The table without a column; the last column stays (a table needs one). */
export function deleteColumn(model: TableModel, index: number): TableModel {
  if (model.header.length <= 1) {
    return model;
  }

  const drop = <T>(cells: readonly T[]) => cells.filter((_, column) => column !== index);
  return { header: drop(model.header), aligns: drop(model.aligns), rows: model.rows.map(drop) };
}

export function setColumnAlign(model: TableModel, column: number, align: TableAlign): TableModel {
  return { ...model, aligns: model.aligns.map((current, i) => (i === column ? align : current)) };
}

/** Sets one cell's source; row -1 is the header. */
export function setCell(
  model: TableModel,
  row: number,
  column: number,
  source: string,
): TableModel {
  const replace = (cells: readonly string[]) =>
    cells.map((cell, i) => (i === column ? source : cell));
  return row < 0
    ? { ...model, header: replace(model.header) }
    : { ...model, rows: model.rows.map((cells, i) => (i === row ? replace(cells) : cells)) };
}
