import type { WorkoutType } from '../../api/types';
import { goBack } from '../../router/router';
import type { ComponentType } from 'preact';
import { DumbbellIcon, StretchIcon, BikeIcon, MountainIcon, RunIcon, FootprintsIcon } from '../shared/icons';

interface Props {
  onSelect: (type: WorkoutType) => void;
}

const TYPES: { type: WorkoutType; label: string; Icon: ComponentType }[] = [
  { type: 'weight', label: 'Weight', Icon: DumbbellIcon },
  { type: 'stretch', label: 'Stretch', Icon: StretchIcon },
  { type: 'bike', label: 'Bike', Icon: BikeIcon },
  { type: 'hike', label: 'Hike', Icon: MountainIcon },
  { type: 'run', label: 'Run', Icon: RunIcon },
  { type: 'walk', label: 'Walk', Icon: FootprintsIcon },
];

export function TypeSelector({ onSelect }: Props) {
  return (
    <div class="screen type-selector-screen">
      <div class="template-editor-header">
        <button
          class="template-editor-back"
          onClick={() => goBack()}
          aria-label="Back"
        >
          ← Back
        </button>
      </div>

      <h2 style={{ marginBottom: 'var(--space-lg)' }}>What type of workout?</h2>

      <div class="type-selector-grid">
        {TYPES.map(({ type, label, Icon }) => (
          <button
            key={type}
            class={`type-card type-card-${type}`}
            onClick={() => onSelect(type)}
          >
            <span class="type-card-icon"><Icon /></span>
            <span class="type-card-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
