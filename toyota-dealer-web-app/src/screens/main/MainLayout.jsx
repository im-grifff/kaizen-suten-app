import { Outlet } from 'react-router-dom'
import { CartProvider } from '../../state/CartContext.jsx'
import { BottomNav } from '../../ui/BottomNav.jsx'
import { TopBar } from '../../ui/TopBar.jsx'

export function MainLayout() {
  return (
    <CartProvider>
      <div className="appShell">
        <TopBar />
        <main className="appMain">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </CartProvider>
  )
}

