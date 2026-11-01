import { currentTab, tabHash, type TabId } from './routes';
import { TABS } from './tabs';

/**
 * Plain hash links: the browser changes the hash and `hashchange` moves the
 * tab, so back works and the query is kept. Tapping the current tab only
 * scrolls back to the top.
 */
function onTabClick(e: MouseEvent, id: TabId) {
  if (id !== currentTab.value) return;
  e.preventDefault();
  window.scrollTo({ top: 0 });
}

export function TabBar() {
  return (
    <nav class="tab-bar" aria-label="Forage" data-testid="tab-bar">
      <div class="tab-bar-inner">
        {TABS.map((tab) => {
          const active = currentTab.value === tab.id;
          return (
            <a
              key={tab.id}
              href={tabHash(tab.id)}
              class={`tab-bar-tab${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={(e) => onTabClick(e, tab.id)}
              data-testid={`tab-${tab.id}`}
            >
              <span class="tab-bar-icon">{tab.icon()}</span>
              <span class="tab-bar-label">{tab.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
