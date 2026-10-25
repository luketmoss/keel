import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { GroupBy } from '../../state/board-store';
import {
  boards,
  activeBoardId,
  activeBoard,
  boardSummaries,
  destinationUrl,
  showCreateBoardModal,
  showShareModal,
  userBoardRole,
  filterLabel,
  filterSearch,
  filterDue,
  groupBy,
  setGroupBy,
  boardLabels as labelsStore,
  labelsInUse,
  rootItems,
} from '../../state/board-store';
import { onNavClick } from '../shell/tab-bar';
import { ChevronLeftIcon, MoreIcon, PeopleIcon, SearchIcon } from '../today/today-icons';

const GROUP_LABELS: Record<GroupBy, string> = { none: 'None', status: 'By status', label: 'By label' };
const GROUP_CHIP_WORDS: Record<GroupBy, string> = { none: 'None', status: 'Status', label: 'Label' };

/** A popup menu's open state, its dismissal (outside click, Escape) and arrow-key movement. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t) && btnRef.current && !btnRef.current.contains(t)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]');
        if (!items || items.length === 0) return;
        const idx = Array.from(items).indexOf(document.activeElement as HTMLElement);
        if (e.key === 'ArrowDown') items[(idx + 1) % items.length].focus();
        else items[(idx - 1 + items.length) % items.length].focus();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, setOpen, btnRef, menuRef };
}

/**
 * #626: the board's header (back link, who it is shared with, title, search, Share,
 * board options) and the filter chips under it. Built on #177's search, due and label
 * filters; the Filters popup is gone and the chips are one row.
 */
export function ControlBar() {
  const [localSearch, setLocalSearch] = useState('');
  // Phone: the search field replaces the title row until Cancel
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = useMenu();
  const groupMenu = useMenu();

  const currentBoardId = activeBoardId.value;
  useEffect(() => {
    options.setOpen(false);
    groupMenu.setOpen(false);
    setSearchOpen(false);
    setLocalSearch('');
  }, [currentBoardId]);

  // Sync localSearch from the signal (e.g. after a board switch clears it)
  useEffect(() => {
    if (filterSearch.value === '' && localSearch !== '') setLocalSearch('');
  }, [filterSearch.value]);

  // A label renamed or deleted while its chip is on: the filter clears.
  useEffect(() => {
    if (filterLabel.value && !labelsStore.value.some((l) => l.label === filterLabel.value)) {
      filterLabel.value = null;
    }
  }, [filterLabel.value, labelsStore.value]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const handleSearchInput = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      filterSearch.value = value;
    }, 150);
  }, []);

  const clearSearch = useCallback(() => {
    setLocalSearch('');
    filterSearch.value = '';
    searchRef.current?.focus();
  }, []);

  /** Cancel (phone): clear the search and bring the title back. */
  const cancelSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLocalSearch('');
    filterSearch.value = '';
    setSearchOpen(false);
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (searchOpen) {
        e.preventDefault();
        cancelSearch();
      } else if (localSearch) {
        e.preventDefault();
        clearSearch();
      }
    },
    [localSearch, searchOpen, clearSearch, cancelSearch],
  );

  // Empty boards: show new board button only
  if (boards.value.length === 0) {
    return (
      <div class="control-bar" data-testid="control-bar">
        <button
          class="btn btn-primary"
          onClick={() => {
            showCreateBoardModal.value = true;
          }}
        >
          + New Board
        </button>
      </div>
    );
  }

  const isOwner = userBoardRole.value === 'owner';
  const board = activeBoard.value;
  const summary = boardSummaries.value.find((s) => s.board.id === currentBoardId);

  const anyChip = !!(filterDue.value || filterLabel.value);
  const filterOn = anyChip || !!filterSearch.value;
  // Filtered card count for the live region
  const filteredCount = rootItems.value.length;

  // The label chips: those in use, in the board's order, and the one that is on even if nothing uses it now.
  const labelChips = labelsStore.value.filter(
    (l) => l.label === filterLabel.value || labelsInUse.value.some((u) => u.label === l.label),
  );

  const clearChips = () => {
    filterDue.value = null;
    filterLabel.value = null;
  };

  const handleGroupClick = (mode: GroupBy) => {
    setGroupBy(mode);
    options.setOpen(false);
    groupMenu.setOpen(false);
  };

  const groupItems = (prefix: string) =>
    (['none', 'status', 'label'] as const).map((mode) => (
      <button
        key={mode}
        role="menuitemradio"
        class={`overflow-menu-item${groupBy.value === mode ? ' overflow-menu-item-checked' : ''}`}
        aria-checked={groupBy.value === mode}
        onClick={() => handleGroupClick(mode)}
        data-testid={`${prefix}-${mode}`}
      >
        {GROUP_LABELS[mode]}
      </button>
    ));

  const chip = (key: string, label: string, on: boolean, onClick: () => void, testId: string, dot?: string) => (
    <button
      key={key}
      class={`filter-chip${on ? ' filter-chip-active' : ''}`}
      aria-pressed={on ? 'true' : 'false'}
      onClick={onClick}
      data-testid={testId}
    >
      {dot && <span class="filter-chip-dot" style={{ background: dot }} aria-hidden="true" />}
      {label}
    </button>
  );

  return (
    <div class="control-bar" data-testid="control-bar">
      <div class="board-header">
        {/* #625: back to the list of boards */}
        <a
          href={destinationUrl('boards').toString()}
          class="boards-back"
          onClick={(e) => onNavClick(e, 'boards')}
          data-testid="boards-back"
        >
          <span class="boards-back-icon">
            <ChevronLeftIcon />
          </span>
          Boards
        </a>
        {summary && (
          <div class="board-subline" data-testid="board-subline">
            {summary.sharedWith} · {summary.open} open
          </div>
        )}

        <div class={`board-title-row${searchOpen ? ' board-title-row-searching' : ''}`}>
          {board && (
            <>
              <span class="board-title-tile" aria-hidden="true" />
              <h1 class="board-title" data-testid="control-bar-board-name">
                {board.name}
              </h1>
            </>
          )}

          <div class="board-header-actions">
            <div class={`board-search${searchOpen ? ' board-search-open' : ''}`} data-testid="filter-search-wrapper">
              <span class="board-search-icon" aria-hidden="true">
                <SearchIcon />
              </span>
              <input
                ref={searchRef}
                type="text"
                class="filter-search-input"
                placeholder="Search this board"
                aria-label="Search this board"
                value={localSearch}
                onInput={handleSearchInput}
                onKeyDown={handleSearchKeyDown}
                data-testid="filter-search-input"
              />
              {localSearch && (
                <button
                  class="filter-search-clear"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  data-testid="filter-search-clear"
                >
                  &times;
                </button>
              )}
            </div>
            {searchOpen && (
              <button class="btn btn-ghost board-search-cancel" onClick={cancelSearch} data-testid="search-cancel">
                Cancel
              </button>
            )}
            <button
              class="today-round-btn board-search-btn"
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              data-testid="board-search-btn"
            >
              <SearchIcon />
            </button>

            {isOwner && (
              <button
                class="btn btn-ghost board-share-btn"
                onClick={() => {
                  showShareModal.value = true;
                }}
                data-testid="board-share-btn"
              >
                <PeopleIcon />
                Share
              </button>
            )}

            <div class="control-bar-overflow" data-testid="control-bar-overflow">
              <button
                ref={options.btnRef}
                class="btn btn-ghost overflow-menu-btn"
                aria-label="Board options"
                aria-expanded={options.open}
                aria-haspopup="true"
                onClick={() => options.setOpen((prev) => !prev)}
                data-testid="overflow-menu-btn"
              >
                <MoreIcon />
              </button>
              {options.open && (
                <div
                  ref={options.menuRef}
                  role="menu"
                  class="overflow-menu-dropdown"
                  data-testid="overflow-menu-dropdown"
                >
                  <div class="overflow-menu-section-header" role="presentation">
                    Grouping
                  </div>
                  {groupItems('overflow-menu-group')}

                  {isOwner && (
                    <>
                      <hr class="overflow-menu-divider" />
                      <div class="overflow-menu-section-header" role="presentation">
                        Settings
                      </div>
                      <button
                        role="menuitem"
                        class="overflow-menu-item overflow-menu-share"
                        onClick={() => {
                          showShareModal.value = true;
                          options.setOpen(false);
                        }}
                        data-testid="overflow-menu-share"
                      >
                        Share
                      </button>
                      <button
                        role="menuitem"
                        class="overflow-menu-item"
                        onClick={() => {
                          showShareModal.value = true;
                          options.setOpen(false);
                        }}
                        data-testid="overflow-menu-board-settings"
                      >
                        Board Settings
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div class="filter-row" role="group" aria-label="Filters" data-testid="control-bar-filter-content">
        {chip('all', 'All', !anyChip, clearChips, 'filter-all')}
        {(['today', 'this-week'] as const).map((due) =>
          chip(
            due,
            due === 'today' ? 'Due today' : 'This week',
            filterDue.value === due,
            () => {
              filterDue.value = filterDue.value === due ? null : due;
            },
            `filter-due-${due}`,
          ),
        )}
        {labelChips.map((l) =>
          chip(
            `label-${l.label}`,
            l.label,
            filterLabel.value === l.label,
            () => {
              filterLabel.value = filterLabel.value === l.label ? null : l.label;
            },
            `filter-label-${l.label}`,
            l.color,
          ),
        )}
        <div class="filter-group-wrap">
          <button
            ref={groupMenu.btnRef}
            class="filter-chip filter-chip-group-btn"
            aria-haspopup="true"
            aria-expanded={groupMenu.open}
            onClick={() => groupMenu.setOpen((prev) => !prev)}
            data-testid="filter-group-btn"
          >
            Group: {GROUP_CHIP_WORDS[groupBy.value]}
            <span aria-hidden="true"> ▾</span>
          </button>
          {groupMenu.open && (
            <div ref={groupMenu.menuRef} role="menu" class="overflow-menu-dropdown filter-group-menu">
              {groupItems('filter-group')}
            </div>
          )}
        </div>
      </div>

      {/* Live region for screen readers */}
      <div aria-live="polite" class="sr-only" data-testid="filter-live-region">
        {filterOn ? `${filteredCount} cards shown` : ''}
      </div>
    </div>
  );
}
