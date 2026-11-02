import { useEffect, useState } from 'preact/hooks';
import { useApi } from '../api/use-api';
import { LogMode } from '../cook/log-mode';
import { isDemoMode } from '../demo/is-demo-mode';
import { DemoBanner } from '../demo/demo-banner';
import { ImportSheet } from '../import/import-sheet';
import { ReviewScreen } from '../import/review-screen';
import { review } from '../import/review-state';
import { addFoodRequested, librarySection } from '../library/foods-store';
import { LibraryScreen } from '../library/library-screen';
import { AccountMenu } from './account-menu';
import { cookRoute, currentTab, syncFromHash } from './routes';
import { TabBar } from './tab-bar';
import { TABS } from './tabs';

/**
 * The signed-in app: the current tab's header and body, and the tab bar. An import's review replaces all three,
 * and so does log mode (#708), a route of its own outside the tabs.
 */
export function Shell() {
  const api = useApi();
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  if (review.value) return <ReviewScreen api={api} />;
  const cook = cookRoute.value;
  if (cook) return <LogMode key={cook.recipeId} api={api} recipeId={cook.recipeId} planId={cook.planId} />;

  const tab = TABS.find((t) => t.id === currentTab.value) ?? TABS[0];
  const empty = (
    <section class="empty-state">
      <span class="empty-state-icon">{tab.icon()}</span>
      <h2>{tab.empty.heading}</h2>
      <p>{tab.empty.sentence}</p>
    </section>
  );

  return (
    <div class="shell">
      <header class="tab-header">
        <h1>{tab.label}</h1>
        <div class="header-actions">
          {tab.id === 'library' && librarySection.value === 'recipes' && (
            <button type="button" class="btn btn-primary" onClick={() => setImporting(true)} data-testid="import-btn">
              Import
            </button>
          )}
          {tab.id === 'library' && librarySection.value === 'foods' && (
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => (addFoodRequested.value = true)}
              data-testid="add-food-btn"
            >
              Add food
            </button>
          )}
          <AccountMenu />
        </div>
      </header>
      {isDemoMode() && <DemoBanner />}
      <main class="tab-content" data-testid={`screen-${tab.id}`}>
        {tab.id === 'library' ? <LibraryScreen api={api} empty={empty} icon={tab.icon} /> : empty}
      </main>
      <TabBar />
      {importing && <ImportSheet api={api} onClose={() => setImporting(false)} />}
    </div>
  );
}
