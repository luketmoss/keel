// #706: what the paste box and the file picker send.
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parseAmount } from './amount';
import { MAX_INPUT_CHARS, blocksFromHtml, fitBlocks, readImportText } from './read-input';

const here = dirname(fileURLToPath(import.meta.url));
const SAVED_PAGE = readFileSync(resolve(here, 'fixtures/saved-page.html'), 'utf-8');

describe('readImportText', () => {
  it('a bookmarklet payload is jsonld with its url', () => {
    const payload = JSON.stringify({ forage: 1, url: 'https://example.com/r', blocks: ['{"@type":"Recipe"}'] });
    expect(readImportText(payload)).toEqual({
      input: { jsonld: ['{"@type":"Recipe"}'], url: 'https://example.com/r' },
    });
  });

  it('JSON-LD is jsonld; a structured recipe is a recipe', () => {
    const ld = '{"@context":"https://schema.org","@graph":[{"@type":"Recipe","name":"x"}]}';
    expect(readImportText(ld)).toEqual({ input: { jsonld: [ld] } });
    const recipe = { name: 'Toast', servings: 1, lines: ['1 slice bread'], steps: [] };
    expect(readImportText(JSON.stringify(recipe))).toEqual({ input: { recipe } });
  });

  it('a saved page sends only its Recipe-bearing blocks, with its canonical url', () => {
    const result = readImportText(SAVED_PAGE);
    expect('input' in result && result.input).toMatchObject({ url: 'https://example.com/weeknight-lentil-soup' });
    const blocks = 'input' in result && 'jsonld' in result.input ? result.input.jsonld : [];
    expect(blocks).toHaveLength(1);
    expect(JSON.parse(blocks[0])['@graph'][1].name).toBe('Weeknight Lentil Soup');
  });

  it('anything else is the plain-text format', () => {
    expect(readImportText('Toast\nServes 1\nIngredients\n1 slice bread')).toEqual({
      input: { text: 'Toast\nServes 1\nIngredients\n1 slice bread' },
    });
  });

  it('JSON that is neither, a page with no recipe, and blank are no_recipe', () => {
    expect(readImportText('{"hello":1}')).toEqual({ error: 'no_recipe' });
    expect(readImportText('{not json')).toEqual({ error: 'no_recipe' });
    expect(readImportText('<html><body>no data</body></html>')).toEqual({ error: 'no_recipe' });
    expect(readImportText('   ')).toEqual({ error: 'no_recipe' });
  });

  it('text over the limit is too_large', () => {
    expect(readImportText('x'.repeat(MAX_INPUT_CHARS + 1))).toEqual({ error: 'too_large' });
  });
});

describe('fitBlocks', () => {
  const recipe = { '@type': 'Recipe', name: 'Soup', recipeIngredient: ['1 onion'] };
  const bulky = { '@type': 'WebPage', name: 'x', description: 'y'.repeat(MAX_INPUT_CHARS) };

  it('blocks under the limit are sent as they are', () => {
    const blocks = [JSON.stringify(recipe)];
    expect(fitBlocks(blocks)).toBe(blocks);
  });

  it('over the limit, only the graph nodes typed Recipe are kept', () => {
    const block = JSON.stringify({ '@context': 'https://schema.org', '@graph': [bulky, recipe] });
    expect(block.length).toBeGreaterThan(MAX_INPUT_CHARS);
    expect(fitBlocks([block])).toEqual([JSON.stringify(recipe)]);
  });

  it('a Recipe still over the limit is null', () => {
    const huge = { ...recipe, recipeIngredient: ['z'.repeat(MAX_INPUT_CHARS)] };
    expect(fitBlocks([JSON.stringify({ '@graph': [huge] })])).toBeNull();
  });
});

describe('blocksFromHtml', () => {
  it('skips a block that does not mention a Recipe', () => {
    const { blocks } = blocksFromHtml(SAVED_PAGE);
    expect(blocks.every((b) => b.includes('"Recipe"'))).toBe(true);
  });
});

describe('parseAmount (line edit)', () => {
  it.each([
    ['2', 2],
    ['1 1/2', 1.5],
    ['1-1/2', 1.5],
    ['½', 0.5],
    ['1½', 1.5],
    ['1-2', 1],
    ['1/3', 0.333],
    ['', null],
  ])('%s is %s', (raw, n) => expect(parseAmount(raw)).toBe(n));

  it('words are not an amount', () => expect(parseAmount('some')).toBeUndefined());
});
