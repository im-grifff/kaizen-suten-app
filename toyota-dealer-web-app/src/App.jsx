import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './routes/ProtectedRoute.jsx'
import { PublicOnlyRoute } from './routes/PublicOnlyRoute.jsx'
import { LoginPlatePage } from './screens/onboarding/LoginPlatePage.jsx'
import { MainLayout } from './screens/main/MainLayout.jsx'
import { HomePage } from './screens/main/HomePage.jsx'
import { PricelistPage } from './screens/main/PricelistPage.jsx'
import { TradeInPage } from './screens/main/TradeInPage.jsx'
import { TshopPage } from './screens/main/TshopPage.jsx'
import { ProfilePage } from './screens/main/ProfilePage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/access" replace />} />

      <Route
        path="/access"
        element={
          <PublicOnlyRoute>
            <LoginPlatePage />
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
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/access" replace />} />
    </Routes>
  )
}
