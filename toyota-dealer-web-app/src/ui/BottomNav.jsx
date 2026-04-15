import { NavLink } from 'react-router-dom'

const items = [
  { to: '/app', label: 'Home', end: true },
  { to: '/app/pricelist', label: 'Pricelist' },
  { to: '/app/trade-in', label: 'Trade In', primary: true },
  { to: '/app/tshop', label: 'Tshop' },
  { to: '/app/profile', label: 'Profile' },
]

export function BottomNav() {
  return (
    <nav className="bottomNav" aria-label="Main navigation">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) =>
            `bottomNav__item ${it.primary ? 'bottomNav__item--primary' : ''} ${isActive ? 'isActive' : ''}`
          }
        >
          <span className="bottomNav__label">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

