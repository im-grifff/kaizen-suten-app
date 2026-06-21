import { NavLink } from 'react-router-dom'

const items = [
  { to: '/app/trade-in', label: 'Trade In', primary: true },
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

