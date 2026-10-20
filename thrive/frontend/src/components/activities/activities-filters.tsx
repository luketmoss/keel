// The Activities screen's filters (#527): a row of type chips (All, then each
// type with any completed activity), ending in a Tags chip that shows or hides
// today's tag row. `filterType` and `filterTags` are unchanged.

import type { ComponentType } from 'preact';
import { filterType, filterTags, allTags, completedWorkouts } from '../../state/store';
import { LabelBadge } from '../shared/label-badge';
import { DumbbellIcon, StretchIcon, BikeIcon, MountainIcon, RunIcon, FootprintsIcon } from '../shared/icons';
import type { WorkoutType } from '../../api/types';
import { TYPE_WORDS, typesPresent } from './activities-helpers';

/** Each type's #405 icon, as the type picker draws it. */
export const TYPE_ICONS: Record<WorkoutType, ComponentType> = {
  weight: DumbbellIcon,
  stretch: StretchIcon,
  bike: BikeIcon,
  hike: MountainIcon,
  run: RunIcon,
  walk: FootprintsIcon,
};

interface TypeChipsProps {
  tagsOpen: boolean;
  onToggleTags: () => void;
  /** The id of the tag row the Tags chip controls. */
  tagsId: string;
}

export function TypeChips({ tagsOpen, onToggleTags, tagsId }: TypeChipsProps) {
  const activeType = filterType.value;
  const activeTags = filterTags.value;
  const types = typesPresent(completedWorkouts.value);

  return (
    <div class="activities-chips" role="group" aria-label="Filter by type">
      <button
        type="button"
        class={`filter-chip${activeType === null ? ' active' : ''}`}
        aria-pressed={activeType === null}
        onClick={() => {
          filterType.value = null;
        }}
      >
        All
      </button>
      {types.map((type) => {
        const Icon = TYPE_ICONS[type];
        return (
          <button
            key={type}
            type="button"
            class={`filter-chip filter-chip-${type}${activeType === type ? ' active' : ''}`}
            aria-pressed={activeType === type}
            onClick={() => {
              filterType.value = type;
            }}
          >
            <span class="filter-chip-icon" aria-hidden="true">
              <Icon />
            </span>
            {TYPE_WORDS[type]}
          </button>
        );
      })}
      <button
        type="button"
        class="filter-chip filter-chip-tags"
        aria-expanded={tagsOpen}
        aria-controls={tagsId}
        onClick={onToggleTags}
      >
        {activeTags.length > 0 ? `Tags · ${activeTags.length}` : 'Tags'}
      </button>
    </div>
  );
}

/** Today's tag filter row, shown under the chips while the Tags chip is open. */
export function ActivitiesFilters({ id }: { id?: string }) {
  const activeType = filterType.value;
  const activeTags = filterTags.value;
  const tags = allTags.value;
  const hasFilters = activeType !== null || activeTags.length > 0;

  const toggleTag = (tag: string) => {
    filterTags.value = activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag];
  };

  const clearAll = () => {
    filterType.value = null;
    filterTags.value = [];
  };

  return (
    <div class="activities-filters" id={id}>
      {tags.length > 0 && (
        <div class="filter-row tag-filter-row">
          {tags.map((tag) => (
            <LabelBadge key={tag} name={tag} active={activeTags.includes(tag)} onClick={() => toggleTag(tag)} />
          ))}
        </div>
      )}

      {hasFilters && (
        <button class="filter-clear" onClick={clearAll}>
          Clear filters
        </button>
      )}
    </div>
  );
}
