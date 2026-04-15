import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../state/AuthContext.jsx'

export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()

  if (loading) return <div className="container muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return children
}

