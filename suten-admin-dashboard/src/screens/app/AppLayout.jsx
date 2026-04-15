import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `navItem ${isActive ? 'isActive' : ''}`
      }
    >
      {label}
    </NavLink>
  )
}

export function AppLayout() {
  const { role, user, signOut } = useAuth()
  const nav = useNavigate()

  async function onLogout() {
    await signOut()
    nav('/login', { replace: true })
  }

  const isRoot = role === 'root'
  const showCustomers = isRoot || role === 'supervisor' || role === 'aftersales'
  const showPricelist = isRoot || role === 'supervisor'
  const showTshop = isRoot || role === 'aftersales'
  const showTradein = isRoot || role === 'tradein'

  return (
    <div style={{ minHeight: '100svh', display: 'grid', gridTemplateColumns: '260px 1fr' }}>
      <aside
        style={{
          position: 'sticky',
          top: 0,
          height: '100svh',
          padding: 14,
          borderRight: '1px solid var(--border)',
          background: 'rgba(11, 18, 32, 0.72)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>SUTEN Admin</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Role: <span style={{ color: 'var(--text)' }}>{role || '-'}</span>
        </div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {user?.email || user?.uid}
        </div>

        <nav style={{ marginTop: 16, display: 'grid', gap: 6 }}>
          <NavItem to="/app" label="Overview" />
          {showCustomers ? <NavItem to="/app/customers" label="Customers" /> : null}
          {showPricelist ? <NavItem to="/app/pricelist" label="Pricelist" /> : null}
          {showTshop ? <NavItem to="/app/tshop" label="Tshop" /> : null}
          {showTradein ? <NavItem to="/app/tradein-requests" label="Trade In Requests" /> : null}
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>

      <div>
        <div className="container">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

