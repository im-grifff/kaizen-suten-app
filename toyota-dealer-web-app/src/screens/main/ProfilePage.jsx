import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'

function buildCrWaUrl({ waNumber, plate }) {
  const cleaned = String(waNumber || '').replace(/[^\d]/g, '')
  const msg = `Halo, Saya ingin mendaftarkan kendaraan saya dengan nomor Polisi ${plate} di Suten`
  return `https://wa.me/${encodeURIComponent(cleaned)}?text=${encodeURIComponent(msg)}`
}

export function ProfilePage() {
  const nav = useNavigate()
  const { userSnapshot, logout, plateNumber, unregisteredPlate } = useAuth()
  const plateDisplay =
    userSnapshot?.vehicle?.noPolisi || userSnapshot?.plateNumber || plateNumber || '-'
  const owner = userSnapshot?.owner
  const vehicle = userSnapshot?.vehicle

  async function onLogout() {
    await logout()
    nav('/access', { replace: true })
  }

  const crNumber = import.meta.env.VITE_CR_WA_NUMBER || '6285712345678'

  return (
    <div className="page page--profile">
      <h1 className="h1">Profile</h1>
      <p className="muted">Detail unit kendaraan dan pemilik.</p>

      {unregisteredPlate ? (
        <div className="card" style={{ marginTop: 12, padding: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            Kendaraan anda belum terdaftar, harap segera menghubungi Customer Relation untuk mendaftarkan kendaraan anda 😁🙏
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Nomor polisi: <span className="mono">{plateNumber || '-'}</span>
          </div>
          <a
            className="btn btn--primary"
            style={{ marginTop: 14, width: '100%', textAlign: 'center' }}
            href={buildCrWaUrl({ waNumber: crNumber, plate: plateNumber || '-' })}
            target="_blank"
            rel="noreferrer"
          >
            Daftarkan
          </a>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="infoList">
          <div className="infoRow">
            <div className="infoRow__k">Model Mobil</div>
            <div className="infoRow__v">{vehicle?.model || vehicle?.modelMobil || '-'}</div>
          </div>
          <div className="infoRow">
            <div className="infoRow__k">No. Polisi</div>
            <div className="infoRow__v">{plateDisplay}</div>
          </div>
          <div className="infoRow">
            <div className="infoRow__k">No. Mesin</div>
            <div className="infoRow__v">{vehicle?.noMesin || '-'}</div>
          </div>
          <div className="infoRow">
            <div className="infoRow__k">No. Rangka</div>
            <div className="infoRow__v">{vehicle?.noRangka || '-'}</div>
          </div>
          <div className="infoRow">
            <div className="infoRow__k">WhatsApp</div>
            <div className="infoRow__v">{userSnapshot?.waPhone || '-'}</div>
          </div>
          <div className="infoRow">
            <div className="infoRow__k">Nama Pemilik</div>
            <div className="infoRow__v">{owner?.namaPemilik || '-'}</div>
          </div>
          <div className="infoRow">
            <div className="infoRow__k">Alamat</div>
            <div className="infoRow__v">{owner?.alamat || '-'}</div>
          </div>
        </div>
      </div>

      <div className="profileLogout">
        <button
          type="button"
          className="btn btn--danger"
          style={{ width: '100%' }}
          onClick={onLogout}
        >
          Logout
        </button>
      </div>
    </div>
  )
}
