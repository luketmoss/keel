import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import './Sidebar.css'

/** A landscape phone has no room to give half its height to a panel. */
const SHORT_VIEWPORT = 400

type SidebarProps = {
  children?: ReactNode
  accountRow?: ReactNode
  /** Replaces the default title-row + nav entirely (trip detail's back
      arrow + trip name, per #34) without duplicating the collapsible shell
      or its CSS. Omitted, the sidebar renders exactly as it does on `/`
      and `/trips`. */
  header?: ReactNode
}

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return `sidebar__nav-link${isActive ? ' sidebar__nav-link--active' : ''}`
}

export function Sidebar({ children, accountRow, header }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(
    () => window.innerHeight < SHORT_VIEWPORT,
  )

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar__header">
        {header ?? (
          <>
            <div className="sidebar__title-row">
              <h1 className="sidebar__title">Cairn</h1>
              <button
                type="button"
                className="sidebar__toggle"
                aria-expanded={!collapsed}
                onClick={() => setCollapsed((value) => !value)}
              >
                {collapsed ? 'Show' : 'Hide'}
              </button>
            </div>
            <nav className="sidebar__nav">
              <NavLink to="/" end className={navLinkClassName}>
                Map
              </NavLink>
              <NavLink to="/trips" className={navLinkClassName}>
                Trips
              </NavLink>
            </nav>
          </>
        )}
      </div>
      {accountRow}
      <div className="sidebar__body">{children}</div>
    </aside>
  )
}
