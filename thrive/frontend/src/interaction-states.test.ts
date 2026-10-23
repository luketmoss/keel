// #404 — every control answers the six interaction states (rest, hover,
// pressed, focus, selected, disabled) by its family, per
// thrive/docs/design/404-interaction-states.md.
//
// Two sources are read. The TSX, parsed with the TypeScript compiler, says which
// controls exist: every <button>, <a href>, [role="button"] and form field, with
// its classes and whether it can be disabled. global.css, through readGlobalCss(),
// says what they look like; a small cascade below resolves which declaration wins
// for a given element and state, so the assertions are about the outcome, not
// about one rule's text. jsdom's Element.matches() does the selector matching;
// states are stood in for by data attributes, since jsdom cannot hover or press.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readGlobalCss } from './test-css';

const here = dirname(fileURLToPath(import.meta.url));

// ── The families ────────────────────────────────────────────────────────────

/** The design note's Families table, as class names. */
const FAMILIES = {
  'Filled buttons': ['btn-primary', 'btn-danger', 'fab', 'login-btn'],
  'Quiet buttons': [
    'btn-secondary',
    'btn-ghost',
    'template-editor-back',
    'login-link',
    'filter-clear',
    'manage-labels-link',
    'day-today-btn',
    'training-plan-link',
    'detail-coros-link',
  ],
  'Icon buttons': [
    'btn-icon',
    'modal-close',
    'day-arrow',
    'set-remove-btn',
    'compact-card-remove',
    'last-time-close-btn',
    'copy-down-btn',
    'reorder-btn',
    'exercise-toolbar-btn',
    'manage-label-delete',
    'day-sync-btn',
    'sync-now-btn',
    'detail-icon-btn',
  ],
  'Chips and toggles': [
    'filter-chip',
    'label-chip',
    'tag-badge',
    'effort-btn',
    'sub-type-btn',
    'theme-toggle-btn',
    'trends-group-btn',
    'trends-chip',
    'trends-view-btn',
    'trends-menu-item',
    'detail-menu-item',
    'library-switch-btn',
    'color-swatch',
    'section-badge-btn',
    'section-picker-pill',
    'week-day',
  ],
  'Rows and cards': [
    'exercise-list-item',
    'create-new-row',
    'template-card',
    'workout-card',
    'compact-card-body',
    'type-card',
    'trend-row-link',
    'trend-open-day',
    'calendar-open-day',
    'calendar-day',
    'manage-label-name',
    'add-set-btn',
    'sync-status-bar',
    'settings-btn',
    'exercise-list-item-header',
    'settings-row-link',
    'day-card-link',
    'lift-check',
    'lift-set-btn',
    'lift-choice-card',
  ],
  Navigation: ['bottom-nav-tab'],
  Fields: ['form-input', 'form-select', 'form-textarea'],
} as const satisfies Record<string, readonly string[]>;
type Family = keyof typeof FAMILIES;

const ALL_FAMILY_CLASSES: string[] = Object.values(FAMILIES).flat();
const familyOf = (cls: string) =>
  (Object.keys(FAMILIES) as Family[]).find((f) => (FAMILIES[f] as readonly string[]).includes(cls));
const NON_FIELD = ALL_FAMILY_CLASSES.filter((c) => familyOf(c) !== 'Fields');
const OVERLAY_HOVER = NON_FIELD.filter((c) => familyOf(c) !== 'Filled buttons');

/** Rendered as a control somewhere the scan below cannot see a literal tag. */
const RENDERED_ELSEWHERE: Record<string, string> = {
  'tag-badge': 'label-badge.tsx renders <Tag>, a <button> when the badge has onClick',
};

/** In a family but not rendered today, with why it stays. */
const NOT_RENDERED: Record<string, string> = {
  'form-select': 'no <select> today; global.css styles one, so the next takes the field states',
};

/** A non-control element that carries a family class, by the tag a control of it uses. */
const CONTROL_TAG: Record<string, string> = {
  'tag-badge': 'button',
  'exercise-list-item': 'button',
  'workout-card': 'button',
};

// ── The TSX: every control the app renders ──────────────────────────────────

interface Control {
  file: string;
  line: number;
  tag: string;
  role?: string;
  type?: string;
  classes: string[];
  disabled: boolean;
  ariaDisabled: boolean;
  aria: string[];
  /** For an aria-disabled control: whether every child is an element. */
  childrenAreElements: boolean;
}

/**
 * A class expression the scan cannot resolve to strings in its own file, with
 * the classes it renders and the file that proves it. Keyed `file|expression`.
 */
const DYNAMIC: Record<string, { classes: string[]; source: string }> = {
  'components/day/training-panel.tsx|className': {
    classes: ['workout-card'],
    source: 'components/day/training-panel.tsx',
  },
  'components/shared/section-picker.tsx|sectionPillClass(s, s === value)': {
    classes: ['section-picker-pill'],
    source: 'components/shared/section-utils.ts',
  },
  'components/workout/exercise-row.tsx|sectionPillClass(s, s === exercise.section)': {
    classes: ['section-picker-pill'],
    source: 'components/shared/section-utils.ts',
  },
};

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') && !/\.test\.tsx$|test-utils\.tsx$/.test(p) ? [p] : [];
  });
}

function strings(node: ts.Node, acc: string[] = []): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) acc.push(node.text);
  else if (ts.isTemplateExpression(node)) {
    acc.push(node.head.text);
    for (const span of node.templateSpans) {
      strings(span.expression, acc);
      acc.push(span.literal.text);
    }
  } else
    ts.forEachChild(node, (c) => {
      strings(c, acc);
    });
  return acc;
}

const usedDynamic = new Set<string>();
const unresolved: string[] = [];

function scan(): Control[] {
  const out: Control[] = [];
  for (const path of tsxFiles(here)) {
    const file = relative(here, path).replace(/\\/g, '/');
    const sf = ts.createSourceFile(path, readFileSync(path, 'utf-8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const locals = new Map<string, ts.Expression>();
    const collect = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer)
        locals.set(n.name.text, n.initializer);
      ts.forEachChild(n, collect);
    };
    collect(sf);

    const classesOf = (init: ts.JsxAttributeValue | undefined): string[] => {
      if (!init) return [];
      const expr = ts.isJsxExpression(init) ? init.expression : init;
      if (!expr) return [];
      let found = strings(expr);
      if (found.join('').trim() === '' && ts.isIdentifier(expr) && locals.has(expr.text)) {
        found = strings(locals.get(expr.text)!);
      }
      const tokens = found
        .join(' ')
        .split(/\s+/)
        .filter((t) => /^[a-z][\w-]*[a-z0-9]$/.test(t));
      if (tokens.length === 0) {
        const key = `${file}|${expr.getText(sf)}`;
        if (DYNAMIC[key]) {
          usedDynamic.add(key);
          return DYNAMIC[key].classes;
        }
        unresolved.push(`${key} (line ${sf.getLineAndCharacterOfPosition(expr.getStart()).line + 1})`);
      }
      return tokens;
    };

    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = n.tagName.getText(sf);
        const attrs = new Map<string, ts.JsxAttributeValue | undefined>();
        for (const a of n.attributes.properties) if (ts.isJsxAttribute(a)) attrs.set(a.name.getText(sf), a.initializer);
        const lit = (name: string) => {
          const v = attrs.get(name);
          return v && ts.isStringLiteral(v) ? v.text : undefined;
        };
        // A role given only when the element is interactive (`onClick ? 'button' : undefined`) counts.
        const roleInit = attrs.get('role');
        const role = lit('role') ?? (roleInit && strings(roleInit).includes('button') ? 'button' : undefined);
        const isControl =
          tag === 'button' ||
          (tag === 'a' && attrs.has('href')) ||
          role === 'button' ||
          tag === 'input' ||
          tag === 'select' ||
          tag === 'textarea';
        if (isControl) {
          let childrenAreElements = true;
          if (ts.isJsxOpeningElement(n)) {
            for (const child of (n.parent as ts.JsxElement).children) {
              if (ts.isJsxText(child) && child.text.trim() !== '') childrenAreElements = false;
              if (ts.isJsxExpression(child) && child.expression) childrenAreElements = false;
            }
          }
          out.push({
            file,
            line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            tag,
            role,
            type: lit('type'),
            classes: classesOf(attrs.get('class') ?? attrs.get('className')),
            disabled: attrs.has('disabled'),
            ariaDisabled: attrs.has('aria-disabled'),
            aria: [...attrs.keys()].filter((k) => k.startsWith('aria-')),
            childrenAreElements,
          });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const controls = scan();
const where = (c: Control) => `${c.file}:${c.line} <${c.tag} class="${c.classes.join(' ')}">`;
const isNativeToggle = (c: Control) => c.tag === 'input' && (c.type === 'checkbox' || c.type === 'radio');

// ── The stylesheet, and a small cascade over it ─────────────────────────────

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
      if (prelude.startsWith('@')) {
        stack.push(prelude);
      } else {
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
    } else if (ch === ';' && buf.trim().startsWith('@')) {
      // A statement at-rule such as @import ends here.
      buf = '';
    } else {
      buf += ch;
    }
  }
  return rules;
}

const rules = parse(css);
const HOVER_MEDIA = '@media (hover: hover)';

function declarations(body: string): Map<string, { value: string; important: boolean }> {
  const out = new Map<string, { value: string; important: boolean }>();
  let depth = 0;
  let cur = '';
  const parts: string[] = [];
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  for (const part of parts) {
    const m = part.match(/^\s*([\w-]+)\s*:\s*([\s\S]+?)\s*$/);
    if (!m) continue;
    const important = /!important$/.test(m[2]);
    const value = m[2].replace(/\s*!important$/, '').replace(/\s+/g, ' ');
    const prop = m[1];
    if (prop === 'background') {
      const image = /gradient\(|url\(/.test(value) ? value : 'none';
      out.set('background-image', { value: image, important });
      out.set('background-color', { value: image === 'none' ? value : 'transparent', important });
    } else out.set(prop, { value, important });
  }
  return out;
}

function specificity(selector: string): [number, number, number] {
  let s = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
  s = s.replace(/:(?:not|is)\(((?:[^()]|\([^()]*\))*)\)/g, ' $1');
  let b = (s.match(/\[[^\]]*\]/g) ?? []).length;
  s = s.replace(/\[[^\]]*\]/g, '');
  const a = (s.match(/#[\w-]+/g) ?? []).length;
  b += (s.match(/\.[\w-]+/g) ?? []).length + (s.match(/(?<!:):[\w-]+/g) ?? []).length;
  const c = (s.match(/(?:^|[\s>+~(])[a-z][\w-]*/gi) ?? []).length + (s.match(/::[\w-]+/g) ?? []).length;
  return [a, b, c];
}

const STATE_ATTR: Record<string, string> = {
  ':hover': '[data-s-hover]',
  ':active': '[data-s-active]',
  ':focus-visible': '[data-s-focus]',
  ':focus': '[data-s-focus]',
};

function forMatching(selector: string): string | null {
  if (selector.includes('::') || selector === ':root' || selector.startsWith('[data-theme')) return null;
  return selector.replace(/:focus-visible|:focus(?![\w-])|:hover|:active/g, (p) => STATE_ATTR[p]);
}

interface State {
  hover?: boolean;
  active?: boolean;
  focus?: boolean;
  /** A device that hovers: rules in @media (hover: hover) apply. */
  hoverDevice?: boolean;
}

/** Whether cascade rank `a` (importance, specificity, source order) beats `b`. */
function later(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** The winning declaration of each property for `el`. */
function cascade(el: Element, state: State = {}): Map<string, { value: string; selector: string }> {
  const set = (name: string, on?: boolean) => (on ? el.setAttribute(name, '') : el.removeAttribute(name));
  set('data-s-hover', state.hover);
  set('data-s-active', state.active);
  set('data-s-focus', state.focus);
  const allowed = (media: string[]) => media.every((m) => m === HOVER_MEDIA && state.hoverDevice !== false);
  const won = new Map<string, { value: string; selector: string; rank: number[] }>();
  for (const r of rules) {
    if (!allowed(r.media)) continue;
    const sel = forMatching(r.selector);
    if (!sel) continue;
    let hit = false;
    try {
      hit = el.matches(sel);
    } catch {
      continue;
    }
    if (!hit) continue;
    const [a, b, c] = specificity(r.selector);
    for (const [prop, d] of declarations(r.body)) {
      const rank = [d.important ? 1 : 0, a, b, c, r.order];
      const prev = won.get(prop);
      if (!prev || later(rank, prev.rank)) won.set(prop, { value: d.value, selector: r.selector, rank });
    }
  }
  for (const s of ['data-s-hover', 'data-s-active', 'data-s-focus']) el.removeAttribute(s);
  return new Map([...won].map(([k, v]) => [k, { value: v.value, selector: v.selector }]));
}

const value = (el: Element, prop: string, state?: State) => cascade(el, state).get(prop)?.value;

// Tokens, for resolving var().
function block(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules.filter((x) => x.selector === selector && x.media.length === 0)) {
    for (const m of r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  }
  return out;
}
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];
const TOKENS: Record<Theme, Record<string, string>> = {
  light: { ...block(':root'), ...block('[data-theme="light"]') },
  dark: { ...block(':root'), ...block('[data-theme="dark"]') },
};
function resolveVar(v: string, theme: Theme = 'light', depth = 0): string {
  if (depth > 10) throw new Error(`var() loop in ${v}`);
  const out = v.replace(/var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/g, (_, name: string, fallback?: string) => {
    const t = TOKENS[theme][name] ?? fallback;
    if (t === undefined) throw new Error(`${name} is not defined in ${theme}`);
    return t;
  });
  return out.includes('var(') ? resolveVar(out, theme, depth + 1) : out;
}

/** A detached element built like the control, inside a plain container. */
function build(tag: string, classes: string[], attrs: Record<string, string> = {}): HTMLElement {
  const parent = document.createElement('div');
  const el = document.createElement(tag);
  if (classes.length) el.setAttribute('class', classes.join(' '));
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.appendChild(el);
  return el;
}
function buildControl(c: Control, extra: Record<string, string> = {}): HTMLElement {
  const attrs: Record<string, string> = { ...extra };
  if (c.role) attrs.role = c.role;
  if (c.type) attrs.type = c.type;
  if (c.tag === 'a') attrs.href = '#';
  const el = build(c.tag, c.classes, attrs);
  if (c.tag !== 'input' && c.tag !== 'select' && c.tag !== 'textarea') el.appendChild(document.createElement('span'));
  return el;
}
/** One element per family class, built like the first control the TSX renders with it. */
function representative(cls: string): HTMLElement {
  const c = controls.find((x) => x.classes.includes(cls));
  if (c) return buildControl(c);
  return build(CONTROL_TAG[cls] ?? 'button', [cls], cls === 'compact-card-body' ? { role: 'button' } : {});
}

// ── AC1: families ───────────────────────────────────────────────────────────

describe('AC1: every control class is in exactly one family', () => {
  it("the families match the design note's Families table", () => {
    const note = readFileSync(resolve(here, '../../docs/design/404-interaction-states.md'), 'utf-8');
    const table = note.slice(note.indexOf('## Families'), note.indexOf('## Edge cases'));
    const fromNote: Record<string, string[]> = {};
    for (const m of table.matchAll(/^\| (?!Family|---)([^|]+?) \| ([^|]+) \|/gm)) {
      fromNote[m[1].trim()] = [...m[2].matchAll(/`\.([\w-]+)/g)].map((x) => x[1]);
    }
    expect(fromNote).toEqual(FAMILIES);
  });

  it('no class is in two families', () => {
    const dupes = ALL_FAMILY_CLASSES.filter((c, i) => ALL_FAMILY_CLASSES.indexOf(c) !== i);
    expect(dupes).toEqual([]);
  });

  it('found the controls, and every dynamic class expression is accounted for', () => {
    expect(controls.length).toBeGreaterThan(100);
    expect(unresolved).toEqual([]);
    expect([...usedDynamic].sort()).toEqual(Object.keys(DYNAMIC).sort());
    for (const { classes, source } of Object.values(DYNAMIC)) {
      const text = readFileSync(resolve(here, source), 'utf-8');
      for (const cls of classes) expect(text, `${source} renders ${cls}`).toContain(cls);
    }
  });

  it('every <button>, <a href> and [role="button"] the TSX renders carries a family class', () => {
    const orphans = controls
      .filter((c) => !['input', 'select', 'textarea'].includes(c.tag))
      .filter((c) => !c.classes.some((cls) => ALL_FAMILY_CLASSES.includes(cls)))
      .map(where);
    expect(orphans).toEqual([]);
  });

  it('every form field carries a field class; only a native checkbox or radio has none', () => {
    const fields = controls.filter((c) => ['input', 'select', 'textarea'].includes(c.tag));
    const orphans = fields
      .filter((c) => !isNativeToggle(c))
      .filter((c) => !c.classes.some((cls) => familyOf(cls) === 'Fields'))
      .map(where);
    expect(orphans).toEqual([]);
    for (const c of fields.filter(isNativeToggle)) expect(c.classes, where(c)).toEqual([]);
  });

  it('every family class is still rendered by some control', () => {
    const rendered = new Set(controls.flatMap((c) => c.classes));
    const stale = ALL_FAMILY_CLASSES.filter(
      (c) => !rendered.has(c) && !(c in RENDERED_ELSEWHERE) && !(c in NOT_RENDERED),
    );
    expect(stale).toEqual([]);
  });
});

// ── AC2–AC4: disabled ───────────────────────────────────────────────────────

describe('AC2: a disabled .btn is dimmed, default-cursor and unmoved by hover', () => {
  it.each(['btn-primary', 'btn-danger', 'btn-secondary', 'btn-ghost'])('.btn.%s:disabled', (variant) => {
    const el = build('button', ['btn', variant], { disabled: '' });
    expect(value(el, 'opacity')).toBe('var(--opacity-disabled)');
    expect(resolveVar('var(--opacity-disabled)')).toBe('0.4');
    expect(value(el, 'cursor')).toBe('default');
    for (const prop of ['background-color', 'background-image']) {
      for (const hover of [{ hover: true }, { active: true }, { hover: true, active: true }]) {
        expect(value(el, prop, { ...hover, hoverDevice: true }), `${prop} ${JSON.stringify(hover)}`).toBe(
          value(el, prop),
        );
      }
    }
  });

  it('an enabled one does respond, so the check above is not vacuous', () => {
    const el = build('button', ['btn', 'btn-primary']);
    expect(value(el, 'background-color', { hover: true, hoverDevice: true })).toBe('var(--color-primary-fill-hover)');
    expect(value(el, 'background-image', { active: true })).toContain('var(--state-pressed)');
  });

  it('every control the TSX renders `disabled` dims the same way', () => {
    for (const c of controls.filter((x) => x.disabled)) {
      const el = buildControl(c, { disabled: '' });
      expect(value(el, 'opacity'), where(c)).toBe('var(--opacity-disabled)');
      expect(value(el, 'cursor'), where(c)).toBe('default');
    }
  });
});

describe('AC3: one disabled opacity, the token', () => {
  const disabledRules = rules.filter((r) =>
    /:disabled|\[aria-disabled="true"\]/.test(r.selector.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '')),
  );

  it('every disabled rule that sets opacity uses --opacity-disabled', () => {
    const withOpacity = disabledRules.filter((r) => declarations(r.body).has('opacity'));
    expect(withOpacity.length).toBeGreaterThanOrEqual(3);
    for (const r of withOpacity)
      expect(declarations(r.body).get('opacity')!.value, r.selector).toBe('var(--opacity-disabled)');
  });

  it('no disabled rule sets cursor: not-allowed, and none says aria-disabled in single quotes', () => {
    for (const r of disabledRules)
      expect(declarations(r.body).get('cursor')?.value, r.selector).not.toBe('not-allowed');
    expect(css).not.toMatch(/\[aria-disabled='true'\]/);
  });

  it('--opacity-disabled is 0.4 and no raw value below 1 is left beside it in a disabled state', () => {
    expect(TOKENS.light['--opacity-disabled']).toBe('0.4');
    const raw = disabledRules
      .map((r) => declarations(r.body).get('opacity')?.value)
      .filter((v): v is string => v !== undefined && v !== 'var(--opacity-disabled)');
    expect(raw).toEqual([]);
  });
});

describe('AC4: an aria-disabled control dims, and its focus ring does not', () => {
  const ariaControls = controls.filter((c) => c.ariaDisabled);

  it('found the aria-disabled controls', () => {
    expect(ariaControls.map((c) => c.classes[0] ?? c.tag).sort()).toEqual(
      [
        'btn',
        'day-sync-btn',
        'detail-icon-btn',
        'exercise-toolbar-btn',
        'exercise-toolbar-btn',
        'input',
        'reorder-btn',
        'reorder-btn',
        'btn',
        // #576: the duration stepper's end buttons.
        'btn-icon',
      ].sort(),
    );
  });

  it('keeps its label in an element, so dimming the children dims all of it', () => {
    const bare = ariaControls.filter((c) => c.tag !== 'input' && !c.childrenAreElements).map(where);
    expect(bare).toEqual([]);
  });

  it.each(ariaControls.filter((c) => c.tag !== 'input').map((c) => [where(c), c] as const))('%s', (_, c) => {
    const el = buildControl(c, { 'aria-disabled': 'true' });
    const child = el.firstElementChild!;
    // The control itself is never faded: that would fade the ring.
    expect(value(el, 'opacity')).toBeUndefined();
    expect(value(el, 'opacity', { focus: true })).toBeUndefined();
    expect(value(child, 'opacity')).toBe('var(--opacity-disabled)');
    expect(value(el, 'cursor')).toBe('default');
    const ring = value(el, 'outline', { focus: true });
    expect(ring).toBeDefined();
    expect(Number.parseFloat(resolveVar(ring!.split(' ')[0]))).toBeGreaterThanOrEqual(2);
    // And it answers no hover or press.
    for (const prop of ['background-color', 'background-image', 'color', 'border-color']) {
      expect(value(el, prop, { hover: true, active: true, hoverDevice: true }), prop).toBe(value(el, prop));
    }
  });

  it('a filled aria-disabled button veils its fill toward the page by the same token', () => {
    const el = build('button', ['btn', 'btn-primary', 'sync-now-btn'], { 'aria-disabled': 'true' });
    expect(value(el, 'background-image')).toMatch(
      /^linear-gradient\( ?color-mix\(in srgb, var\(--color-bg\) calc\(100% - var\(--opacity-disabled\) \* 100%\), transparent\)/,
    );
  });

  it('a native checkbox, which has no children, dims itself except while its ring shows', () => {
    const c = ariaControls.find((x) => x.tag === 'input')!;
    expect(c.type).toBe('checkbox');
    const el = buildControl(c, { 'aria-disabled': 'true' });
    expect(value(el, 'opacity')).toBe('var(--opacity-disabled)');
    expect(value(el, 'opacity', { focus: true })).toBeUndefined();
    expect(value(el, 'outline', { focus: true })).toBe('var(--focus-ring-width) solid var(--color-text)');
  });
});

// ── AC5: focus ──────────────────────────────────────────────────────────────

describe('AC5: tabbing to any control shows a ring at least 2px wide', () => {
  it('the global ring is --color-text at the ring tokens, 2px at 2px', () => {
    const global = rules.filter((r) => r.selector === ':focus-visible');
    expect(global).toHaveLength(1);
    const d = declarations(global[0].body);
    expect(d.get('outline')?.value).toBe('var(--focus-ring-width) solid var(--color-text)');
    expect(d.get('outline-offset')?.value).toBe('var(--focus-ring-offset)');
    expect(TOKENS.light['--focus-ring-width']).toBe('2px');
    expect(TOKENS.light['--focus-ring-offset']).toBe('2px');
  });

  const nonField = controls.filter((c) => !c.classes.some((cls) => familyOf(cls) === 'Fields'));
  it.each(nonField.map((c) => [where(c), c] as const))('%s', (_, c) => {
    const el = buildControl(c);
    const won = cascade(el, { focus: true }).get('outline');
    expect(won, 'no outline when focused').toBeDefined();
    const m = won!.value.match(/^(\S+) solid var\((--[\w-]+)\)$/);
    expect(m, `outline "${won!.value}" from ${won!.selector}`).not.toBeNull();
    expect(Number.parseFloat(resolveVar(m![1]))).toBeGreaterThanOrEqual(2);
    // A control with no ring of its own takes the global one, in --color-text.
    if (won!.selector === ':focus-visible') expect(m![2]).toBe('--color-text');
    else expect(['--color-text', '--color-primary-text']).toContain(m![2]);
  });

  it('fields keep their #183 border and halo instead', () => {
    for (const cls of FAMILIES.Fields) {
      const el = build(cls === 'form-select' ? 'select' : cls === 'form-textarea' ? 'textarea' : 'input', [cls]);
      const won = cascade(el, { focus: true });
      expect(won.get('outline')?.value, cls).toBe('none');
      expect(won.get('border-color')?.value, cls).toBe('var(--color-primary-fill)');
      expect(won.get('box-shadow')?.value, cls).toBe('0 0 0 3px var(--color-primary-focus-ring)');
    }
  });
});

// ── AC7, AC8: hover and pressed ─────────────────────────────────────────────

const stateRules = rules.filter((r) => /:hover|:active/.test(r.selector));

describe('AC7: hover applies only on a device that hovers', () => {
  it('every :hover selector is inside @media (hover: hover)', () => {
    const outside = rules
      .filter((r) => r.selector.includes(':hover') && !r.media.includes(HOVER_MEDIA))
      .map((r) => r.selector);
    expect(outside).toEqual([]);
  });

  it.each(NON_FIELD)('on touch, hovering .%s changes nothing', (cls) => {
    const el = representative(cls);
    const rest = cascade(el, { hoverDevice: false });
    const hovered = cascade(el, { hover: true, hoverDevice: false });
    expect([...hovered].map(([k, v]) => [k, v.value])).toEqual([...rest].map(([k, v]) => [k, v.value]));
  });
});

describe('Hover, on a device that hovers', () => {
  it.each(OVERLAY_HOVER)('.%s lays --state-hover over its background', (cls) => {
    expect(value(representative(cls), 'background-image', { hover: true, hoverDevice: true })).toBe(
      'linear-gradient(var(--state-hover), var(--state-hover))',
    );
  });

  it.each(FAMILIES['Filled buttons'])('.%s keeps its -fill-hover token', (cls) => {
    expect(value(representative(cls), 'background-color', { hover: true, hoverDevice: true })).toMatch(
      /-fill-hover\)$/,
    );
  });
});

describe('AC8: every family but fields has a pressed state, and no state moves', () => {
  it.each(NON_FIELD)('.%s lays --state-pressed over its background when pressed', (cls) => {
    for (const hoverDevice of [true, false]) {
      expect(value(representative(cls), 'background-image', { active: true, hover: hoverDevice, hoverDevice })).toBe(
        'linear-gradient(var(--state-pressed), var(--state-pressed))',
      );
    }
  });

  it('fields have no pressed state', () => {
    for (const cls of FAMILIES.Fields) {
      const el = build('input', [cls]);
      expect(value(el, 'background-image', { active: true }), cls).toBe(value(el, 'background-image'));
      expect(value(el, 'background-image', { active: true }) ?? '', cls).not.toContain('--state-pressed');
    }
  });

  it('no hover or pressed rule sets transform', () => {
    expect(stateRules.filter((r) => declarations(r.body).has('transform')).map((r) => r.selector)).toEqual([]);
  });

  it('and no family class transitions transform, the scales are gone', () => {
    const moving = rules
      .filter((r) => /transform/.test(declarations(r.body).get('transition')?.value ?? ''))
      .filter((r) => NON_FIELD.some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(r.selector)))
      .map((r) => r.selector);
    expect(moving).toEqual([]);
  });

  it('the overlay rules set the background layer and nothing else', () => {
    const overlay = rules.filter((r) => /var\(--state-(?:hover|pressed)\)/.test(r.body));
    // One selector per class, and workout-card twice (a <button> and an <a>).
    expect(overlay.length).toBe(OVERLAY_HOVER.length + 1 + NON_FIELD.length + 1);
    for (const r of overlay) expect([...declarations(r.body).keys()], r.selector).toEqual(['background-image']);
  });

  it('every hover and pressed rule on a control that can be disabled excludes the disabled one', () => {
    const disablable = new Set(
      controls
        .filter((c) => c.disabled || c.ariaDisabled)
        .flatMap((c) => c.classes)
        .filter((c) => ALL_FAMILY_CLASSES.includes(c)),
    );
    for (const c of ['btn-primary', 'btn-danger', 'btn-secondary', 'btn-ghost']) disablable.add(c);
    const unguarded = stateRules
      .filter((r) => {
        const subject = r.selector.split(/[\s>+~]+/).pop()!;
        return [...disablable].some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(subject));
      })
      .filter((r) => !(r.selector.includes(':not(:disabled)') && r.selector.includes(':not([aria-disabled="true"])')))
      .map((r) => r.selector);
    expect(unguarded).toEqual([]);
  });
});

// ── AC9: text on fills, with the overlays applied ───────────────────────────

function rgba(colour: string): [number, number, number, number] {
  const hex = colour.match(/^#([0-9a-f]{6})$/i);
  if (hex)
    return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as [number, number, number, number];
  const m = colour.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/);
  if (!m) throw new Error(`not a colour: ${colour}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}
function over(top: string, bottom: string): string {
  const [r, g, b, a] = rgba(top);
  const [R, G, B] = rgba(bottom);
  const mix = (x: number, y: number) => Math.round(x * a + y * (1 - a));
  return '#' + [mix(r, R), mix(g, G), mix(b, B)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function luminance(hex: string): number {
  const [r, g, b] = rgba(hex)
    .slice(0, 3)
    .map((v) => v / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(THEMES)('AC9: --color-on-fill on every #183 fill, with the overlays applied (%s)', (theme) => {
  // control-contrast.test.ts's FILLS.
  const FILLS = [
    '--color-primary-fill',
    '--color-primary-fill-hover',
    '--color-danger-fill',
    '--color-danger-fill-hover',
    '--color-success-fill',
  ];
  const text = resolveVar('var(--color-on-fill)', theme);
  it.each(FILLS.flatMap((f) => ['--state-hover', '--state-pressed'].map((o) => [f, o] as const)))(
    '%s under %s',
    (fill, overlay) => {
      const base = resolveVar(`var(${fill})`, theme);
      const shown = over(resolveVar(`var(${overlay})`, theme), base);
      expect(contrast(text, shown), `${shown}`).toBeGreaterThanOrEqual(4.5);
      // The overlay moves the fill away from its text, never toward it.
      expect(contrast(text, shown)).toBeGreaterThanOrEqual(contrast(text, base));
    },
  );
});

// ── AC10: selected ──────────────────────────────────────────────────────────

describe('AC10: selected keeps its non-colour cue and its ARIA state', () => {
  const SELECTED: Record<string, string[]> = {
    'filter-chip': ['aria-pressed', 'aria-expanded'],
    'label-chip': ['aria-pressed'],
    'effort-btn': ['aria-pressed'],
    'sub-type-btn': ['aria-pressed'],
    'theme-toggle-btn': ['aria-pressed'],
    'trends-group-btn': ['aria-pressed'],
    'trends-chip': ['aria-expanded'],
    'trends-view-btn': ['aria-pressed'],
    'trends-menu-item': ['aria-checked'],
    'library-switch-btn': ['aria-current'],
    'color-swatch': ['aria-checked'],
    'section-picker-pill': ['aria-pressed'],
    'week-day': ['aria-pressed'],
    'bottom-nav-tab': ['aria-current'],
    'calendar-day': ['aria-selected'],
  };
  // "+ New Label" is a label-chip that creates; it is never selected.
  const NEVER_SELECTED = ['label-chip-create'];

  it.each(Object.entries(SELECTED))('every .%s exposes its state', (cls, attrs) => {
    const found = controls.filter((c) => c.classes.includes(cls) && !c.classes.some((x) => NEVER_SELECTED.includes(x)));
    expect(found.length).toBeGreaterThan(0);
    for (const c of found)
      expect(
        c.aria.some((a) => attrs.includes(a)),
        where(c),
      ).toBe(true);
  });

  const body = (selector: string) => {
    const r = rules.find((x) => x.selector === selector && x.media.length === 0);
    if (!r) throw new Error(`No rule "${selector}"`);
    return declarations(r.body);
  };

  it('the bottom tab keeps its inset bar and bold label', () => {
    expect(body('.bottom-nav-tab.active').get('box-shadow')?.value).toBe('inset 0 2px 0 var(--color-primary)');
    expect(body('.bottom-nav-tab.active .bottom-nav-label').get('font-weight')?.value).toBe('700');
  });

  it('chips keep their tick, swatches their check and border', () => {
    expect(body('.chip-check').get('font-weight')?.value).toBe('700');
    expect(body('.color-swatch.selected').get('border-color')?.value).toBe('currentColor');
    expect(body('.color-swatch-check')).toBeDefined();
  });

  it('a hovered or pressed selected control keeps its cue under the overlay', () => {
    const tab = build('button', ['bottom-nav-tab', 'active'], { 'aria-current': 'page' });
    for (const s of [{ hover: true, hoverDevice: true }, { active: true }]) {
      expect(value(tab, 'box-shadow', s)).toBe('inset 0 2px 0 var(--color-primary)');
      expect(value(tab, 'color', s)).toBe('var(--color-primary-text)');
    }
  });
});
