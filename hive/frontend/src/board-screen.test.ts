// #626 — the board in Thrive's look. jsdom has no layout, so the stylesheet-level criteria are
// read from the CSS itself: no tinted columns, outlined chips, the tabs and the drop target.
// The measured contrast of every new text and surface pair is computed here and compared with
// the table recorded in hive/docs/design/626-board-screen.md, so the note cannot drift from the tokens.
import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node builtins available at test runtime
import { readFileSync } from 'fs';
// @ts-ignore
import { resolve } from 'path';
import { readGlobalCss, tokens } from './test-css';
import { ownerColor } from './components/today/today-format';
import { here } from './test-controls';

const css = readGlobalCss().replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  selector: string;
  body: string;
  media: string[];
  order: number;
}

function parse(text: string): Rule[] {
  const rules: Rule[] = [];
  const stack: string[] = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      if (prelude.startsWith('@')) stack.push(prelude);
      else {
        const close = text.indexOf('}', i);
        const body = text.slice(i + 1, close);
        for (const selector of prelude.split(',').map((s) => s.trim().replace(/\s+/g, ' '))) {
          rules.push({ selector, body, media: [...stack], order: rules.length });
        }
        i = close;
      }
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else if (ch === ';' && buf.trim().startsWith('@')) buf = '';
    else buf += ch;
  }
  return rules;
}

const rules = parse(css);

function decl(body: string, prop: string): string | undefined {
  const m = body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`));
  return m?.[1].trim();
}

/** The last declaration of `prop` among the rules whose selector is exactly `selector`, in `media` (or none). */
function prop(selector: string, p: string, media?: string): string | undefined {
  const hits = rules.filter(
    (r) => r.selector === selector && (media ? r.media.includes(media) : r.media.length === 0) && decl(r.body, p),
  );
  return hits.length ? decl(hits[hits.length - 1].body, p) : undefined;
}

const PHONE = '@media (max-width: 767px)';
const DESKTOP = '@media (min-width: 768px)';

describe('AC1: no column has a tinted background, in either theme', () => {
  it('.column draws no background, and no rule sets --column-color any more', () => {
    for (const r of rules.filter((x) => x.selector === '.column' || x.selector === '.column-compact')) {
      expect(decl(r.body, 'background'), r.selector).toBeUndefined();
      expect(decl(r.body, 'background-color'), r.selector).toBeUndefined();
    }
    expect(css).not.toContain('--column-color');
  });

  it('nothing on the board reads the column tints', () => {
    for (const r of rules.filter(
      (x) => /^\.(board|column|card|list|swimlane)/.test(x.selector) && !x.selector.startsWith('.column-settings'),
    )) {
      expect(r.body, r.selector).not.toMatch(/--color-(todo|inprogress|done|col-)/);
    }
  });

  it('cards sit on the page grey: the board draws no fill behind them', () => {
    expect(prop('.card', 'background')).toBe('var(--color-surface)');
    expect(prop('.card', 'border-radius')).toBe('var(--radius-lg)');
    for (const sel of ['.board-main', '.board-columns', '.column-cards']) {
      expect(prop(sel, 'background'), sel).toBeUndefined();
    }
  });
});

describe("AC2: column titles keep the board's casing", () => {
  it('a column heading is not upper-cased', () => {
    const r = rules.filter((x) => x.selector === '.column-header h2');
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(decl(x.body, 'text-transform')).toBeUndefined();
    expect(prop('.list-section-header h2', 'text-transform')).toBeUndefined();
  });
});

describe('AC5: the filter chips', () => {
  it('rest: outlined in --color-border-strong, never in the label colour', () => {
    expect(prop('.filter-chip', 'box-shadow')).toBe('inset 0 0 0 1px var(--color-border-strong)');
    for (const r of rules.filter((x) => x.selector.startsWith('.filter-chip'))) {
      expect(r.body, r.selector).not.toContain('--label-color');
    }
    expect(css).not.toContain('.filter-chip-label');
  });

  it('on: filled in --color-text with --color-bg text', () => {
    expect(prop('.filter-chip-active', 'background-color')).toBe('var(--color-text)');
    expect(prop('.filter-chip-active', 'color')).toBe('var(--color-bg)');
  });
});

describe('AC7: below 768px the filter row scrolls sideways and the Filters popup is gone', () => {
  it('is one nowrap line that scrolls in x', () => {
    expect(prop('.filter-row', 'flex-wrap', PHONE)).toBe('nowrap');
    expect(prop('.filter-row', 'overflow-x', PHONE)).toBe('auto');
  });

  it('wraps from 768px', () => {
    expect(prop('.filter-row', 'flex-wrap')).toBe('wrap');
  });

  it('has none of the old popup rules', () => {
    for (const gone of ['.filter-toggle', '.filter-popup', '.filter-badge', '.control-bar-mobile-search']) {
      expect(css, gone).not.toContain(gone);
    }
  });
});

describe('AC10: column tabs below 768px', () => {
  it('are hidden by default and a flex row on a phone', () => {
    expect(prop('.column-tabs', 'display')).toBe('none');
    expect(prop('.column-tabs', 'display', PHONE)).toBe('flex');
  });

  it('the selected tab is bold with a 3px primary underline', () => {
    expect(prop('.column-tab-on', 'font-weight')).toBe('700');
    expect(prop('.column-tab-on', 'box-shadow')).toBe('inset 0 -3px 0 var(--color-primary)');
    expect(prop('.column-tab-on', 'color')).toBe('var(--color-text)');
    expect(prop('.column-tab-on .column-tab-count', 'background')).toBe('var(--color-primary-light)');
    expect(prop('.column-tab-on .column-tab-count', 'color')).toBe('var(--color-primary)');
  });

  it('the dot pager is gone', () => {
    expect(css).not.toContain('column-indicator');
  });

  it("a column's own header gives way to the tab on a phone, but keeps its swimlane heading", () => {
    expect(prop('.column:not(.column-compact) .column-header-row', 'display', PHONE)).toBe('none');
    expect(prop('.column-sortrow', 'display')).toBe('none');
    expect(prop('.column-sortrow', 'display', PHONE)).toBe('flex');
  });
});

describe('AC11: dragging a card over a column, from 768px', () => {
  it('shows a dashed primary outline and a primary-light fill on the column body', () => {
    expect(prop('.column-drag-over .column-cards', 'outline', DESKTOP)).toBe('2px dashed var(--color-primary)');
    expect(prop('.column-drag-over .column-cards', 'background', DESKTOP)).toBe('var(--color-primary-light)');
    expect(prop('.column-drag-over .column-cards', 'outline')).toBeUndefined();
  });
});

describe('AC8: cards carry no description excerpt and no progress bar', () => {
  it('has no rules for them any more', () => {
    for (const gone of ['.card-description', '.subtask-bar', '.card-subtasks .subtask']) {
      expect(css, gone).not.toContain(gone);
    }
  });
});

// ── Contrast ────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark';
const TOKENS: Record<Theme, Record<string, string>> = {
  light: { ...tokens(readGlobalCss(), ':root'), ...tokens(readGlobalCss(), '[data-theme="light"]') },
  dark: { ...tokens(readGlobalCss(), ':root'), ...tokens(readGlobalCss(), '[data-theme="dark"]') },
};

function hex(theme: Theme, name: string): [number, number, number] {
  let v = TOKENS[theme][name];
  for (let i = 0; i < 5 && v?.startsWith('var('); i++) v = TOKENS[theme][v.slice(4, -1)];
  const m = v?.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`${name} is not a hex colour in ${theme}: ${v}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
}

const lum = ([r, g, b]: number[]) => {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `fg` at `alpha` over `bg`. */
const over = (fg: number[], bg: number[], alpha: number) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

interface Pair {
  name: string;
  /** The row's label in the design note's table. */
  row: string;
  min: number;
  measure: (t: Theme) => number;
}

const tok = (t: Theme, n: string) => hex(t, n);
const PAIRS: Pair[] = [
  {
    name: 'title on surface',
    row: 'title `--color-text` on `--color-surface`',
    min: 4.5,
    measure: (t) => ratio(tok(t, '--color-text'), tok(t, '--color-surface')),
  },
  {
    name: 'meta on surface',
    row: 'meta and labels `--color-text-secondary` on surface',
    min: 4.5,
    measure: (t) => ratio(tok(t, '--color-text-secondary'), tok(t, '--color-surface')),
  },
  {
    name: 'Unassigned on surface',
    row: '"Unassigned" `--color-text-muted` on surface',
    min: 4.5,
    measure: (t) => ratio(tok(t, '--color-text-muted'), tok(t, '--color-surface')),
  },
  {
    name: 'column heading on page',
    row: 'column heading `--color-text` on `--color-bg`',
    min: 4.5,
    measure: (t) => ratio(tok(t, '--color-text'), tok(t, '--color-bg')),
  },
  {
    name: 'count badge',
    row: 'count badge `--color-text-secondary` on `--color-border-light`',
    min: 4.5,
    measure: (t) => ratio(tok(t, '--color-text-secondary'), tok(t, '--color-border-light')),
  },
  {
    name: 'selected tab badge',
    row: 'selected tab badge `--color-primary` on `--color-primary-light`',
    min: 4.5,
    measure: (t) => ratio(tok(t, '--color-primary'), over(tok(t, '--color-primary'), tok(t, '--color-bg'), 0.08)),
  },
  {
    name: 'chip text on',
    row: 'chip on `--color-bg` on `--color-text`',
    min: 4.5,
    measure: (t) => ratio(tok(t, '--color-bg'), tok(t, '--color-text')),
  },
  {
    name: 'overdue pill',
    row: 'overdue pill `--color-danger-text` on surface',
    min: 4.5,
    measure: (t) => ratio(tok(t, '--color-danger-text'), tok(t, '--color-surface')),
  },
  {
    name: 'drop outline',
    row: 'drop outline `--color-primary` on `--color-bg` (3:1)',
    min: 3,
    measure: (t) => ratio(tok(t, '--color-primary'), tok(t, '--color-bg')),
  },
];

describe('AC13: both themes pass AA for every new text and surface pair', () => {
  for (const theme of ['light', 'dark'] as const) {
    it.each(PAIRS)(`${theme}: $name`, (pair) => {
      expect(pair.measure(theme)).toBeGreaterThanOrEqual(pair.min);
    });
  }

  it('the chip outline is 3:1 against the surface and the page, in both themes', () => {
    for (const t of ['light', 'dark'] as const) {
      expect(ratio(tok(t, '--color-border-strong'), tok(t, '--color-surface')), `${t} surface`).toBeGreaterThanOrEqual(
        3,
      );
      expect(ratio(tok(t, '--color-border-strong'), tok(t, '--color-bg')), `${t} page`).toBeGreaterThanOrEqual(3);
    }
  });

  it('white initials on every owner colour reach 4.5:1, after the first colour darkened', () => {
    expect(ownerColor(0)).toBe('#c43e00');
    for (let i = 0; i < 8; i++) {
      const m = ownerColor(i).match(/^#([0-9a-f]{6})$/i)!;
      const rgb = [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
      expect(ratio([255, 255, 255], rgb), ownerColor(i)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the design note records the measured ratios', () => {
    const note = readFileSync(resolve(here, '../../docs/design/626-board-screen.md'), 'utf-8');
    const table = note.slice(note.indexOf('## Contrast'));
    for (const p of PAIRS) {
      const line = table.split('\n').find((l: string) => l.startsWith(`| ${p.row} |`));
      expect(line, p.row).toBeDefined();
      const cells = line!.split('|').map((c: string) => c.trim());
      expect(cells[2], `${p.name} light`).toBe(p.measure('light').toFixed(2));
      expect(cells[3], `${p.name} dark`).toBe(p.measure('dark').toFixed(2));
    }
  });
});
