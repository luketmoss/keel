import './RoutePlaceholder.css'

type RoutePlaceholderProps = {
  heading: string
  subtext: string
}

/** Fills the main content region for a route with no real content yet. */
export function RoutePlaceholder({ heading, subtext }: RoutePlaceholderProps) {
  return (
    <div className="route-placeholder">
      <h2 className="route-placeholder__heading">{heading}</h2>
      <p className="route-placeholder__subtext">{subtext}</p>
    </div>
  )
}
