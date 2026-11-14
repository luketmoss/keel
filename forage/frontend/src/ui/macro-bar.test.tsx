// #864: the macro bars and the day card's parts-of-the-whole More nutrition, from the DOM and the stylesheet.
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/preact';
import { readGlobalCss, themeTokens } from '../test-css';
import { MacroBar, PartsBar } from './macro-bar';
import { MoreNutrition, loadMoreOpen } from './more-nutrition';

beforeEach(() => {
  localStorage.clear();
  loadMoreOpen();
});

describe('MacroBar', () => {
  it('is an image naming each macro and its percentage, with a segment each in order', () => {
    render(<MacroBar protein={62} carbs={140} fat={48} size="day" />);
    const bar = screen.getByRole('img');
    expect(bar.getAttribute('aria-label')).toBe('Calories by macro: protein 20%, carbs 45%, fat 35%.');
    expect([...bar.children].map((c) => c.className)).toEqual([
      'macro-seg macro-protein',
      'macro-seg macro-carbs',
      'macro-seg macro-fat',
    ]);
    expect((screen.getByTestId('macro-seg-fat') as HTMLElement).style.flexGrow).toBe('432');
  });

  it('is an empty track when nothing is known, and drops a macro of 0', () => {
    const { unmount } = render(<MacroBar protein={null} carbs={null} fat={null} size="day" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Calories by macro: not known.');
    expect(screen.getByTestId('macro-empty')).toBeDefined();
    unmount();
    render(<MacroBar protein={10} carbs={10} fat={0} size="meal" />);
    expect(screen.queryByTestId('macro-seg-fat')).toBeNull();
    expect(screen.getByTestId('macro-bar').className).toContain('macro-bar-meal');
  });
});

describe('PartsBar', () => {
  it('sizes slices by grams over the parent, with added sugars inside sugars', () => {
    render(
      <PartsBar
        parent={100}
        parts={[
          { key: 'sugars_g', grams: 40, tone: 'sugars' },
          { key: 'added_sugars_g', grams: 10, tone: 'added', inside: true },
          { key: 'fiber_g', grams: 20, tone: 'fiber' },
        ]}
      />,
    );
    expect((screen.getByTestId('part-sugars_g') as HTMLElement).style.flexGrow).toBe('40');
    expect((screen.getByTestId('part-fiber_g') as HTMLElement).style.flexGrow).toBe('20');
    const added = screen.getByTestId('part-added_sugars_g') as HTMLElement;
    expect(screen.getByTestId('part-sugars_g').contains(added)).toBe(true);
    expect(added.style.width).toBe('25%');
    expect(screen.getByTestId('parts-bar').getAttribute('aria-hidden')).toBe('true');
  });
});

const VALUES = {
  satfat_g: 9,
  transfat_g: 0.5,
  cholesterol_mg: 210,
  sodium_mg: 1840,
  fiber_g: 22,
  sugars_g: 48,
  added_sugars_g: 20,
};
const NONE = "None of today's entries has sodium, fiber or the rest yet.";

function day(over: Partial<Parameters<typeof MoreNutrition>[0]> = {}) {
  return <MoreNutrition values={VALUES} fat={48} carbs={140} rounding="whole" parts noneText={NONE} {...over} />;
}

describe('More nutrition as parts of the whole', () => {
  it('shows a Carbs group, a Fat group, then cholesterol and sodium as plain rows', () => {
    render(day());
    fireEvent.click(screen.getByRole('button', { name: /More nutrition/ }));
    const carbs = screen.getByTestId('group-carbs');
    expect(carbs.textContent).toContain('Carbs140 g');
    expect(screen.getByTestId('share-sugars_g').textContent).toBe('34% of carbs');
    expect(screen.getByTestId('share-added_sugars_g').textContent).toBe('42% of sugars');
    expect(screen.getByTestId('share-fiber_g').textContent).toBe('16% of carbs');
    expect(screen.getByTestId('share-satfat_g').textContent).toBe('19% of fat');
    expect(screen.getByTestId('share-transfat_g').textContent).toBe('1% of fat');
    expect(screen.getByTestId('more-transfat_g').textContent).toContain('1 g');
    expect(screen.getByTestId('more-sodium_mg').textContent).toBe('Sodium1,840 mg');
    expect(screen.getByTestId('more-cholesterol_mg').textContent).toBe('Cholesterol210 mg');
    expect(screen.getAllByTestId('parts-bar')).toHaveLength(2);
  });

  it('keeps the toggle, its aria-expanded and its remembered state', () => {
    render(day());
    const toggle = screen.getByRole('button', { name: /More nutrition/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBeTruthy();
    expect(localStorage.getItem('forage_more_nutrition')).toBe('1');
  });

  it('reads — with no share and no slice for an unknown part, and at least for a counted one', () => {
    render(
      day({
        values: { ...VALUES, fiber_g: null, transfat_g: null, sugars_g: null },
        unknown: { satfat_g: 1, added_sugars_g: 1 } as never,
        atLeastNote: "At least: some entries don't have this one.",
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /More nutrition/ }));
    const fiber = screen.getByTestId('more-fiber_g');
    expect(within(fiber).getByLabelText('not known')).toBeDefined();
    expect(screen.queryByTestId('share-fiber_g')).toBeNull();
    expect(screen.queryByTestId('part-fiber_g')).toBeNull();
    expect(screen.getByTestId('more-satfat_g').textContent).toContain('at least 9 g');
    expect(screen.getByTestId('share-satfat_g').textContent).toBe('at least 19% of fat');
    // Added sugars known, sugars unknown: drawn alone, its share not known.
    expect(screen.getByTestId('part-added_sugars_g')).toBeDefined();
    expect(
      within(screen.getByTestId('share-added_sugars_g')).getByLabelText('share of sugars not known'),
    ).toBeDefined();
    expect(screen.getAllByTestId('more-at-least')).toHaveLength(1);
  });

  it('shows only the one line when all seven are unknown', () => {
    render(
      day({
        values: {
          satfat_g: null,
          transfat_g: null,
          cholesterol_mg: null,
          sodium_mg: null,
          fiber_g: null,
          sugars_g: null,
          added_sugars_g: null,
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /More nutrition/ }));
    expect(screen.getByTestId('more-none').textContent).toBe(NONE);
    expect(screen.queryByTestId('group-carbs')).toBeNull();
  });
});

describe('the macro colours', () => {
  const css = readGlobalCss();
  const tokens = [
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-macro-carbs-added',
    '--color-macro-fat-trans',
  ];
  type RGB = [number, number, number];
  const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  const lum = (rgb: RGB) => {
    const l = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const theme of ['light', 'dark'] as const) {
    const set = themeTokens(css, theme);
    it(`${theme}: every macro token is defined`, () => {
      for (const t of tokens) expect(set[t]).toMatch(/^#[0-9a-f]{6}$/i);
    });
    it(`${theme}: protein, carbs and fat differ in lightness and each meets 3:1 on --color-surface`, () => {
      const [p, c, f] = ['--color-macro-protein', '--color-macro-carbs', '--color-macro-fat'].map((t) => set[t]);
      expect(new Set([lum(hex(p)), lum(hex(c)), lum(hex(f))]).size).toBe(3);
      for (const colour of [p, c, f]) expect(ratio(colour, set['--color-surface'])).toBeGreaterThanOrEqual(3);
    });
  }
});
