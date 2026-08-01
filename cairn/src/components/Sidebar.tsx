import { useState, type ReactNode } from 'react'
import './Sidebar.css'

/** A landscape phone has no room to give half its height to a panel. */
const SHORT_VIEWPORT = 400

type SidebarProps = {
  children?: ReactNode
}

export function Sidebar({ children }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(
    () => window.innerHeight < SHORT_VIEWPORT,
  )

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar__header">
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
      <div className="sidebar__body">{children}</div>
    </aside>
  )
}
