import type { ComponentChildren } from 'preact';
import type { TabId } from './routes';
import { EatenIcon, LibraryIcon, PlanIcon, ShopIcon } from './nav-icons';

export interface TabDef {
  id: TabId;
  label: string;
  icon: () => ComponentChildren;
  /** The empty state for a signed-in user with no data. No button of its own: a tab's add flow is in its header (#709). */
  empty: { heading: string; sentence: string };
}

/** In tab-bar order. Copy from forage/docs/design/704-app-shell.md. */
export const TABS: TabDef[] = [
  {
    id: 'plan',
    label: 'Plan',
    icon: PlanIcon,
    empty: {
      heading: 'Nothing planned yet',
      sentence: 'Meals you plan will show here, by day, with their calories.',
    },
  },
  {
    id: 'shop',
    label: 'Shop',
    icon: ShopIcon,
    empty: {
      // #718: Shop draws its own no-trip card with this copy and its Plan a trip button.
      heading: 'No trip in progress',
      sentence:
        'A trip gathers what your planned meals need, so you can mark what you have and split the rest by store.',
    },
  },
  {
    id: 'eaten',
    label: 'Eaten',
    icon: EatenIcon,
    // #712: Eaten is always the day view, with its own "Nothing logged" day card; this copy is no longer shown.
    empty: {
      heading: 'Nothing logged',
      sentence: 'What you eat will show here by day, with its calories and macros.',
    },
  },
  {
    id: 'library',
    label: 'Library',
    icon: LibraryIcon,
    empty: {
      heading: 'No foods yet',
      sentence: 'Foods you use in recipes and logs will be kept here, with their nutrition.',
    },
  },
];
