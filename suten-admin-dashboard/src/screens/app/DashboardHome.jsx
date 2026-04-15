import { Link } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'

export function DashboardHome() {
  const { role } = useAuth()

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>Dashboard</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Choose a module based on your role.
      </div>

      <div style={{ marginTop: 14, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {(role === 'supervisor' || role === 'aftersales') ? (
          <Link className="card" to="/app/customers" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>Customers</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>CRUD all customer data</div>
          </Link>
        ) : null}

        {role === 'supervisor' ? (
          <Link className="card" to="/app/pricelist" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>Pricelist</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>CRUD pricelist</div>
          </Link>
        ) : null}

        {role === 'aftersales' ? (
          <Link className="card" to="/app/tshop" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>Tshop</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>CRUD products / manage orders</div>
          </Link>
        ) : null}

        {role === 'tradein' ? (
          <Link className="card" to="/app/tradein-requests" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>Trade In Requests</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>WhatsApp response workflow</div>
          </Link>
        ) : null}
      </div>
    </div>
  )
}

