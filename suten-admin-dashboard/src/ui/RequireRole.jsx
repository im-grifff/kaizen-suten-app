import { Navigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext.jsx'

export function RequireRole({ allow, children }) {
  const { role, loading } = useAuth()
  if (loading) return <div className="container muted">Loading…</div>
  if (!role) return <Navigate to="/app/not-authorized" replace />
  if (role === 'root') return children
  if (Array.isArray(allow) && allow.includes(role)) return children
  return <Navigate to="/app/not-authorized" replace />
}

