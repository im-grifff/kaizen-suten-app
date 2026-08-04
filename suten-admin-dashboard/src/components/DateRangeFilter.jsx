import { DATE_PRESETS, presetRange } from '../utils/dateRange.js'

/**
 * Filter rentang tanggal + tombol export.
 *
 * Dipakai bersama oleh halaman Trade-In Requests dan Customers supaya
 * perilakunya sama persis di kedua tempat.
 *
 * `count` sengaja ditampilkan di sini: setelah menyaring, hal pertama yang
 * ingin diketahui biasanya "jadi berapa datanya".
 */
export function DateRangeFilter({ from, to, onChange, count, onExport, exportDisabled }) {
  const active = Boolean(from || to)

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'flex-end',
        marginTop: 10,
      }}
    >
      <div>
        <label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
          Dari tanggal
        </label>
        <input
          className="input"
          type="date"
          style={{ width: 150 }}
          value={from}
          max={to || undefined}
          onChange={(e) => onChange({ from: e.target.value, to })}
        />
      </div>
      <div>
        <label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
          Sampai tanggal
        </label>
        <input
          className="input"
          type="date"
          style={{ width: 150 }}
          value={to}
          min={from || undefined}
          onChange={(e) => onChange({ from, to: e.target.value })}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn"
            style={{ fontSize: 11, padding: '6px 10px' }}
            onClick={() => onChange(presetRange(p.id))}
          >
            {p.label}
          </button>
        ))}
        {active ? (
          <button
            type="button"
            className="btn"
            style={{ fontSize: 11, padding: '6px 10px' }}
            onClick={() => onChange({ from: '', to: '' })}
          >
            ✕ Reset
          </button>
        ) : null}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          <strong style={{ color: 'var(--text)' }}>{count}</strong> data
        </span>
        {onExport ? (
          <button
            type="button"
            className="btn"
            disabled={exportDisabled}
            title="Export sesuai filter & pencarian yang sedang aktif"
            onClick={onExport}
          >
            ⬇ Export Excel
          </button>
        ) : null}
      </div>
    </div>
  )
}
