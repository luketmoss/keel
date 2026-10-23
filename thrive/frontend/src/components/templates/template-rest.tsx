import {
  REST_SECTIONS,
  SWITCH_SECTIONS,
  defaultKeyFor,
  formatMSS,
  type RestKind,
  type RestSettings,
  type SectionRest,
} from '../../api/rest-times';
import { DurationStepper } from '../shared/duration-stepper';
import { sectionTitle } from '../activities/exercise-detail';

/** The rest rows one section shows (#576): none for warm-up and cool-down. */
export function restRowsFor(section: string): { kind: RestKind; label: string }[] {
  if (!REST_SECTIONS.includes(section)) return [];
  if (!SWITCH_SECTIONS.includes(section)) return [{ kind: 'rest', label: 'Rest between sets' }];
  return [
    { kind: 'rest', label: 'Rest after each round' },
    { kind: 'switch', label: 'Switch between exercises' },
  ];
}

const field = (kind: RestKind) => (kind === 'rest' ? 'rest_s' : 'switch_s');

/** The Settings value that applies to a section's rest or switch, in seconds. */
export function defaultSeconds(section: string, kind: RestKind, defaults: RestSettings): number {
  const key = defaultKeyFor(section, kind);
  return key ? defaults[key] : 0;
}

/**
 * The template editor's rest band for one section (#576), under its last
 * exercise. Each row is Default (the cell is blank: "Default (1:30)" and
 * Change) or Set (the stepper, and Use default under it, which blanks it).
 */
export function SectionRestBand({
  section,
  value,
  defaults,
  onChange,
}: {
  section: string;
  value: SectionRest;
  defaults: RestSettings;
  onChange: (next: SectionRest) => void;
}) {
  const rows = restRowsFor(section);
  if (rows.length === 0) return null;
  return (
    <div class="template-rest-band" role="group" aria-label={`${sectionTitle(section)} rest`}>
      {rows.map(({ kind, label }) => {
        const stored = value[field(kind)];
        const def = defaultSeconds(section, kind, defaults);
        const set = (text: string) => onChange({ ...value, [field(kind)]: text });
        return (
          <div class="rest-row" key={kind}>
            <span class="rest-row-label">{label}</span>
            {stored === '' ? (
              <span class="template-rest-default">
                <span>Default ({formatMSS(def)})</span>
                <button
                  type="button"
                  class="btn-ghost rest-link"
                  aria-label={`Change ${label.toLowerCase()}`}
                  onClick={() => set(String(def))}
                >
                  Change
                </button>
              </span>
            ) : (
              <span class="template-rest-set">
                <DurationStepper value={Number(stored)} kind={kind} onChange={(s) => set(String(s))} />
                <button type="button" class="btn-ghost rest-link rest-link-sm" onClick={() => set('')}>
                  Use default
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The read-only template detail's line for one section (#576): "Rest 1:30" or
 * "Rest 0:45 · switch 0:15", each value the template's own, or the default
 * followed by "(default)". Null for a section with no rest.
 */
export function restLine(section: string, value: SectionRest | undefined, defaults: RestSettings): string | null {
  const rows = restRowsFor(section);
  if (rows.length === 0) return null;
  const part = (kind: RestKind) => {
    const own = value?.[field(kind)] ?? '';
    return own !== '' ? formatMSS(Number(own)) : `${formatMSS(defaultSeconds(section, kind, defaults))} (default)`;
  };
  const rest = `Rest ${part('rest')}`;
  return rows.length > 1 ? `${rest} · switch ${part('switch')}` : rest;
}
