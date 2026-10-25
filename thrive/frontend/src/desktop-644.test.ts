// #644 — with a mouse the sideways rows wrap, and the tab bar and FAB follow the content column.
import { describe, it, expect } from 'vitest';
import { readGlobalCss } from './test-css';

const raw = readGlobalCss().replace(/\r\n/g, '\n');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

const POINTER = '@media (hover: hover) and (pointer: fine)';

function rules(source: string, selector: string): string[] {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`, 'g');
  return [...source.matchAll(re)].map((m) => m[1]);
}

/** Base rules: outside every @media block. */
function base(selector: string): string {
  const r = rules(outsideMedia(), selector);
  if (r.length === 0) throw new Error(`no rule for ${selector}`);
  return r.join('\n');
}

/** The bodies of every pointer-query block, joined. */
function pointerBlocks(): string {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(POINTER, from);
    if (at === -1) break;
    const open = css.indexOf('{', at);
    let depth = 0;
    let i = open;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) break;
    }
    out.push(css.slice(open + 1, i));
    from = i;
  }
  return out.join('\n');
}

function outsideMedia(): string {
  let out = '';
  let depth = 0;
  let inMedia = false;
  for (let i = 0; i < css.length; i++) {
    if (!inMedia && depth === 0 && css.startsWith('@media', i)) inMedia = true;
    const c = css[i];
    if (c === '{') depth++;
    if (!inMedia) out += c;
    if (c === '}' && --depth === 0) inMedia = false;
  }
  return out;
}

function pointer(selector: string): string {
  const r = rules(pointerBlocks(), selector);
  if (r.length === 0) throw new Error(`no pointer-query rule for ${selector}`);
  return r.join('\n');
}

describe('the content column is one token (#644)', () => {
  it('defines --content-max as 600px in Thrive’s own :root', () => {
    expect(base(':root')).toMatch(/--content-max:\s*600px/);
  });

  it.each(['.screen', '.template-editor', '.simple-workout-form', '.workout-detail-screen'])(
    'caps %s at the token, with no literal 600px left',
    (selector) => {
      expect(base(selector)).toMatch(/max-width:\s*var\(--content-max\)/);
    },
  );

  it('leaves no literal 600px max-width anywhere', () => {
    expect(css).not.toMatch(/max-width:\s*600px/);
  });
});

describe('fixed controls follow the column (#644)', () => {
  it('keeps the tab bar full width and pads its tabs into a centred column band', () => {
    const r = base('.bottom-nav');
    expect(r).toMatch(/left:\s*0/);
    expect(r).toMatch(/right:\s*0/);
    expect(r).toMatch(/justify-content:\s*space-around/);
    for (const side of ['left', 'right']) {
      expect(r).toMatch(new RegExp(`padding-${side}:\\s*max\\(0px,\\s*\\(100% - var\\(--content-max\\)\\) / 2\\)`));
    }
  });

  it('puts the FAB 16px inside the column’s right edge, never under 16px', () => {
    const r = base('.fab');
    expect(r).toMatch(/right:\s*max\(16px,\s*\(100% - var\(--content-max\)\) \/ 2 \+ 16px\)/);
    expect(r).toMatch(/bottom:\s*calc\(var\(--nav-height\) \+ 16px\)/);
  });

  it('centres against the fixed box, never the viewport units that count the scrollbar', () => {
    expect(base('.bottom-nav')).not.toMatch(/vw/);
    expect(base('.fab')).not.toMatch(/vw/);
  });
});

describe('with a mouse the sideways rows wrap (#644)', () => {
  it('keeps the phone rows scrolling sideways outside the pointer query', () => {
    expect(base('.activities-chips')).toMatch(/overflow-x:\s*auto/);
    expect(base('.activities-chips')).not.toMatch(/flex-wrap/);
    expect(base('.up-next-row')).toMatch(/display:\s*flex/);
    expect(base('.up-next-row')).toMatch(/overflow-x:\s*auto/);
  });

  it('wraps the type chips and stops them scrolling', () => {
    const r = pointer('.activities-chips');
    expect(r).toMatch(/flex-wrap:\s*wrap/);
    expect(r).toMatch(/overflow-x:\s*visible/);
  });

  it('lays Up next out as an auto-fill grid of 150px-minimum cards', () => {
    const r = pointer('.up-next-row');
    expect(r).toMatch(/display:\s*grid/);
    expect(r).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(150px,\s*1fr\)\)/);
    expect(r).toMatch(/overflow-x:\s*visible/);
    expect(r).toMatch(/scroll-snap-type:\s*none/);
    expect(r).toMatch(/margin:\s*0/);
    expect(pointer('.workout-card.up-next-card')).toMatch(/width:\s*auto/);
  });

  it('tightens the Trends group tabs and lets the row wrap', () => {
    expect(pointer('.trends-group-btn')).toMatch(/padding:\s*var\(--space-sm\)/);
    const row = pointer('.trends-group-row');
    expect(row).toMatch(/flex-wrap:\s*wrap/);
    expect(row).toMatch(/width:\s*auto/);
  });
});
