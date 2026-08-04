import { NavLink } from 'react-router-dom'
import './TopBar.css'

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return `top-bar__link${isActive ? ' top-bar__link--active' : ''}`
}

/** Floating L2 panel over the map, replacing the sidebar's header+nav
    (#78). `World` matches `/` exactly; `Trips` matches `/trips` and
    anything under it, so a trip's detail view still lights `Trips`. */
export function TopBar() {
  return (
    <nav className="top-bar" aria-label="Primary">
      <span className="top-bar__wordmark">Cairn</span>
      <NavLink to="/" end className={navLinkClassName}>
        World
      </NavLink>
      <NavLink to="/trips" className={navLinkClassName}>
        Trips
      </NavLink>
    </nav>
  )
}
