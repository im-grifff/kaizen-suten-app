import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'

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
  const { userSnapshot, plateNumber } = useAuth()

  const namaUser = userSnapshot?.owner?.namaPemilik || 'User'
  const noPolisi =
    userSnapshot?.vehicle?.noPolisi || userSnapshot?.plateNumber || plateNumber || '-'
  const carPng =
    userSnapshot?.vehicle?.vehicleImageUrl || '/car-home.png'

  const banners = useMemo(() => {
    const list = userSnapshot?.promoBanners
    if (list && list.length > 0) return list
    return fallbackBanners
  }, [userSnapshot?.promoBanners])

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

      <section className="homeVehicle">
        <div className="homeVehicle__frame">
          <img
            src={carPng}
            alt={`Kendaraan ${noPolisi}`}
            className="homeVehicle__img"
            loading="lazy"
          />
        </div>
        <div className="homePlate" aria-label="Nomor polisi">
          <span className="homePlate__inner">{noPolisi}</span>
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
