import { useAuth } from '../state/AuthContext.jsx'

export function TopBar() {
  const { customerDisplayName, logout } = useAuth()

  return (
    <header className="topbar">
      <div className="topbar__left" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          className="topbar__meta"
          style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}
        >
          {customerDisplayName || 'Customer'}
        </span>
        <button
          type="button"
          className="btn"
          style={{ padding: '6px 12px', fontSize: 12 }}
          onClick={() => void logout()}
          aria-label="Keluar"
        >
          Keluar
        </button>
      </div>
      <div className="topbar__right">
        <div className="topbar__brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src="/logo.png"
            alt="SUTEN"
            style={{ height: 32, width: 32, objectFit: 'cover', borderRadius: 8, display: 'block' }}
          />
          <span className="topbar__name">SUTEN</span>
        </div>
      </div>
    </header>
  )
}
