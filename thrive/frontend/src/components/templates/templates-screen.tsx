import { templates, workouts, activeWorkoutId } from '../../state/store';
import { navigate } from '../../router/router';
import { currentRoute } from '../../router/router';
import { TemplateEditor } from './template-editor';
import { TemplateDetail } from './template-detail';
import { LibraryHeader } from '../shared/library-header';
import { DumbbellIcon } from '../shared/icons';
import {
  TemplateSummary,
  lastDone,
  lastDoneByTemplate,
  lastTook,
  orderTemplates,
  templateAriaLabel,
  templateStats,
} from './template-summary';

function ChevronRight() {
  return (
    <svg
      class="tpl-chevron"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function TemplateList() {
  const last = lastDoneByTemplate(workouts.value, activeWorkoutId.value);
  const ordered = orderTemplates(templates.value, last);
  return (
    <div class="screen templates-screen">
      <LibraryHeader />
      <div class="screen-body">
        {ordered.length === 0 ? (
          <p class="library-empty">No templates yet. Tap + to build one.</p>
        ) : (
          <div class="template-list">
            {ordered.map((t) => {
              const stats = templateStats(t);
              const w = last.get(t.id);
              const took = lastTook(w);
              const done = lastDone(w);
              return (
                <button
                  type="button"
                  key={t.id}
                  data-focus-key={`template:${t.id}`}
                  class="template-card template-card-lib"
                  aria-label={templateAriaLabel(t.name, stats, took, done)}
                  onClick={() => navigate(`/templates/${t.id}`)}
                >
                  <span class="tpl-name-row">
                    <span class="tpl-name-icon" aria-hidden="true">
                      <DumbbellIcon />
                    </span>
                    <span class="tpl-name">{t.name}</span>
                  </span>
                  <TemplateSummary stats={stats} took={took} />
                  <span class="tpl-footer">
                    <span class="tpl-last-done">{done.text}</span>
                    <span class="tpl-view">
                      View
                      <ChevronRight />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button class="fab" onClick={() => navigate('/templates/new')} aria-label="New template">
        +
      </button>
    </div>
  );
}

export function TemplatesScreen() {
  const route = currentRoute.value;

  switch (route.name) {
    case 'template-new':
      return <TemplateEditor />;
    case 'template-edit':
      return <TemplateEditor templateId={route.params.id} />;
    case 'template-detail':
      return <TemplateDetail templateId={route.params.id} />;
    default:
      return <TemplateList />;
  }
}
