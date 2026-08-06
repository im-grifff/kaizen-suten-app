import { useState } from 'react'

const toDigits = (raw) => String(raw || '').replace(/\D/g, '')

/**
 * Dialog "WA ke sales": isi nama PIC sales + nomor WhatsApp-nya.
 *
 * Menggantikan `window.prompt` yang lama, yang hanya bisa menampung satu isian
 * sehingga nama PIC tidak pernah bisa ikut dicatat.
 *
 * Nama PIC disimpan ke request supaya tetap terlihat di tab berikutnya, bukan
 * hanya dipakai sekali untuk mengirim pesan.
 */
export function WaSalesModal({ row, onClose, onSubmit }) {
  const [picName, setPicName] = useState(String(row?.picSalesName || ''))
  const [phone, setPhone] = useState(String(row?.picSalesPhone || ''))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const nama = picName.trim()
    const digits = toDigits(phone)
    if (!nama) {
      setErr('Nama PIC sales wajib diisi.')
      return
    }
    if (digits.length < 10) {
      setErr('Nomor WhatsApp sales tidak valid. Contoh: 628123456789')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await onSubmit({ picSalesName: nama, picSalesPhone: digits })
    } catch (e) {
      setErr(e?.message || String(e))
      setBusy(false)
      return
    }
    setBusy(false)
  }

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Kirim info trade-in ke sales"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="modalCard" style={{ width: 'min(100%, 440px)' }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>WA ke sales</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {row?.customerName || 'Customer'} · {row?.plateNumber || row?.plateKey || '-'}
        </div>

        {err ? (
          <div
            className="card"
            style={{
              marginTop: 10,
              padding: 10,
              borderColor: 'rgba(239, 68, 68, 0.5)',
              background: 'rgba(239, 68, 68, 0.12)',
              fontSize: 13,
            }}
          >
            {err}
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              Nama PIC Sales
            </label>
            <input
              className="input"
              autoFocus
              placeholder="mis. Alda Rosaria Sukadi"
              value={picName}
              onChange={(e) => setPicName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              Nomor WhatsApp Sales
            </label>
            <input
              className="input"
              inputMode="numeric"
              placeholder="628123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        </div>

        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Nama PIC akan tersimpan dan tampil di bawah kolom Keterangan pada tab berikutnya.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Batal
          </button>
          <button type="button" className="btn btnPrimary" disabled={busy} onClick={submit}>
            {busy ? 'Menyimpan…' : 'Simpan & Buka WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  )
}
