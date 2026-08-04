import './TripNotFound.css'

/** Centred in place of the whole detail view when `:id` matches no trip —
    deleted, or never existed. The back control is the only way out, since
    nothing else on this page has anything to show. Its destination is
    `TripDetail`'s own conditional back logic (#78), not a fixed link. */
export function TripNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="trip-not-found">
      <p className="trip-not-found__title">Trip not found</p>
      <p className="trip-not-found__detail">
        It may have been deleted.{' '}
        <button type="button" className="trip-not-found__link" onClick={onBack}>
          ← Back
        </button>
      </p>
    </div>
  )
}
