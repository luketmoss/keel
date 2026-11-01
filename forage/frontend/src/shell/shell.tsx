import { useEffect } from 'preact/hooks';
import { isDemoMode } from '../demo/is-demo-mode';
import { DemoBanner } from '../demo/demo-banner';
import { AccountMenu } from './account-menu';
import { currentTab, syncFromHash } from './routes';
import { TabBar } from './tab-bar';
import { TABS } from './tabs';

/** The signed-in app: the current tab's header and body, and the tab bar. */
export function Shell() {
  useEffect(() => {
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const tab = TABS.find((t) => t.id === currentTab.value) ?? TABS[0];

  return (
    <div class="shell">
      <header class="tab-header">
        <h1>{tab.label}</h1>
        <AccountMenu />
      </header>
      {isDemoMode() && <DemoBanner />}
      <main class="tab-content" data-testid={`screen-${tab.id}`}>
        <section class="empty-state">
          <span class="empty-state-icon">{tab.icon()}</span>
          <h2>{tab.empty.heading}</h2>
          <p>{tab.empty.sentence}</p>
        </section>
      </main>
      <TabBar />
    </div>
  );
}
