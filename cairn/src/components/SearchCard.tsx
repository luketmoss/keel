import type { ReactNode } from 'react'
import './SearchCard.css'

interface SearchCardProps {
  /** The detail this card is titling, or `null` on the list face. Its
      presence is what swaps the left slot from the mark to Back and the
      centre slot from the field to a name — the standing document's "Three
      slots, and the first one changes meaning". */
  detail: { name: string; kind: string } | null
  onBack: () => void
  query: string
  onQueryChange: (query: string) => void
  /** #32's account bubble, unchanged apart from where it is mounted. It
      keeps its own popover, states and reconnect flow; only its trigger's
      position moved. */
  accountBubble: ReactNode
}

/** Top of the column. Replaces `TopBar` and the free-floating
    `AccountBubble` together: the identity lives in the mark, the account
    lives in the same card, and there is no navigation bar at all, because
    `World` and `Trips` were never destinations. */
export function SearchCard({ detail, onBack, query, onQueryChange, accountBubble }: SearchCardProps) {
  return (
    <div className="search-card">
      {detail ? (
        <button
          type="button"
          className="search-card__slot search-card__back"
          aria-label="Back to the list"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span>
        </button>
      ) : (
        <span className="search-card__slot search-card__mark" aria-label="Menu" role="img">
          <img src={`${import.meta.env.BASE_URL}cairn-mark.svg`} alt="" aria-hidden="true" />
        </span>
      )}

      {detail ? (
        <span className="search-card__title">
          <span className="search-card__name" title={detail.name}>
            {detail.name}
          </span>
          <span className="search-card__kind">{detail.kind}</span>
        </span>
      ) : (
        <input
          type="search"
          className="search-card__field"
          /* Worded for what it becomes in #110 rather than renamed twice —
             it narrows the loaded list by name today. `cairns.md`'s
             "Search placeholder becomes 'Search trips, tracks and
             cairns'" — #169's rename, since "photos" is no longer a
             kind. */
          placeholder="Search trips, tracks and cairns"
          aria-label="Search trips, tracks and cairns"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      )}

      <span className="search-card__slot search-card__account">{accountBubble}</span>
    </div>
  )
}
