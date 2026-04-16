import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './state/AuthContext.jsx'
import { RequireAuth } from './ui/RequireAuth.jsx'
import { RequireRole } from './ui/RequireRole.jsx'
import { LoginPage } from './screens/auth/LoginPage.jsx'
import { AppLayout } from './screens/app/AppLayout.jsx'
import { DashboardHome } from './screens/app/DashboardHome.jsx'
import { CustomersPage } from './screens/app/CustomersPage.jsx'
import { PricelistPage } from './screens/app/PricelistPage.jsx'
import { TshopAdminPage } from './screens/app/TshopAdminPage.jsx'
import { TradeInRequestsPage } from './screens/app/TradeInRequestsPage.jsx'
import { NotAuthorizedPage } from './screens/app/NotAuthorizedPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="not-authorized" element={<NotAuthorizedPage />} />

          <Route
            path="customers"
            element={
              <RequireRole allow={['supervisor', 'aftersales']}>
                <CustomersPage />
              </RequireRole>
            }
          />
          <Route
            path="pricelist"
            element={
              <RequireRole allow={['supervisor']}>
                <PricelistPage />
              </RequireRole>
            }
          />
          <Route
            path="tshop"
            element={
              <RequireRole allow={['aftersales']}>
                <TshopAdminPage />
              </RequireRole>
            }
          />
          <Route
            path="tradein-requests"
            element={
              <RequireRole allow={['tradein', 'supervisor']}>
                <TradeInRequestsPage />
              </RequireRole>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  )
}
