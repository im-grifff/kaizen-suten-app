import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'
import { getDemoUserSnapshot } from '../../demo/demoData.js'

const fallbackBanners = [
  {
    id: 'fb-1',
    title: 'Promo DP Ringan',
    subtitle: 'Bebas pilih tenor, proses cepat',
  },
  {
    id: 'fb-2',
    title: 'Servis Hemat',
    subtitle: 'Cek gratis dan potongan sparepart',
  },
]

export function HomePage() {
  const { customerDisplayName, demoMode, customerWaKey } = useAuth()

  const banners = useMemo(() => {
    if (demoMode && customerWaKey) {
      const snap = getDemoUserSnapshot(customerWaKey, customerDisplayName)
      if (snap.promoBanners?.length) return snap.promoBanners
    }
    return fallbackBanners
  }, [demoMode, customerWaKey, customerDisplayName])

  const namaUser = customerDisplayName || 'User'

  const [slide, setSlide] = useState(0)
  const touchStartX = useRef(null)

  useEffect(() => {
    if (banners.length <= 1) return undefined
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % banners.length)
    }, 4500)
    return () => window.clearInterval(id)
  }, [banners.length])

  function onTouchStart(e) {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null
  }

  function onTouchEnd(e) {
    const start = touchStartX.current
    const end = e.changedTouches[0]?.clientX
    if (start == null || end == null || banners.length <= 1) return
    const dx = end - start
    if (Math.abs(dx) < 48) return
    if (dx < 0) {
      setSlide((s) => (s + 1) % banners.length)
    } else {
      setSlide((s) => (s - 1 + banners.length) % banners.length)
    }
  }

  return (
    <div className="page page--home">
      <section className="homeWelcome">
        <h1 className="homeWelcome__title">
          Selamat Datang, <span className="homeWelcome__name">{namaUser}</span>
        </h1>
      </section>

      <section className="homeLogoBlock" aria-label="SUTEN">
        <div className="brand brand--homeHero">
          <div className="brand__mark">SUTEN</div>
          <div className="brand__text">
            <div className="brand__title">SUTEN</div>
            <div className="brand__subtitle">TOYOTA TENDEAN MANADO</div>
          </div>
        </div>
      </section>

      <section className="homePromo" aria-label="Promo">
        <div className="homePromo__head">
          <h2 className="homePromo__title">Promo</h2>
          <Link to="/app/tshop" className="homePromo__seeAll">
            See All
          </Link>
        </div>

        <div
          className="homeCarousel"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="homeCarousel__track"
            style={{
              transform: `translateX(-${slide * 100}%)`,
            }}
          >
            {banners.map((b, idx) => (
              <div
                key={b.id || idx}
                className={`homeCarousel__slide homeCarousel__slide--${idx % 2 === 0 ? 'a' : 'b'}`}
              >
                <div className="homeCarousel__content">
                  <div className="homeCarousel__tag">PROMO</div>
                  <div className="homeCarousel__slideTitle">{b.title}</div>
                  <div className="homeCarousel__slideSub">{b.subtitle}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {banners.length > 1 ? (
          <div className="homeCarousel__dots" role="tablist" aria-label="Indeks promo">
            {banners.map((b, i) => (
              <button
                key={b.id || `dot-${i}`}
                type="button"
                className={`homeCarousel__dot ${i === slide ? 'isActive' : ''}`}
                onClick={() => setSlide(i)}
                aria-label={`Promo ${i + 1}`}
                aria-selected={i === slide}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
