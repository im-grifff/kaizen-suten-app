import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './routes/ProtectedRoute.jsx'
import { PublicOnlyRoute } from './routes/PublicOnlyRoute.jsx'
import { LoginCustomerPage } from './screens/onboarding/LoginCustomerPage.jsx'
import { MainLayout } from './screens/main/MainLayout.jsx'
import { HomePage } from './screens/main/HomePage.jsx'
import { PricelistPage } from './screens/main/PricelistPage.jsx'
import { TradeInPage } from './screens/main/TradeInPage.jsx'
import { TshopPage } from './screens/main/TshopPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/access" replace />} />

      <Route
        path="/access"
        element={
          <PublicOnlyRoute>
            <LoginCustomerPage />
          </PublicOnlyRoute>
        }
      />
      <Route path="/login" element={<Navigate to="/access" replace />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="pricelist" element={<PricelistPage />} />
        <Route path="trade-in" element={<TradeInPage />} />
        <Route path="tshop" element={<TshopPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/access" replace />} />
    </Routes>
  )
}
