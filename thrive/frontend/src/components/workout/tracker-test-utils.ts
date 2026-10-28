// #667 — DOM helpers for the Logbook's tests: its rows, set tiles and editor, options menus and sheets.
import { fireEvent } from '@testing-library/preact';

/** Every exercise row on the screen, in the order the cards draw them. */
export const exerciseRows = () => [...document.querySelectorAll<HTMLElement>('.lb-cards [data-row-key]')];

/** The row for an exercise name (the first, when a name is listed twice). */
export const rowNamed = (name: string, nth = 0): HTMLElement => {
  const hits = exerciseRows().filter(
    (r) => r.querySelector('.lb-exercise-name, .lb-warmup-name')?.textContent === name,
  );
  if (!hits[nth]) throw new Error(`No row named ${name}`);
  return hits[nth];
};

/** The heading of the card a row sits in: "Primary", "Superset 1" ... */
export const cardOf = (row: HTMLElement): string => row.closest('.lb-card')!.querySelector('h2')!.textContent!;

export const tileOf = (row: HTMLElement, setNumber: number): HTMLButtonElement => {
  const tile = row.querySelector<HTMLButtonElement>(`.lb-tile[data-set="${setNumber}"]`);
  if (!tile) throw new Error(`No tile for set ${setNumber}`);
  return tile;
};

/** The set editor open in a row, if any. */
export const editorOf = (row: HTMLElement): HTMLElement | null => row.querySelector<HTMLElement>('.lb-editor');

/** Opens a set's editor (a tap on its tile, unless it is already open) and returns the editor. */
export function openSet(row: HTMLElement, setNumber: number): HTMLElement {
  const tile = tileOf(row, setNumber);
  if (tile.getAttribute('aria-expanded') !== 'true') fireEvent.click(tile);
  return editorOf(row)!;
}

export const weightField = (editor: HTMLElement) => editor.querySelectorAll<HTMLInputElement>('input.lb-step-input')[0];
export const repsField = (editor: HTMLElement) => editor.querySelectorAll<HTMLInputElement>('input.lb-step-input')[1];

export const typeWeight = (row: HTMLElement, setNumber: number, value: string) =>
  fireEvent.input(weightField(openSet(row, setNumber)), { target: { value } });
export const typeReps = (row: HTMLElement, setNumber: number, value: string) =>
  fireEvent.input(repsField(openSet(row, setNumber)), { target: { value } });

/** The effort pill with this word in a container. */
export const effortPill = (container: HTMLElement, word: string): HTMLButtonElement => {
  const hit = [...container.querySelectorAll<HTMLButtonElement>('.lb-effort-pill')].find((b) => b.textContent === word);
  if (!hit) throw new Error(`No ${word} pill`);
  return hit;
};

export const tapButton = (container: ParentNode, name: string | RegExp) => {
  const hit = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => {
    const label = b.getAttribute('aria-label') ?? b.textContent ?? '';
    return typeof name === 'string' ? label.trim() === name : name.test(label.trim());
  });
  if (!hit) throw new Error(`No button ${String(name)}`);
  fireEvent.click(hit);
  return hit;
};

/** Opens a row's options menu and returns the item with this label. */
export function menuItem(row: HTMLElement, label: string): HTMLButtonElement {
  const trigger = row.querySelector<HTMLButtonElement>('[data-options-btn]')!;
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  const item = [...row.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!item) throw new Error(`No menu item ${label}`);
  return item;
}

/** Chooses a menu item on a row. */
export const chooseMenu = (row: HTMLElement, label: string) => fireEvent.click(menuItem(row, label));

/** The remove-set button in an open editor. */
export const removeSetBtn = (editor: HTMLElement) =>
  [...editor.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Remove set')!;
