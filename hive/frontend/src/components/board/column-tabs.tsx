import { useEffect, useRef } from 'preact/hooks';
import { boardStatuses, columns, selectedColumnIndex } from '../../state/board-store';

/**
 * #626: phone navigation between columns, in place of the dot pager. One tab per
 * column with its count. The columns stay a scroll-snap row: a tap scrolls to the
 * column and a swipe selects its tab.
 */
export function ColumnTabs() {
  const listRef = useRef<HTMLDivElement>(null);
  const cols = boardStatuses.value;
  const selected = Math.max(0, Math.min(selectedColumnIndex.value, cols.length - 1));

  useEffect(() => {
    const main = document.querySelector('.board-main') as HTMLElement | null;
    if (!main) return;
    const onScroll = () => {
      if (main.clientWidth === 0) return;
      const idx = Math.round(main.scrollLeft / main.clientWidth);
      selectedColumnIndex.value = Math.max(0, Math.min(idx, boardStatuses.value.length - 1));
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  // A selected tab off the end of a scrolling list comes into view.
  useEffect(() => {
    const tab = listRef.current?.children[selected] as HTMLElement | undefined;
    tab?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [selected]);

  const select = (idx: number, focus = false) => {
    selectedColumnIndex.value = idx;
    const main = document.querySelector('.board-main') as HTMLElement | null;
    main?.scrollTo?.({ left: idx * main.clientWidth, behavior: 'smooth' });
    if (focus) (listRef.current?.children[idx] as HTMLElement | undefined)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const last = cols.length - 1;
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? last
          : Math.max(0, Math.min(last, selected + (e.key === 'ArrowRight' ? 1 : -1)));
    select(next, true);
  };

  if (cols.length === 0) return null;

  return (
    <div class="column-tabs" role="tablist" aria-label="Columns" ref={listRef} onKeyDown={onKeyDown}>
      {cols.map((col, i) => {
        const on = i === selected;
        return (
          <button
            key={col.name}
            type="button"
            role="tab"
            class={`column-tab${on ? ' column-tab-on' : ''}`}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => select(i)}
            data-testid={`column-tab-${col.name}`}
          >
            <span class="column-tab-name">{col.name}</span>
            <span class="column-tab-count">{(columns.value[col.name] || []).length}</span>
          </button>
        );
      })}
    </div>
  );
}
