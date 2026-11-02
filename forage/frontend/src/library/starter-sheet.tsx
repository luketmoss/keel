import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { StarterFood, StarterResult } from '../api/types';
import { Sheet } from '../ui/sheet';

interface Props {
  api: ForageApi;
  /** "Add the starter list": every selectable row starts ticked. */
  selectAll?: boolean;
  onAdded: (result: StarterResult) => void;
  onClose: () => void;
}

/** "Added 12 foods", "Added 10 foods, filled in 2", "Added Flour". */
export function starterNotice(r: StarterResult): string {
  const added = r.added.length;
  const filled = r.filled.length;
  if (added === 1 && !filled) return `Added ${r.added[0].name}`;
  if (!added && filled === 1) return `Filled in ${r.filled[0].name}`;
  if (!added && !filled) return 'Nothing new to add';
  const parts = [];
  if (added) parts.push(`Added ${added} ${added === 1 ? 'food' : 'foods'}`);
  if (filled) parts.push(`${added ? 'filled' : 'Filled'} in ${filled}`);
  return parts.join(', ');
}

/** The Starter list sheet (#707): about 75 pantry staples, multi-select. */
export function StarterSheet({ api, selectAll, onAdded, onClose }: Props) {
  const [list, setList] = useState<StarterFood[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .getStarterFoods()
      .then((l) => {
        setList(l);
        if (selectAll) setPicked(new Set(l.filter((s) => !s.in_library).map((s) => s.id)));
      })
      .catch(() => setFailed(true));
  }, [api]);

  const query = q.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (s) => !query || [s.name, ...s.aliases].some((n) => n.toLowerCase().includes(query)),
  );
  const selectable = (list ?? []).filter((s) => !s.in_library);

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  async function add() {
    setSaving(true);
    setError(false);
    try {
      onAdded(await api.addStarterFoods([...picked]));
    } catch {
      setSaving(false);
      setError(true);
    }
  }

  return (
    <Sheet title="Starter list" onClose={onClose} tall testId="starter-sheet">
      <label for="starter-search" class="visually-hidden">
        Search the starter list
      </label>
      <input
        id="starter-search"
        class="field"
        type="search"
        placeholder="Search the starter list"
        value={q}
        onInput={(e) => setQ(e.currentTarget.value)}
      />
      {failed && <p role="status">Couldn't load the starter list. Try again.</p>}
      {list && (
        <button
          type="button"
          class="text-btn"
          onClick={() => setPicked(new Set(selectable.map((s) => s.id)))}
          disabled={!selectable.length}
        >
          Select all
        </button>
      )}
      {list && (
        <ul class="card starter-list" aria-label="Starter foods">
          {shown.map((s) => {
            const mine = !!s.in_library;
            const weights = s.servings.map((w) => w.name).join(', ');
            const line = s.can_fill
              ? `Add nutrition to your ${s.name.toLowerCase()}`
              : `${Math.round(s.kcal_100g)} kcal / 100 g${weights ? ` · ${weights}` : ''}`;
            return (
              <li key={s.id}>
                <label class={mine ? 'starter-row is-mine' : 'starter-row'} data-testid="starter-row">
                  <input
                    type="checkbox"
                    disabled={mine}
                    checked={mine || picked.has(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <span class="recipe-text">
                    <span class="recipe-name">{s.name}</span>
                    <span class="recipe-meta">{line}</span>
                  </span>
                  {mine && <span class="hint">In your library</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="status">Couldn't add the starter foods. Try again.</p>}
      <div class="sheet-footer">
        <button
          type="button"
          class="btn btn-primary btn-block"
          disabled={!picked.size || saving}
          onClick={add}
          data-testid="starter-add"
        >
          {saving ? 'Adding…' : `Add ${picked.size} ${picked.size === 1 ? 'food' : 'foods'}`}
        </button>
      </div>
    </Sheet>
  );
}
