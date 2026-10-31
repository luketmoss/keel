// How the index keeps a cell list on the device (#692): sorted, as differences,
// in base 36. About 2 KB for an activity of 500 cells. Pure.

/** Cells to text: the first cell, then each difference from the one before, comma separated. */
export function encodeCells(cells: readonly number[]): string {
  const sorted = [...cells].sort((a, b) => a - b);
  let prev = 0;
  return sorted
    .map((c) => {
      const d = c - prev;
      prev = c;
      return d.toString(36);
    })
    .join(',');
}

/** The cells in `text`, or null when it is not something `encodeCells` wrote. */
export function decodeCells(text: string): number[] | null {
  if (text === '') return [];
  const out: number[] = [];
  let prev = 0;
  for (const part of text.split(',')) {
    if (!/^[0-9a-z]+$/.test(part)) return null;
    const d = parseInt(part, 36);
    if (!Number.isSafeInteger(d)) return null;
    prev += d;
    out.push(prev);
  }
  return out;
}
