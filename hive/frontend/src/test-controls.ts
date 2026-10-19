// Test-only: the controls the TSX renders, and the design notes' families of them
// (hive/docs/design/452-interaction-states.md). Shared by interaction-states.test.ts
// (#452) and touch-targets.test.ts (#453). The TSX is parsed with the TypeScript
// compiler: every <button>, <a href>, role control and form field, with its classes.
// @ts-ignore -- Node builtins available at test runtime
import { readFileSync, readdirSync, statSync } from 'fs';
// @ts-ignore
import { dirname, join, relative } from 'path';
// @ts-ignore
import { fileURLToPath } from 'url';
import ts from 'typescript';

export const here = dirname(fileURLToPath(import.meta.url));

// ── The families ────────────────────────────────────────────────────────────

/** The design note's Families table, as class names. */
export const FAMILIES = {
  'Filled buttons': ['btn-primary', 'btn-danger', 'fab', 'login-btn', 'filter-popup-apply'],
  'Quiet buttons': [
    'btn-ghost', 'share-archive-board-btn', 'filter-popup-reset', 'column-archive-link', 'toast-action',
    'label-new-pill', 'column-settings-add-btn', 'column-settings-name',
    'subtask-date-add-inline', 'overflow-menu-btn',
  ],
  'Icon buttons': [
    'btn-icon', 'btn-icon-danger', 'kebab-trigger', 'subtask-kebab-btn', 'subtask-action-btn', 'subtask-add-circle',
    'archive-search-clear', 'filter-search-clear', 'filter-popup-close', 'share-btn', 'share-remove-btn',
    'staged-subtask-remove', 'label-gear-btn', 'column-add-btn',
    'column-settings-delete-btn', 'date-clear-btn', 'user-dropdown-trigger',
  ],
  'Chips and toggles': [
    'filter-chip', 'filter-toggle', 'label-toggle', 'theme-toggle-btn', 'color-swatch',
    'column-color-swatch', 'column-settings-swatch', 'icon-swatch', 'quick-date-chip', 'owner-circle',
    'status-chevron', 'check-icon', 'subtask-date-inline',
  ],
  'Rows and cards': [
    'card', 'card-title', 'archive-item', 'kebab-item', 'overflow-menu-item',
    'user-dropdown-edit-profile', 'user-dropdown-signout', 'subtask-menu-item', 'subtask-title',
    'editable-value', 'due-date-btn', 'completed-date-btn', 'column-add-row',
  ],
  Navigation: ['view-tab', 'settings-tab', 'column-indicator-dot'],
  Fields: [
    'filter-search-input', 'subtask-add-input', 'subtask-add-date', 'subtask-title-input',
    'label-form-input', 'board-switcher-select', 'column-sort-select', 'archive-search-input',
    'profile-email-input', 'due-date-hidden', 'column-settings-name-inline', 'column-settings-name-input',
    'column-settings-delete-select',
  ],
} as const satisfies Record<string, readonly string[]>;
export type Family = keyof typeof FAMILIES;

export const ALL_FAMILY_CLASSES: string[] = Object.values(FAMILIES).flat();
export const familyOf = (cls: string) =>
  (Object.keys(FAMILIES) as Family[]).find((f) => (FAMILIES[f] as readonly string[]).includes(cls));
export const NON_FIELD = ALL_FAMILY_CLASSES.filter((c) => familyOf(c) !== 'Fields');
export const OVERLAY_HOVER = NON_FIELD.filter((c) => familyOf(c) !== 'Filled buttons');

/** In a family and styled as one, but not a keyboard control the scan can see. */
export const NOT_A_CONTROL: Record<string, string> = {
  card: 'a <div> with onClick and draggable; keyboard users reach its card-title button and kebab',
};

// ── The TSX: every control the app renders ──────────────────────────────────

export interface Control {
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
  /** A field with no class of its own, inside a .form-field wrapper that styles it. */
  inFormField: boolean;
}

export function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f: string) => {
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
  } else ts.forEachChild(node, (c) => { strings(c, acc); });
  return acc;
}

export const unresolved: string[] = [];

/** Wrappers whose CSS styles the unclassed input, select or textarea inside them. */
export const FIELD_WRAPPERS = ['form-field', 'detail-field', 'delete-board-target'];

/** Whether an ancestor element's class names a field wrapper. */
function inFormFieldWrapper(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) && p.openingElement !== n) {
      const names = strings(p.openingElement.attributes).join(' ');
      if (FIELD_WRAPPERS.some((w) => names.includes(w))) return true;
    }
  }
  return false;
}

function scan(): Control[] {
  const out: Control[] = [];
  for (const path of tsxFiles(here)) {
    const file = relative(here, path).replace(/\\/g, '/');
    const sf = ts.createSourceFile(path, readFileSync(path, 'utf-8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const locals = new Map<string, ts.Expression>();
    const collect = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) locals.set(n.name.text, n.initializer);
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
      const tokens = found.join(' ').split(/\s+/).filter((t) => /^[a-z][\w-]*[a-z0-9]$/.test(t));
      if (tokens.length === 0) {
        unresolved.push(`${file}|${expr.getText(sf)} (line ${sf.getLineAndCharacterOfPosition(expr.getStart()).line + 1})`);
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
        const role =
          lit('role') ?? (roleInit && strings(roleInit).some((r) => /^(button|menuitem\w*|radio)$/.test(r)) ? strings(roleInit).find((r) => /^(button|menuitem\w*|radio)$/.test(r)) : undefined);
        const isControl =
          tag === 'button' ||
          (tag === 'a' && attrs.has('href')) ||
          (role !== undefined && /^(button|menuitem\w*|radio)$/.test(role)) ||
          tag === 'input' || tag === 'select' || tag === 'textarea';
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
            inFormField: inFormFieldWrapper(n),
          });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

export const controls = scan();
export const where = (c: Control) => `${c.file}:${c.line} <${c.tag} class="${c.classes.join(' ')}">`;
export const isNativeToggle = (c: Control) => c.tag === 'input' && (c.type === 'checkbox' || c.type === 'radio');

