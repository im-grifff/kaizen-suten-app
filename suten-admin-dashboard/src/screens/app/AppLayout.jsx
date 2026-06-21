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
  const { role, user, signOut, loading } = useAuth()
  const nav = useNavigate()

  async function onLogout() {
    await signOut()
    nav('/login', { replace: true })
  }

  /** Login sukses tapi belum ada custom claim `role` di Firebase Auth → menu & dashboard kosong. */
  if (!loading && user && role == null) {
    return (
      <div className="container" style={{ minHeight: '100svh', padding: '32px 16px', maxWidth: 640, margin: '0 auto' }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Akun belum punya role admin</div>
          <p className="muted" style={{ marginTop: 12, lineHeight: 1.55 }}>
            Email Anda sudah terdaftar di Firebase Authentication, tetapi token belum memiliki{' '}
            <strong>custom claim</strong> <code>role</code> (nilai yang didukung:{' '}
            <code>root</code>, <code>supervisor</code>, <code>aftersales</code>, <code>tradein</code>).
          </p>
          <p className="muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
            Minta pemilik project menjalankan script set claim (dari folder <code>suten-admin-dashboard</code>), contoh:
          </p>
          <pre
            className="mono"
            style={{
              marginTop: 10,
              padding: 12,
              fontSize: 11,
              overflow: 'auto',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border)',
            }}
          >
            {`node tools/set-claims.mjs --serviceAccount ".\\\\serviceAccount.json" --email "${user?.email || 'email@anda.com'}" --role supervisor`}
          </pre>
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Setelah claim diset, klik <strong>Logout</strong> lalu login lagi (atau tunggu beberapa detik dan refresh).
          </p>
          <button type="button" className="btn btnPrimary" style={{ marginTop: 16 }} onClick={() => void onLogout()}>
            Logout
          </button>
        </div>
      </div>
    )
  }

  const isRoot = role === 'root'
  const isOtoxpert = role === 'otoxpert'
  const showOverview = !isOtoxpert
  const showCustomers = isRoot || isOtoxpert || role === 'supervisor' || role === 'aftersales'
  const showPricelist = isRoot || role === 'supervisor'
  const showTshop = isRoot || role === 'aftersales'
  const showTradein = isRoot || isOtoxpert || role === 'tradein' || role === 'supervisor'

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
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/logo.png"
            alt="SUTEN"
            style={{ height: 36, width: 36, objectFit: 'cover', borderRadius: 10, display: 'block' }}
          />
          <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>SUTEN Admin</div>
        </div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Role: <span style={{ color: 'var(--text)' }}>{role || '-'}</span>
        </div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {user?.email || user?.uid}
        </div>

        <nav style={{ marginTop: 16, display: 'grid', gap: 6 }}>
          {showOverview ? <NavItem to="/app" label="Overview" /> : null}
          {showCustomers ? <NavItem to="/app/customers" label="Customers" /> : null}
          {showPricelist ? <NavItem to="/app/pricelist" label="Pricelist" /> : null}
          {showTshop ? <NavItem to="/app/tshop" label="Tshop" /> : null}
          {showTradein ? <NavItem to="/app/tradein-requests" label="Trade In Requests" /> : null}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button className="btn" style={{ width: '100%' }} onClick={onLogout}>
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

