import { useState, useCallback, useRef } from 'preact/hooks';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import {
  activeBoard,
  allDoneItemsSorted,
  boardLabels,
  labels as labelsStore,
  selectItem,
} from '../../state/board-store';
import { LabelBadge } from '../shared/label-badge';
import { ArrowLeftIcon, CloseIcon, SearchIcon } from '../today/today-icons';
import {
  NO_FILTER,
  filterCompleted,
  formatCompletedDate,
  groupByMonth,
  isFilterOn,
  isRangeInverted,
  itemLabels,
  labelsUsed,
  type CompletedFilter,
  type CompletedRange,
} from '../../utils/completed-filter';
import type { ItemWithRow } from '../../api/types';

interface ArchiveDialogProps {
  onClose: () => void;
}

const RANGES: { value: CompletedRange; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

/** Below 768px the dialog is a full-screen page, and focus starts on Back (#655). */
function isPhone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
}

export function ArchiveDialog({ onClose }: ArchiveDialogProps) {
  // Component state, not signals: closing the dialog drops the filters, and opening an
  // item from the list keeps them (the dialog stays mounted beneath it).
  const [filter, setFilter] = useState<CompletedFilter>(NO_FILTER);
  const searchRef = useRef<HTMLInputElement>(null);
  const phone = useRef(isPhone()).current;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const trapRef = useFocusTrap(handleClose);

  const today = new Date();
  const allItems = allDoneItemsSorted.value;
  const boardName = activeBoard.value?.name ?? '';
  const labelNames = labelsUsed(
    allItems,
    boardLabels.value.map((l) => l.label),
  );
  const matches = filterCompleted(allItems, filter, today);
  const groups = groupByMonth(matches);
  const filterOn = isFilterOn(filter);
  const inverted = isRangeInverted(filter);
  const total = allItems.length;

  const patch = (changes: Partial<CompletedFilter>) => setFilter((f) => ({ ...f, ...changes }));

  const handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
      handleClose();
    }
  };

  const clearSearch = () => {
    patch({ text: '' });
    searchRef.current?.focus();
  };

  const clearFilters = () => {
    setFilter(NO_FILTER);
    searchRef.current?.focus();
  };

  const handleSearchKeyDown = (e: KeyboardEvent) => {
    // Escape clears a non-empty field; in an empty one it falls through and closes.
    if (e.key === 'Escape' && filter.text) {
      e.preventDefault();
      e.stopPropagation();
      patch({ text: '' });
    }
  };

  const chooseRange = (range: CompletedRange) => {
    // Leaving Custom forgets its dates.
    patch(range === 'custom' ? { range } : { range, from: '', to: '' });
  };

  const labelColor = (label: string) => labelsStore.value.find((l) => l.label === label)?.color || '#999';

  return (
    <div class="modal-overlay archive-overlay" onClick={handleOverlayClick}>
      <div
        class="modal archive-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Completed items on ${boardName}`}
        ref={trapRef}
      >
        <div class="archive-topbar">
          <button
            class="today-round-btn archive-back-btn"
            onClick={handleClose}
            aria-label={`Back to ${boardName || 'the board'}`}
            data-autofocus={phone ? '' : undefined}
          >
            <ArrowLeftIcon />
          </button>
          <h2 class="archive-title">Completed</h2>
          <button class="today-round-btn archive-close-btn" onClick={handleClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div class="archive-controls">
          <div class="archive-search-field">
            <span class="board-search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              ref={searchRef}
              type="text"
              value={filter.text}
              onInput={(e) => patch({ text: (e.target as HTMLInputElement).value })}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search titles and notes"
              aria-label="Search completed items"
              class="archive-search-input"
              data-autofocus={phone ? undefined : ''}
            />
            {filter.text && (
              <button class="archive-search-clear" onClick={clearSearch} aria-label="Clear search">
                <CloseIcon />
              </button>
            )}
          </div>

          <div class="archive-filter-group">
            <span class="archive-filter-heading" id="archive-completed-heading">
              Completed
            </span>
            <div class="filter-row" role="group" aria-labelledby="archive-completed-heading">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  class={`filter-chip${filter.range === r.value ? ' filter-chip-active' : ''}`}
                  aria-pressed={filter.range === r.value}
                  onClick={() => chooseRange(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {filter.range === 'custom' && (
            <div class="archive-dates-block">
              <div class="archive-dates">
                <div class="form-field">
                  <label for="archive-from">From</label>
                  <input
                    id="archive-from"
                    type="date"
                    value={filter.from}
                    onInput={(e) => patch({ from: (e.target as HTMLInputElement).value })}
                  />
                </div>
                <div class="form-field">
                  <label for="archive-to">To</label>
                  <input
                    id="archive-to"
                    type="date"
                    value={filter.to}
                    aria-invalid={inverted ? 'true' : undefined}
                    aria-describedby={inverted ? 'archive-range-error' : undefined}
                    onInput={(e) => patch({ to: (e.target as HTMLInputElement).value })}
                  />
                </div>
              </div>
              {inverted && (
                <p class="archive-range-error" id="archive-range-error">
                  To is before From
                </p>
              )}
            </div>
          )}

          {labelNames.length > 0 && (
            <div class="archive-filter-group">
              <span class="archive-filter-heading" id="archive-label-heading">
                Label
              </span>
              <div class="filter-row" role="group" aria-labelledby="archive-label-heading">
                {labelNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    class={`filter-chip${filter.label === name ? ' filter-chip-active' : ''}`}
                    aria-pressed={filter.label === name}
                    onClick={() => patch({ label: filter.label === name ? null : name })}
                  >
                    <span class="filter-chip-dot" style={{ backgroundColor: labelColor(name) }} aria-hidden="true" />
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {total > 0 && (
            <div class="archive-results-count" aria-live="polite">
              <span>{filterOn ? `${matches.length} of ${total} completed` : `${total} completed`}</span>
              {filterOn && (
                <button type="button" class="btn btn-ghost archive-clear-filters" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        <div class="archive-list">
          {total === 0 ? (
            <div class="archive-empty">No completed items yet</div>
          ) : matches.length === 0 ? (
            <div class="archive-empty">
              <p>No completed items match</p>
              <button type="button" class="btn btn-ghost archive-empty-clear" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            groups.map((g) => (
              <section class="archive-group" key={g.key}>
                <h3 class="archive-group-heading">
                  {g.heading} · {g.items.length}
                </h3>
                <div class="archive-group-card">
                  {g.items.map((item) => (
                    <ArchiveItem key={item.id} item={item} today={today} onClick={selectItem} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface ArchiveItemProps {
  item: ItemWithRow;
  today: Date;
  onClick: (id: string) => void;
}

function ArchiveItem({ item, today, onClick }: ArchiveItemProps) {
  const names = itemLabels(item);
  const date = formatCompletedDate(item.completed_at, today);

  return (
    <button
      class="archive-item"
      onClick={() => onClick(item.id)}
      aria-label={date ? `${item.title}, completed ${date}. Open item.` : `${item.title}. Open item.`}
    >
      <span class="archive-item-title">{item.title}</span>
      <span class="archive-item-meta">
        {date && <span class="archive-item-date">{date}</span>}
        {names.map((label) => (
          <LabelBadge key={label} label={label} />
        ))}
      </span>
    </button>
  );
}
