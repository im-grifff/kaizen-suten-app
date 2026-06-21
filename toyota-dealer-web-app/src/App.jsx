import './App.css'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './routes/ProtectedRoute.jsx'
import { PublicOnlyRoute } from './routes/PublicOnlyRoute.jsx'
import { LoginCustomerPage } from './screens/onboarding/LoginCustomerPage.jsx'
import { MainLayout } from './screens/main/MainLayout.jsx'
import { PricelistPage } from './screens/main/PricelistPage.jsx'
import { TradeInPage } from './screens/main/TradeInPage.jsx'
import { TshopPage } from './screens/main/TshopPage.jsx'
import { captureChannelFromLocation } from './utils/channel.js'

/**
 * Menangkap channel (Dealer/OtoXpert) dari URL sedini mungkin, sebelum
 * PublicOnlyRoute sempat me-redirect customer yang sudah login. Channel
 * disimpan ke localStorage agar terbaca saat login & submit trade-in.
 */
function ChannelCapture() {
  const loc = useLocation()
  useEffect(() => {
    captureChannelFromLocation(loc)
  }, [loc.pathname, loc.search])
  return null
}

export default function App() {
  return (
    <>
      <ChannelCapture />
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
        <Route
          path="/access/otoxpert"
          element={
            <PublicOnlyRoute>
              <LoginCustomerPage />
            </PublicOnlyRoute>
          }
        />
        {/* Alias lama (typo) — tetap dukung QR/link yang sudah tersebar */}
        <Route
          path="/access/otoexpert"
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
          <Route index element={<Navigate to="/app/trade-in" replace />} />
          <Route path="pricelist" element={<PricelistPage />} />
          <Route path="trade-in" element={<TradeInPage />} />
          <Route path="tshop" element={<TshopPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/access" replace />} />
      </Routes>
    </>
  )
}
