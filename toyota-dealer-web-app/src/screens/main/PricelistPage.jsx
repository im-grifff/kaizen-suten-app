import { useMemo, useState } from 'react'
import { demoCars, demoContactNumbers, formatIdr } from '../../demo/demoData.js'

function buildSimulationWaUrl({ nomor_sales, namaMobil }) {
  const pesan = `Halo SUTEN, saya ingin SIMULASI KREDIT untuk ${namaMobil}. Mohon info skema dan estimasi cicilan.`
  return `https://wa.me/${encodeURIComponent(nomor_sales)}?text=${encodeURIComponent(
    pesan,
  )}`
}

export function PricelistPage() {
  const waNumbers = demoContactNumbers

  const [selectedId, setSelectedId] = useState(demoCars[0]?.id || '')
  const selectedCar = useMemo(
    () => demoCars.find((c) => c.id === selectedId) || demoCars[0],
    [selectedId],
  )

  return (
    <div className="page">
      <h1 className="h1">Pricelist</h1>
      <p className="muted">
        Daftar model mobil dan OTR akan ditampilkan di sini.
      </p>

      <div className="grid grid--cars">
        {demoCars.map((car) => (
          <button
            key={car.id}
            type="button"
            className={`carCard ${selectedId === car.id ? 'isSelected' : ''}`}
            onClick={() => setSelectedId(car.id)}
          >
            <div className="carCard__img" aria-hidden="true">
              <span className="carCard__imgLabel">{car.imageLabel}</span>
            </div>
            <div className="carCard__name">{car.namaMobil}</div>
            <div className="carCard__otr">
              OTR: <span className="mono">{formatIdr(car.otr)}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row">
          <div>
            <div className="muted small">Pilih mobil</div>
            <div className="h2">{selectedCar?.namaMobil}</div>
          </div>
          <a
            className="btn btn--primary"
            href={buildSimulationWaUrl({
              nomor_sales: waNumbers.nomor_sales || '',
              namaMobil: selectedCar?.namaMobil || '-',
            })}
            target="_blank"
            rel="noreferrer"
          >
            SIMULASI KREDIT
          </a>
        </div>
      </div>
    </div>
  )
}

