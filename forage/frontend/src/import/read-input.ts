// What the paste box and the file picker share (#706): turn text into one
// `importRecipe` input. The browser does only this sorting, and pulls the
// JSON-LD out of a saved page; every parse of a recipe happens in the API.
import type { ImportInput } from '../api/types';

/** The API refuses a `jsonld` or `text` longer than this (#703's payload limit). */
export const MAX_INPUT_CHARS = 45_000;

export type ReadResult = { input: ImportInput } | { error: 'no_recipe' | 'too_large' };

type Json = unknown;

function isRecipeNode(node: Json): boolean {
  const t = (node as Record<string, unknown> | null)?.['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
}

/** Every node typed Recipe, at the top, in an array, or in `@graph`. */
function recipeNodes(data: Json, out: Json[] = []): Json[] {
  if (!data || typeof data !== 'object') return out;
  if (Array.isArray(data)) {
    data.forEach((d) => recipeNodes(d, out));
    return out;
  }
  if (isRecipeNode(data)) out.push(data);
  else recipeNodes((data as Record<string, unknown>)['@graph'], out);
  return out;
}

function mentionsRecipe(block: string): boolean {
  try {
    return recipeNodes(JSON.parse(block)).length > 0;
  } catch {
    return /"Recipe"/.test(block);
  }
}

const size = (blocks: string[]) => blocks.reduce((n, b) => n + b.length, 0);

/**
 * The blocks as sent, or, when together they are over the limit, only their
 * nodes typed Recipe. Null when even those are too large.
 */
export function fitBlocks(blocks: string[]): string[] | null {
  if (size(blocks) <= MAX_INPUT_CHARS) return blocks;
  const nodes: string[] = [];
  for (const block of blocks) {
    try {
      recipeNodes(JSON.parse(block)).forEach((n) => nodes.push(JSON.stringify(n)));
    } catch {
      // A block that does not parse cannot be trimmed, and the API would skip it.
    }
  }
  return nodes.length && size(nodes) <= MAX_INPUT_CHARS ? nodes : null;
}

/** A saved page's Recipe-bearing JSON-LD blocks, and its own URL when it names one. */
export function blocksFromHtml(html: string): { blocks: string[]; url: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => s.textContent ?? '')
    .filter(mentionsRecipe);
  const url =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ??
    '';
  return { blocks, url: /^https?:\/\//i.test(url) ? url : '' };
}

function jsonldInput(blocks: string[], url: string): ReadResult {
  if (!blocks.length) return { error: 'no_recipe' };
  const fitted = fitBlocks(blocks);
  if (!fitted) return { error: 'too_large' };
  return { input: url ? { jsonld: fitted, url } : { jsonld: fitted } };
}

/**
 * Sort pasted or file text: JSON is a bookmarklet payload, JSON-LD or a
 * structured recipe; text with `<script` or `<html` is a page; anything else
 * is the plain-text format.
 */
export function readImportText(raw: string): ReadResult {
  const text = raw.trim();
  if (!text) return { error: 'no_recipe' };

  if (text.startsWith('{') || text.startsWith('[')) {
    let data: Json;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: 'no_recipe' };
    }
    const obj = data as Record<string, unknown>;
    if (obj && !Array.isArray(data) && obj.forage === 1 && Array.isArray(obj.blocks)) {
      const url = typeof obj.url === 'string' && /^https?:\/\//i.test(obj.url) ? obj.url : '';
      return jsonldInput(
        obj.blocks.filter((b): b is string => typeof b === 'string'),
        url,
      );
    }
    if (obj && !Array.isArray(data) && Array.isArray(obj.lines)) {
      return { input: { recipe: obj as never } };
    }
    if (recipeNodes(data).length) return jsonldInput([text], '');
    return { error: 'no_recipe' };
  }

  if (/<script|<html/i.test(text)) {
    const { blocks, url } = blocksFromHtml(text);
    return jsonldInput(blocks, url);
  }

  if (text.length > MAX_INPUT_CHARS) return { error: 'too_large' };
  return { input: { text } };
}
