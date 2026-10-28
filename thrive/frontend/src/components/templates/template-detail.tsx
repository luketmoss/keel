import { useEffect, useState } from 'preact/hooks';
import { sectionRestOf } from '../../api/rest-times';
import { loadRestSettings, restSettings } from '../../state/rest-settings';
import { restLine } from './template-rest';
import { templates, workouts, activeWorkoutId, showToast } from '../../state/store';
import { removeTemplate, startWorkout } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { navigate } from '../../router/router';
import { DetailTopBar } from '../activities/detail-top-bar';
import { sectionTitle } from '../activities/exercise-detail';
import { StopwatchIcon } from '../shared/icons';
import { TemplateSummary, lastDone, lastDoneByTemplate, lastTook, templateStats } from './template-summary';
import { ask } from '../../state/confirm';
import { deleteTemplateCopy } from '../shared/confirm-copy';

interface Props {
  templateId: string;
}

/** A row's prescription (#639): "5 × 4–6", "3 sets" when reps are blank, "1 set", or "8 reps" with no sets. */
export function prescription(sets: string, reps: string): string {
  if (sets && reps) return `${sets} × ${reps}`;
  if (sets) return sets.trim() === '1' ? '1 set' : `${sets} sets`;
  return reps ? `${reps} reps` : '';
}

export function TemplateDetail({ templateId }: Props) {
  const { token } = useAuth();
  const tpl = templates.value.find((t) => t.id === templateId);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (token) void loadRestSettings(token);
  }, [token]);

  if (!tpl) {
    return (
      <div class="screen">
        <div class="empty-state">
          <p class="template-detail-missing">Template not found</p>
          <button class="btn btn-secondary" onClick={() => navigate('/templates')}>
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!token) return;
    if (!(await ask(deleteTemplateCopy(tpl.name, tpl.exercises.length)))) return;
    setDeleting(true);
    try {
      await removeTemplate(templateId, tpl.exercises, token);
      navigate('/templates');
    } catch {
      // Error toast shown by action
    } finally {
      setDeleting(false);
    }
  };

  const handleStartWorkout = async () => {
    if (!token || starting) return;
    if (activeWorkoutId.value) {
      showToast('Finish your current workout before starting a new one', 'error');
      return;
    }
    setStarting(true);
    try {
      const id = await startWorkout({ type: 'weight', name: tpl.name, template_id: tpl.id }, token);
      navigate(`/workout/${id}`);
    } catch {
      // Error toast shown by action
    } finally {
      setStarting(false);
    }
  };

  // #576: one rest line at the foot of each section's card.
  const rest = sectionRestOf(tpl.exercises);
  const defaults = restSettings.value;

  // #639: sections in the order they first appear, one card each.
  const cards: { section: string; rows: typeof tpl.exercises }[] = [];
  for (const ex of tpl.exercises) {
    const section = String(ex.section);
    let card = cards.find((c) => c.section === section);
    if (!card) cards.push((card = { section, rows: [] }));
    card.rows.push(ex);
  }

  // #638's words: "Template · last done Thu, Oct 22", lower case after the dot.
  const last = lastDoneByTemplate(workouts.value, activeWorkoutId.value).get(tpl.id);
  const done = lastDone(last).text;
  const stats = templateStats(tpl);

  return (
    <div class="screen workout-detail-screen template-detail-screen">
      <DetailTopBar
        deleting={deleting}
        onBack={() => navigate('/templates')}
        onEdit={() => navigate(`/templates/${templateId}/edit`)}
        onDelete={handleDelete}
        editLabel="Edit template"
        editFocusKey="template-edit"
        deleteLabel="Delete template"
      />

      <div class="detail-sheet">
        <div class="template-detail-title">
          <p class="detail-date-line">{`Template · ${done.charAt(0).toLowerCase()}${done.slice(1)}`}</p>
          <h1 class="detail-title">{tpl.name}</h1>
        </div>

        <section class="detail-stats-card">
          <TemplateSummary stats={stats} took={lastTook(last)} />
        </section>

        {cards.map((card) => {
          const line = restLine(card.section, rest[card.section], defaults);
          return (
            <section class="strength-section-card" key={card.section}>
              <h2 class="strength-section-heading">{sectionTitle(card.section)}</h2>
              {card.rows.map((ex, i) => (
                <div class="template-detail-row" key={`${ex.exercise_id}-${i}`}>
                  <span class="template-detail-name">{ex.exercise_name}</span>
                  <span class="template-detail-rx">{prescription(ex.sets, ex.reps)}</span>
                </div>
              ))}
              {line && (
                <p class="template-rest-line">
                  <StopwatchIcon />
                  <span>{line}</span>
                </p>
              )}
            </section>
          );
        })}
      </div>

      <div class="template-detail-footer">
        <button class="btn btn-primary" onClick={handleStartWorkout} disabled={starting || deleting}>
          {starting ? 'Starting...' : 'Start workout'}
        </button>
      </div>
    </div>
  );
}
