import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node builtins available in vitest
import { readFileSync } from 'fs';
// @ts-ignore
import { resolve } from 'path';

// @ts-ignore -- __dirname available in vitest CJS context
const css: string = readFileSync(resolve(__dirname, '../../global.css'), 'utf-8');

// #660: jsdom has no layout, so the alignment is pinned at the rule: when the "View all N
// completed" link is showing, the columns without it reserve a line of the same height.
describe('column header alignment (#660)', () => {
  it('reserves the archive link line in the other columns on desktop', () => {
    expect(css).toMatch(
      /@media \(min-width: 768px\) \{\s*\.board-columns:has\(\.column-archive-link\) \.column-header:not\(:has\(\.column-archive-link\)\)::after \{\s*content: '';\s*height: 16px;/,
    );
  });

  it('gives the link the same height it reserves', () => {
    expect(css).toMatch(/\.column-archive-link \{\s*line-height: 16px;/);
  });
});
