// #453 — every control's own box is at least --touch-target (44px) wide and tall,
// on every viewport and every pointer, per hive/docs/design/453-touch-targets.md.
//
// jsdom has no layout, so this reads the stylesheet: for each control class the TSX
// renders (test-controls.ts, the scan #452 built), the declared min-width/min-height
// (or width/height) that wins. The real boxes were measured with
// getBoundingClientRect() in demo mode at 375px and 1280px (see the issue's Results).
// The existing btn-touch-target.test.ts and filter-toggle-touch-target.test.ts keep
// their assertions and pass beside this.

import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node builtins available at test runtime
import { readFileSync } from 'fs';
// @ts-ignore
import { resolve } from 'path';
import { readGlobalCss, tokens } from './test-css';
import { controls, here, where, isNativeToggle } from './test-controls';

const css = readGlobalCss().replace(/\/\*[\s\S]*?\*\//g, '');
const FLOOR = 44;

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

/** A length in px, with --touch-target resolved; undefined for anything else. */
function px(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (/^var\(--touch-target\)$/.test(value)) return FLOOR;
  const m = value.match(/^(\d+(?:\.\d+)?)px$/);
  return m ? Number(m[1]) : undefined;
}

/** The last compound selector of a rule's selector, with state pseudos taken off. */
function subject(selector: string): string | null {
  if (selector.includes('::')) return null;
  const last = selector.split(/\s*[>+~]\s*|\s+(?![^(]*\))/).pop()!;
  return last.replace(/:(hover|active|focus-visible|focus|disabled|not\((?:[^()]|\([^()]*\))*\))/g, '');
}

/** The rules that size `cls` itself: its own compound is the subject. */
function rulesFor(cls: string): Rule[] {
  return rules.filter((r) => {
    const s = subject(r.selector);
    return s !== null && new RegExp(`\\.${cls}(?![\\w-])`).test(s);
  });
}

/**
 * The floor `cls` is held to: the largest of its declared min-* and fixed sizes
 * (min-height beats height, so a larger floor in any rule is the floor) among the
 * rules that apply at every width, and any rule in a media query that lowers it.
 */
function floorOf(cls: string, prop: 'height' | 'width'): number {
  let best = 0;
  for (const r of rulesFor(cls)) {
    for (const p of [`min-${prop}`, prop]) {
      const v = px(decl(r.body, p));
      if (v !== undefined) best = Math.max(best, v);
    }
  }
  return best;
}

/** A rule after the touch block that sets this class's min-* below the floor. */
function loweredAfter(cls: string, prop: 'height' | 'width', from: number): string[] {
  return rulesFor(cls)
    .filter((r) => r.order > from)
    .filter((r) => {
      const v = px(decl(r.body, `min-${prop}`));
      return v !== undefined && v < FLOOR;
    })
    .map((r) => r.selector);
}

// ── The classes: the note's audit tables ────────────────────────────────────

/** Boxes with a glyph or a drawn shape inside: 44 wide and 44 tall. */
const BOX = [
  'btn-sm',
  'btn-icon',
  'btn-icon-danger',
  'kebab-trigger',
  'subtask-action-btn',
  'date-clear-btn',
  'staged-subtask-remove',
  'subtask-kebab-btn',
  'due-clear-btn',
  'label-gear-btn',
  'archive-search-clear',
  'filter-search-clear',
  'column-add-btn',
  'share-remove-btn',
  'column-settings-delete-btn',
  'theme-toggle-btn',
  'column-sort-btn',
  'check-icon',
  'color-swatch',
  'icon-swatch',
  'column-settings-swatch',
  'column-color-swatch',
  'fab',
  'overflow-menu-btn',
  'label-new-pill',
  'column-settings-name',
  'column-settings-terminal-toggle',
  'today-round-btn',
  'today-check',
];
/** Rows and text controls: 44 tall, as wide as their content. */
const TALL = [
  'btn',
  'btn-ghost',
  'share-archive-board-btn',
  'column-archive-link',
  'toast-action',
  'column-settings-add-btn',
  'subtask-date-add-inline',
  'subtask-date-inline',
  'filter-chip',
  'label-toggle',
  'quick-date-chip',
  'status-segment',
  'card-title',
  'archive-item',
  'kebab-item',
  'overflow-menu-item',
  'subtask-menu-item',
  'subtask-title',
  'editable-value',
  'detail-row-btn',
  'detail-delete-btn',
  'completed-date-btn',
  'column-add-row',
  'bottom-nav-tab',
  'rail-item',
  'settings-row',
  'settings-tab',
  'login-btn',
  'login-link',
  'today-action-btn',
  'today-day',
  'board-choice-chip',
  'today-row-title',
  'boards-card',
  'boards-new-card',
  'boards-archived-row',
  'boards-back',
  'column-tab',
];

/** Text inputs, selects and date inputs. */
const FIELDS = [
  'filter-search-input',
  'subtask-add-input',
  'subtask-add-date',
  'subtask-title-input',
  'label-form-input',
  'archive-search-input',
  'profile-email-input',
  'column-settings-name-inline',
  'column-settings-name-input',
  'column-settings-delete-select',
];

/** Fields with no class of their own, styled by the wrapper they sit in. */
const FIELD_RULES = [
  '.form-field input',
  '.form-field select',
  '.form-field textarea',
  '.detail-field input',
  '.detail-field textarea',
  '.delete-board-target select',
  '.subtask-date-popover input[type="date"]',
];

/** Not a target: out of the tab order and hidden from assistive tech (#281), opened by its button. */
const NOT_A_TARGET = ['due-date-hidden'];

const SIZED = new Set([...BOX, ...TALL, ...FIELDS, ...NOT_A_TARGET]);

describe('AC1: every control class is held to the floor, and no control is in no table', () => {
  it('found the controls', () => {
    expect(controls.length).toBeGreaterThan(100);
  });

  it('every control the TSX renders has a class in the audit tables, or is a wrapped field or a native toggle', () => {
    const orphans = controls
      .filter((c) => !isNativeToggle(c))
      .filter((c) => !(c.inFormField && c.classes.length === 0))
      .filter((c) => !c.classes.some((cls) => SIZED.has(cls)))
      .map(where);
    if (orphans.length) throw new Error('\n' + orphans.join('\n'));
  });

  it.each(BOX)('.%s is at least 44 wide and 44 tall', (cls) => {
    expect(floorOf(cls, 'height'), `${cls} height`).toBeGreaterThanOrEqual(FLOOR);
    expect(floorOf(cls, 'width'), `${cls} width`).toBeGreaterThanOrEqual(FLOOR);
  });

  it.each([...TALL, ...FIELDS])('.%s is at least 44 tall', (cls) => {
    expect(floorOf(cls, 'height'), `${cls} height`).toBeGreaterThanOrEqual(FLOOR);
  });

  it.each(FIELD_RULES)('%s is at least 44 tall', (selector) => {
    const r = rules.find((x) => x.selector === selector && px(decl(x.body, 'min-height')) !== undefined);
    expect(r, selector).toBeDefined();
    expect(px(decl(r!.body, 'min-height'))).toBeGreaterThanOrEqual(FLOOR);
  });

  it('no media query lowers any of them after the touch-target block sets the floor', () => {
    const block = rules.find((r) => r.selector === '.btn-sm' && px(decl(r.body, 'min-height')) === FLOOR);
    expect(block, 'the touch-target block').toBeDefined();
    const lowered: string[] = [];
    for (const cls of [...BOX, ...TALL, ...FIELDS]) {
      lowered.push(...loweredAfter(cls, 'height', block!.order).map((s) => `${s} (height)`));
    }
    for (const cls of BOX) lowered.push(...loweredAfter(cls, 'width', block!.order).map((s) => `${s} (width)`));
    expect(lowered).toEqual([]);
  });

  it('the floor is one token, 44px', () => {
    expect(tokens(css, ':root')['--touch-target']).toBe('44px');
  });
});

describe('The shapes keep their size; the box grows around them', () => {
  it.each([
    ['color-swatch', '4px'],
    ['icon-swatch', '2px'],
    ['column-settings-swatch', '11px'],
    ['column-color-swatch', '8px'],
  ])('.%s draws its shape inside the 44px box', (cls, padding) => {
    const r = rules.filter((x) => x.selector === `.${cls}` && decl(x.body, 'padding') === padding).pop();
    expect(r, `${cls} padding`).toBeDefined();
    const clip = rules.find((x) => x.selector === `.${cls}` && decl(x.body, 'background-clip'));
    expect(decl(clip!.body, 'background-clip')).toBe('content-box !important');
  });

  it('the sub-task date buttons are a 44px box around the 24px pill, and the pseudo-element hack is gone', () => {
    const pill = rules.find((r) => r.selector === '.subtask-date-pill')!;
    expect(decl(pill.body, 'min-height')).toBe('24px');
    const content = rules.filter((r) => r.selector === '.subtask-date-inline::after' && decl(r.body, 'content')).pop()!;
    expect(decl(content.body, 'content')).toBe('none');
    expect(floorOf('subtask-date-inline', 'height')).toBeGreaterThanOrEqual(FLOOR);
    expect(floorOf('subtask-date-add-inline', 'height')).toBeGreaterThanOrEqual(FLOOR);
  });

  it('both date buttons render their content in the pill, so a row is the same height with or without a date', () => {
    const tsx = readFileSync(resolve(here, 'components/board/card-detail.tsx'), 'utf-8');
    expect(tsx.match(/class="subtask-date-pill"/g)?.length).toBe(2);
  });

  it('native checkboxes and radios are drawn inside a 44px input', () => {
    for (const sel of [
      '.share-toggle-label input[type="checkbox"]',
      '.delete-board-option input[type="radio"]',
      '.move-board-option input[type="radio"]',
    ]) {
      const r = rules.filter((x) => x.selector === sel && decl(x.body, 'width') === 'var(--touch-target)').pop();
      expect(r, sel).toBeDefined();
      expect(decl(r!.body, 'height')).toBe('var(--touch-target)');
      expect(decl(r!.body, 'appearance')).toBe('none');
    }
  });
});

describe('The card: the kebab is a 44px target under the owner, and the title is one too', () => {
  it('the kebab is 44 x 44, in the flow beside the title rather than over it', () => {
    expect(floorOf('kebab-trigger', 'width')).toBeGreaterThanOrEqual(FLOOR);
    expect(floorOf('kebab-trigger', 'height')).toBeGreaterThanOrEqual(FLOOR);
    const c = rules.filter((r) => r.selector === '.card-side .kebab-menu-container').pop();
    expect(c).toBeDefined();
    expect(decl(c!.body, 'position')).toBe('relative');
  });

  it('the title is a 44px box across the card, with its margins pulled into the padding', () => {
    const t = rules.filter((r) => r.selector === '.card-title' && decl(r.body, 'min-height')).pop()!;
    expect(decl(t.body, 'width')).toBe('100%');
    expect(px(decl(t.body, 'min-height'))).toBeGreaterThanOrEqual(FLOOR);
    expect(decl(t.body, 'margin')).toContain('-1');
  });
});

describe('The chips: 36px drawn inside a 44px box (#626)', () => {
  it('a chip is a 44px box whose 4px transparent border is the hit area', () => {
    expect(floorOf('filter-chip', 'height')).toBeGreaterThanOrEqual(FLOOR);
    const chip = rules.filter((r) => r.selector === '.filter-chip' && decl(r.body, 'border')).pop()!;
    expect(decl(chip.body, 'border')).toBe('4px solid transparent');
    expect(decl(chip.body, 'background-clip')).toBe('padding-box');
  });

  it('a tab is 48 tall, over the floor', () => {
    expect(floorOf('column-tab', 'height')).toBeGreaterThanOrEqual(48);
  });
});

describe('Fields keep 16px on phones', () => {
  it('the phone rules still set 16px on the inputs they did before', () => {
    const phone = rules.filter((r) => r.media.some((m) => /max-width/.test(m)) && decl(r.body, 'font-size') === '16px');
    expect(phone.length).toBeGreaterThan(0);
  });
});

describe('What hive#281 and #290 fixed still holds', () => {
  const tsx = readFileSync(resolve(here, 'components/board/card-detail.tsx'), 'utf-8');

  it('the detail Due chips and the Pick a date input are at least 44 tall, and the Due row is named', () => {
    expect(floorOf('filter-chip', 'height')).toBeGreaterThanOrEqual(FLOOR);
    expect(floorOf('detail-delete-btn', 'height')).toBeGreaterThanOrEqual(FLOOR);
    expect(tsx).toMatch(/aria-labelledby="detail-due-label"/);
  });

  it('the hidden date inputs are out of the tab order and hidden from assistive tech', () => {
    const hidden = tsx.match(/<input[^>]*class="due-date-hidden"[\s\S]*?\/>/g) ?? [];
    expect(hidden.length).toBeGreaterThanOrEqual(2);
    for (const h of hidden) {
      expect(h).toContain('tabIndex={-1}');
      expect(h).toContain('aria-hidden="true"');
    }
  });

  it('the three theme buttons are at least 44 x 44 at every width', () => {
    expect(floorOf('theme-toggle-btn', 'width')).toBeGreaterThanOrEqual(FLOOR);
    expect(floorOf('theme-toggle-btn', 'height')).toBeGreaterThanOrEqual(FLOOR);
  });

  it('.btn-primary and .btn-danger take the .btn floor of 48', () => {
    expect(floorOf('btn', 'height')).toBeGreaterThanOrEqual(48);
  });
});
