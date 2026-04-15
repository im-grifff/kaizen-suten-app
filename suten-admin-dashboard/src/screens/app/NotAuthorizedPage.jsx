import { useAuth } from '../../state/AuthContext.jsx'

export function NotAuthorizedPage() {
  const { role } = useAuth()
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Not authorized</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Your account does not have access to this module.
      </div>
      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        Current role: <span style={{ color: 'var(--text)' }}>{role || 'none'}</span>
      </div>
    </div>
  )
}

