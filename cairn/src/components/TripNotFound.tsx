import { Link } from 'react-router-dom'
import './TripNotFound.css'

/** Centred in place of the whole detail view when `:id` matches no trip —
    deleted, or never existed. The back link is the only way out, since
    nothing else on this page has anything to show. */
export function TripNotFound() {
  return (
    <div className="trip-not-found">
      <p className="trip-not-found__title">Trip not found</p>
      <p className="trip-not-found__detail">
        It may have been deleted.{' '}
        <Link to="/trips" className="trip-not-found__link">
          ← Back to trips
        </Link>
      </p>
    </div>
  )
}
