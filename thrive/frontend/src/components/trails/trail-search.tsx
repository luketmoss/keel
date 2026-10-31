// Activities' trail search (#682): the field, and the results that take the
// list's place while a search is active. It finds trails, across every month.

import { useRef } from 'preact/hooks';
import { navigate } from '../../router/router';
import { trailIndex, trailQuery } from '../../state/trails';
import { trailPath } from '../../trails/groups';
import { formatTrailDate, plural } from '../../trails/format';
import { searchTerm, searchTrails } from '../../trails/search';
import { toLocalDateStr } from '../activities/activities-helpers';
import { ChevronRightIcon, CloseIcon } from '../activities/detail-icons';

/** True while the field holds a search: text that is not blank once trimmed. */
export function trailSearchActive(): boolean {
  return trailIndex.value !== null && searchTerm(trailQuery.value) !== null;
}

export function TrailSearchField() {
  const input = useRef<HTMLInputElement>(null);
  if (!trailIndex.value) return null;
  const clear = () => {
    trailQuery.value = '';
    input.current?.focus();
  };
  return (
    <div class="ex-search trail-search">
      <svg
        class="ex-search-icon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        ref={input}
        class="form-input search-input"
        type="search"
        placeholder="Search trails"
        aria-label="Search trails"
        value={trailQuery.value}
        onInput={(e) => {
          trailQuery.value = (e.target as HTMLInputElement).value;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && trailQuery.value) {
            e.preventDefault();
            trailQuery.value = '';
          }
        }}
      />
      {trailQuery.value && (
        <button type="button" class="detail-icon-btn trail-search-clear" aria-label="Clear search" onClick={clear}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

export function TrailResults() {
  const index = trailIndex.value;
  const found = index ? searchTrails(index.groups.values(), trailQuery.value) : null;
  if (!found) return null;
  const today = toLocalDateStr(new Date());
  const term = searchTerm(trailQuery.value);
  return (
    <section class="trail-results" aria-labelledby="trail-results-title">
      <div class="trail-section-header">
        <h2 id="trail-results-title" class="trail-section-title">
          Trails
        </h2>
        <span class="trail-card-aside">{found.length} found</span>
      </div>
      {found.length === 0 ? (
        <p class="trail-no-match">No trails match “{term}”</p>
      ) : (
        <div class="trail-result-list">
          {found.map((group) => {
            const last = group.visits[group.visits.length - 1];
            const meta = `${plural(group.visits.length, 'time', 'times')} · last ${formatTrailDate(last.date, today)}`;
            return (
              <button
                key={group.key}
                type="button"
                class="trail-link trail-result"
                data-focus-key={`trail:${group.key}`}
                aria-label={`${group.name}, ${meta}. Open trail`}
                onClick={() => navigate(trailPath(group.key))}
              >
                <span class="trail-link-text">
                  <span class="trail-link-name">{group.name}</span>
                  <span class="trail-link-meta">{meta}</span>
                </span>
                <ChevronRightIcon />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
