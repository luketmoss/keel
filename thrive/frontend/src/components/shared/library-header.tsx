import { currentRoute, navigate } from '../../router/router';
import { templates, exercises } from '../../state/store';

const SECTIONS = [
  { name: 'templates', label: 'Templates', path: '/templates' },
  { name: 'exercises', label: 'Exercises', path: '/exercises' },
];

/** "3 templates · 19 exercises", singular for one; '' while nothing is loaded (#638). */
export function libraryMeta(templateCount: number, exerciseCount: number): string {
  if (templateCount === 0 && exerciseCount === 0) return '';
  const t = `${templateCount} template${templateCount === 1 ? '' : 's'}`;
  const e = `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}`;
  return `${t} · ${e}`;
}

/** The Library header (#638): a meta line, the title, and the Templates / Exercises pills (#235). */
export function LibraryHeader() {
  const route = currentRoute.value;
  const meta = libraryMeta(templates.value.length, exercises.value.length);
  return (
    <header class="activities-header library-header">
      {meta && <p class="library-meta">{meta}</p>}
      <h1 class="day-title">Library</h1>
      <nav class="library-pills" aria-label="Library">
        {SECTIONS.map((s) => {
          const current = route.name === s.name;
          return (
            <button
              key={s.name}
              type="button"
              data-focus-key={`library-switch:${s.name}`}
              class={`filter-chip${current ? ' active' : ''}`}
              aria-current={current ? 'page' : undefined}
              onClick={() => navigate(s.path)}
            >
              {s.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
