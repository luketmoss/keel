// Drives the Trends toolbar (#503) the way a person does: open a chip's menu,
// press an item. Shared by the screen's tests so none of them reaches into markup.

import { fireEvent } from '@testing-library/preact';
import { rangeItemLabel, averageItemLabel } from './trends-toolbar';
import type { RangeKey, AverageKey, ViewKey } from './series';

/** The chip for `Range` or `Average`, by its accessible-name prefix. */
export const chip = (c: Element, which: 'Range' | 'Average') =>
  c.querySelector<HTMLButtonElement>(`.trends-chip[aria-label^="${which}:"]`)!;

/** The open menu's items, in order. */
export const menuItems = (c: Element) => [...c.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];

/** Opens `which`'s menu and presses the item with this text. */
export function choose(c: Element, which: 'Range' | 'Average', itemText: string) {
  fireEvent.click(chip(c, which));
  fireEvent.click(menuItems(c).find((b) => b.textContent!.startsWith(itemText))!);
}

export const pickRange = (c: Element, key: RangeKey) => choose(c, 'Range', rangeItemLabel(key));
export const pickAverage = (c: Element, key: AverageKey) => choose(c, 'Average', averageItemLabel(key));

export const viewButton = (c: Element, v: ViewKey) =>
  c.querySelector<HTMLButtonElement>(`.trends-view-switch button[aria-label="${v}"]`)!;
export const pickView = (c: Element, v: ViewKey) => fireEvent.click(viewButton(c, v));
