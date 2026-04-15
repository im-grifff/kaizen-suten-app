import { Navigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext.jsx'

export function PublicOnlyRoute({ children }) {
  const { authReady, authUser } = useAuth()

  if (!authReady) return null
  if (authUser) return <Navigate to="/app" replace />
  return children
}

