import { useEffect, useRef } from 'preact/hooks';
import { formatMSS, rangeOf, type RestKind } from '../../api/rest-times';

/** Holding a button repeats every 150 ms after 400 ms (#576). */
export const HOLD_DELAY_MS = 400;
export const HOLD_REPEAT_MS = 150;

interface Props {
  /** Seconds. */
  value: number;
  /** A rest moves by 15 s from 0:15 to 10:00; a switch by 5 s from 0:00 to 2:00. */
  kind: RestKind;
  onChange: (seconds: number) => void;
  /** Both buttons off, as while Settings loads. */
  disabled?: boolean;
}

/**
 * The duration stepper (#576): − button, the value in m:ss, + button. Shared by
 * Settings, the template editor and #577's start screen. A button at its limit
 * is `aria-disabled` and dimmed, and keeps focus; holding one repeats.
 */
export function DurationStepper({ value, kind, onChange, disabled = false }: Props) {
  const { min, max, step } = rangeOf(kind);
  // The latest value and handler, so a held button steps from where it is now.
  const live = useRef({ value, onChange });
  live.current = { value, onChange };
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});
  const pointerStep = useRef(false);

  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
    timers.current = {};
  };
  useEffect(() => stop, []);

  const next = (dir: -1 | 1, from: number) => Math.min(max, Math.max(min, from + dir * step));
  const atLimit = (dir: -1 | 1) => disabled || (dir < 0 ? value <= min : value >= max);

  const press = (dir: -1 | 1) => {
    const from = live.current.value;
    const to = next(dir, from);
    if (to !== from) {
      // Held until the next render replaces it, so two repeats between renders still add up.
      live.current.value = to;
      live.current.onChange(to);
    }
    return to !== next(dir, to);
  };

  const start = (dir: -1 | 1) => {
    if (atLimit(dir)) return;
    stop();
    if (!press(dir)) return;
    timers.current.delay = setTimeout(() => {
      timers.current.repeat = setInterval(() => {
        if (!press(dir)) stop();
      }, HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  const button = (dir: -1 | 1, label: string, glyph: string) => (
    <button
      type="button"
      class="btn-icon duration-stepper-btn"
      aria-label={label}
      aria-disabled={atLimit(dir) ? 'true' : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        pointerStep.current = true;
        start(dir);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        // A pointer press already stepped; a click from the keyboard or a
        // screen reader did not, so it steps once here.
        if (pointerStep.current) {
          pointerStep.current = false;
          return;
        }
        if (!atLimit(dir)) press(dir);
      }}
    >
      {/* In an element, so the shared aria-disabled treatment (#404) dims it and not the ring. */}
      <span aria-hidden="true">{glyph}</span>
    </button>
  );

  return (
    <div class="duration-stepper">
      {button(-1, kind === 'rest' ? 'Less rest' : 'Less switch time', '−')}
      <span class="duration-stepper-value" aria-live="polite">
        {formatMSS(value)}
      </span>
      {button(1, kind === 'rest' ? 'More rest' : 'More switch time', '+')}
    </div>
  );
}
