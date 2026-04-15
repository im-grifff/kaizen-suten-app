import { NavLink } from 'react-router-dom'
import { useAuth } from '../state/AuthContext.jsx'

export function TopBar() {
  const { authUser } = useAuth()

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__brand">
          <span className="topbar__mark">SU</span>
          <span className="topbar__name">SUTEN</span>
        </div>
      </div>
      <div className="topbar__right">
        <span className="topbar__meta mono">
          {authUser?.phoneNumber || ''}
        </span>
        <NavLink
          to="/app/profile"
          className={({ isActive }) =>
            `btn btn--small ${isActive ? 'btn--primary' : 'btn--ghost'}`
          }
        >
          Profile
        </NavLink>
      </div>
    </header>
  )
}

