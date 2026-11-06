import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { diffLines, trimContext } = require('../utils/line-diff');

const kinds = (ops) => ops.map((op) => `${op.type}:${op.text ?? op.count}`);

describe('diffLines', () => {
  it('marks nothing for equal texts', () => {
    expect(diffLines('a\nb', 'a\nb').every((op) => op.type === 'same')).toBe(true);
  });

  it('finds an added, a removed and a changed line', () => {
    expect(kinds(diffLines('a\nb\nc', 'a\nc\nd'))).toEqual([
      'same:a',
      'del:b',
      'same:c',
      'add:d',
    ]);
  });

  it('ignores the line ending style', () => {
    expect(diffLines('a\r\nb', 'a\nb').every((op) => op.type === 'same')).toBe(true);
  });

  it('gives up on texts that differ over too many lines', () => {
    expect(diffLines('a\n'.repeat(3000), 'b\n'.repeat(3000), 1000)).toBeNull();
  });
});

describe('trimContext', () => {
  it('folds long unchanged runs and keeps the lines around a change', () => {
    const lines = Array.from({ length: 20 }, (_, index) => `l${index}`).join('\n');
    const ops = trimContext(diffLines(lines, lines.replace('l10', 'changed')), 2);
    expect(kinds(ops)).toEqual([
      'skip:8',
      'same:l8',
      'same:l9',
      'del:l10',
      'add:changed',
      'same:l11',
      'same:l12',
      'skip:7',
    ]);
  });
});
