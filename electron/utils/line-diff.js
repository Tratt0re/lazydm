/**
 * Line diff of two texts (longest common subsequence), for the copy-vs-original view of the Review page.
 * Ops are `{ type: 'same' | 'del' | 'add', text }` (`del`: only in the first text, `add`: only in the second).
 * Returns null when the texts differ over too many lines for a table (the view then shows the two texts apart).
 */
function diffLines(firstText, secondText, maxCells = 4_000_000) {
  const a = String(firstText).replace(/\r\n/g, '\n').split('\n');
  const b = String(secondText).replace(/\r\n/g, '\n').split('\n');

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const middleA = a.slice(start, endA);
  const middleB = b.slice(start, endB);
  if (middleA.length * middleB.length > maxCells) {
    return null;
  }

  const n = middleA.length;
  const m = middleB.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        middleA[i] === middleB[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const ops = a.slice(0, start).map((text) => ({ type: 'same', text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (middleA[i] === middleB[j]) {
      ops.push({ type: 'same', text: middleA[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ type: 'del', text: middleA[i] });
      i += 1;
    } else {
      ops.push({ type: 'add', text: middleB[j] });
      j += 1;
    }
  }

  for (; i < n; i += 1) {
    ops.push({ type: 'del', text: middleA[i] });
  }
  for (; j < m; j += 1) {
    ops.push({ type: 'add', text: middleB[j] });
  }

  for (let k = endA; k < a.length; k += 1) {
    ops.push({ type: 'same', text: a[k] });
  }

  return ops;
}

/** Folds the runs of unchanged lines that are longer than the context into `{ type: 'skip', count }`. */
function trimContext(ops, context = 2) {
  const result = [];
  let index = 0;
  while (index < ops.length) {
    if (ops[index].type !== 'same') {
      result.push(ops[index]);
      index += 1;
      continue;
    }

    let end = index;
    while (end < ops.length && ops[end].type === 'same') {
      end += 1;
    }

    const isFirst = index === 0;
    const isLast = end === ops.length;
    const keepBefore = isFirst ? 0 : context;
    const keepAfter = isLast ? 0 : context;
    const run = end - index;
    if (run <= keepBefore + keepAfter + 1) {
      result.push(...ops.slice(index, end));
    } else {
      result.push(...ops.slice(index, index + keepBefore));
      result.push({ type: 'skip', count: run - keepBefore - keepAfter });
      result.push(...ops.slice(end - keepAfter, end));
    }

    index = end;
  }

  return result;
}

module.exports = {
  diffLines,
  trimContext,
};
