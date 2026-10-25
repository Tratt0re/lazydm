import { describe, expect, it } from 'vitest';

import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  parseTable,
  serializeTable,
  setCell,
  setColumnAlign,
  toCellSource,
  type TableModel,
} from './table-edit';

const SOURCE = '| Name | HP |\n| --- | --- |\n| Goblin | 7 |\n| Orc | 15 |';

function table(text = SOURCE): TableModel {
  const model = parseTable(text);
  if (!model) {
    throw new Error('not a table');
  }
  return model;
}

describe('parseTable', () => {
  it('reads header, alignments and rows', () => {
    expect(table('| A | B | C |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |')).toEqual({
      header: ['A', 'B', 'C'],
      aligns: ['left', 'center', 'right'],
      rows: [['1', '2', '3']],
    });
  });

  it('accepts a table without outer pipes', () => {
    expect(table('A | B\n--- | ---\n1 | 2').rows).toEqual([['1', '2']]);
  });

  it('keeps an escaped pipe inside its cell', () => {
    expect(table('| A | B |\n| - | - |\n| a\\|b | c |').rows).toEqual([['a\\|b', 'c']]);
  });

  it('fits short and long rows to the header width', () => {
    expect(table('| A | B |\n| - | - |\n| 1 |\n| 1 | 2 | 3 |').rows).toEqual([
      ['1', ''],
      ['1', '2'],
    ]);
  });

  it('returns null when it is not a table', () => {
    expect(parseTable('just text')).toBeNull();
    expect(parseTable('| A | B |\n| x | y |')).toBeNull();
    expect(parseTable('| A | B |\n| - |')).toBeNull();
  });
});

describe('serializeTable', () => {
  it('aligns the columns and round-trips a table', () => {
    const text = serializeTable(table());
    expect(text).toBe('| Name   | HP  |\n| ------ | --- |\n| Goblin | 7   |\n| Orc    | 15  |');
    expect(table(text)).toEqual(table());
  });

  it('writes the alignment markers', () => {
    const model = setColumnAlign(setColumnAlign(table(), 0, 'center'), 1, 'right');
    expect(serializeTable(model).split('\n')[1]).toBe('| :----: | --: |');
  });
});

describe('editing', () => {
  it('inserts a row at the start, in the middle and at the end', () => {
    expect(insertRow(table(), 0).rows[0]).toEqual(['', '']);
    expect(insertRow(table(), 1).rows.map((row) => row[0])).toEqual(['Goblin', '', 'Orc']);
    expect(insertRow(table(), 2).rows.at(-1)).toEqual(['', '']);
  });

  it('deletes a row', () => {
    expect(deleteRow(table(), 0).rows).toEqual([['Orc', '15']]);
  });

  it('inserts a column in every row and keeps the others aligned', () => {
    const model = insertColumn(setColumnAlign(table(), 1, 'right'), 1);
    expect(model.header).toEqual(['Name', '', 'HP']);
    expect(model.aligns).toEqual([null, null, 'right']);
    expect(model.rows[0]).toEqual(['Goblin', '', '7']);
  });

  it('deletes a column but never the last one', () => {
    expect(deleteColumn(table(), 0).header).toEqual(['HP']);
    const single = deleteColumn(table(), 0);
    expect(deleteColumn(single, 0)).toBe(single);
  });

  it('sets a body cell and a header cell', () => {
    expect(setCell(table(), 1, 1, '20').rows[1]).toEqual(['Orc', '20']);
    expect(setCell(table(), -1, 0, 'Monster').header).toEqual(['Monster', 'HP']);
  });
});

describe('toCellSource', () => {
  it('escapes pipes once and flattens line breaks', () => {
    expect(toCellSource('a | b')).toBe('a \\| b');
    expect(toCellSource('a \\| b')).toBe('a \\| b');
    expect(toCellSource('one\ntwo')).toBe('one two');
  });
});
