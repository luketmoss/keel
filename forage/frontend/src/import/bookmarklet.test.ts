// #706: the bookmarklet, run against a document, copies exactly the Recipe
// block and the page URL.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOKMARKLET, BOOKMARKLET_SOURCE } from './bookmarklet';
import { readImportText } from './read-input';

const RECIPE = '{"@context":"https://schema.org","@type":"Recipe","name":"Toast","recipeIngredient":["1 slice bread"]}';
const WEBSITE = '{"@context":"https://schema.org","@type":"WebSite","name":"Recipes R Us","description":"Recipe site"}';

function page() {
  document.head.innerHTML = `
    <script type="application/ld+json">${WEBSITE}</script>
    <script type="application/ld+json">${RECIPE}</script>`;
}

/** Run the bookmark as a browser would: decode its href and evaluate it. */
function run() {
  const code = decodeURIComponent(BOOKMARKLET.slice('javascript:'.length));
  new Function(code)();
}

afterEach(() => {
  document.head.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the bookmarklet', () => {
  it('is a javascript: link of the source', () => {
    expect(BOOKMARKLET.startsWith('javascript:')).toBe(true);
    expect(BOOKMARKLET_SOURCE).toContain('application/ld+json');
  });

  it('copies exactly the Recipe block and the page URL, and says so', async () => {
    page();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    run();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = JSON.parse((writeText.mock.calls[0] as unknown as [string])[0]);
    expect(copied).toEqual({ forage: 1, url: window.location.href, blocks: [RECIPE] });
    expect(alert).toHaveBeenCalledWith('Forage: recipe copied. Go back to Forage and paste it.');
  });

  it('what it copies is what the paste box reads as jsonld', async () => {
    page();
    window.history.replaceState(null, '', '/recipes/toast');
    let copied = '';
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: (t: string) => ((copied = t), Promise.resolve()) },
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    run();
    expect(readImportText(copied)).toEqual({ input: { jsonld: [RECIPE], url: 'http://localhost:3000/recipes/toast' } });
    window.history.replaceState(null, '', '/');
  });

  it('a page with no recipe says so and copies nothing', () => {
    document.head.innerHTML = `<script type="application/ld+json">${WEBSITE}</script>`;
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    run();
    expect(writeText).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Forage: no recipe found on this page.');
  });
});
