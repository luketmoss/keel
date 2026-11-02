import { starsLabel, starsText } from './format';

/** `★★★★☆` with its label, or "Not rated" in muted text. */
export function Stars({ rating }: { rating: number | null }) {
  if (typeof rating !== 'number') return <span class="not-rated">Not rated</span>;
  return (
    <span class="stars" role="img" aria-label={starsLabel(rating)}>
      {starsText(rating)}
    </span>
  );
}

interface StarButtonsProps {
  rating: number | null;
  onRate: (rating: number) => void;
  /** The group's name for a screen reader. */
  label: string;
  disabled?: boolean;
}

/** Five 44px star buttons as a radio group: "1 star" to "5 stars". */
export function StarButtons({ rating, onRate, label, disabled }: StarButtonsProps) {
  return (
    <div class="star-buttons" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          class="star-btn"
          aria-checked={rating === n}
          aria-label={n === 1 ? '1 star' : `${n} stars`}
          data-filled={rating !== null && n <= rating}
          disabled={disabled}
          onClick={() => onRate(n)}
        >
          {rating !== null && n <= rating ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}
