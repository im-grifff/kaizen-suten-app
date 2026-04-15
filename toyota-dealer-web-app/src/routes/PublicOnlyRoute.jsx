import { Navigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext.jsx'

export function PublicOnlyRoute({ children }) {
  const { authReady, sessionRestored, authUser, customerWaKey } = useAuth()

  if (!authReady || !sessionRestored) {
    return <div className="screen muted" style={{ padding: 24 }}>Memuat…</div>
  }
  if (authUser && customerWaKey) return <Navigate to="/app" replace />
  return children
}
