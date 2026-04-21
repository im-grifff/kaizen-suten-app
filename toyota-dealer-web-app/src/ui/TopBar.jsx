import { useAuth } from '../state/AuthContext.jsx'

export function TopBar() {
  const { customerDisplayName } = useAuth()

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__brand">
          <span className="topbar__mark">SU</span>
          <span className="topbar__name">SUTEN</span>
        </div>
      </div>
      <div className="topbar__right">
        <span className="topbar__meta" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {customerDisplayName || ''}
        </span>
      </div>
    </header>
  )
}
