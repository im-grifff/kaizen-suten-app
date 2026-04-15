import { useEffect, useMemo, useState } from 'react'
import { createUserDoc, deleteUser, listenUsers, updateUser } from '../../firestore/usersAdmin.js'
import { TOYOTA_MODELS } from '../../data/toyotaModels.js'
import { getTypesForModel } from '../../firestore/modelTypes.js'
import { normalizePlate } from '../../utils/plateFormat.js'

export function CustomersPage() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const searchPlate = useMemo(() => normalizePlate(search), [search])

  useEffect(() => {
    setErr('')
    const unsub = listenUsers({
      searchPlate,
      onData: (r) => setRows(r),
      onError: (e) => setErr(e?.message || 'Failed to load users'),
    })
    return () => unsub?.()
  }, [searchPlate])

  const form = selected || {}
  const owner = form.owner || {}
  const vehicle = form.vehicle || {}

  const isCreate = Boolean(createOpen && !selected)
  const [createForm, setCreateForm] = useState({
    plateNumber: '',
    owner: { namaPemilik: '', alamat: '' },
    waPhone: '',
    vehicle: {
      model: '',
      type: '',
      year: '',
      color: '',
      noMesin: '',
      noRangka: '',
      noPolisi: '',
    },
  })

  const activeForm = isCreate ? createForm : form
  const activeOwner = activeForm.owner || {}
  const activeVehicle = activeForm.vehicle || {}

  const years = useMemo(() => {
    const now = new Date().getFullYear()
    const out = []
    for (let y = now; y >= 1990; y -= 1) out.push(String(y))
    return out
  }, [])

  const typeOptions = useMemo(
    () => ['', 'AT', 'MT', 'CVT', 'HV CVT'],
    [],
  )

  const colorOptions = useMemo(
    () => ['', 'WHITE', 'BLACK', 'SILVER', 'GRAY', 'RED', 'BLUE', 'BRONZE', 'BROWN', 'GREEN', 'YELLOW', 'ORANGE'],
    [],
  )

  async function onSave() {
    if (!selected?.id) return
    setSaveErr('')
    setSaving(true)
    try {
      await updateUser(selected.id, {
        plateNumber: normalizePlate(form.plateNumber || ''),
        owner: { namaPemilik: String(owner.namaPemilik || ''), alamat: String(owner.alamat || '') },
        waPhone: String(form.waPhone || '').trim(),
        vehicle: {
          model: String(vehicle.model || ''),
          type: String(vehicle.type || ''),
          year: String(vehicle.year || ''),
          color: String(vehicle.color || ''),
          noMesin: String(vehicle.noMesin || ''),
          noRangka: String(vehicle.noRangka || ''),
          noPolisi: normalizePlate(vehicle.noPolisi || form.plateNumber || ''),
          modelMobil: String(vehicle.model || vehicle.modelMobil || ''),
          vehicleImageUrl: String(vehicle.vehicleImageUrl || ''),
        },
      })
      setSelected(null)
    } finally {
      setSaving(false)
    }
  }

  async function onCreate() {
    setSaving(true)
    try {
      const plate = normalizePlate(createForm.plateNumber || '')
      await createUserDoc({
        plateNumber: plate,
        waPhone: String(createForm.waPhone || '').trim(),
        owner: {
          namaPemilik: String(createForm.owner?.namaPemilik || ''),
          alamat: String(createForm.owner?.alamat || ''),
        },
        vehicle: {
          model: String(createForm.vehicle?.model || ''),
          type: String(createForm.vehicle?.type || ''),
          year: String(createForm.vehicle?.year || ''),
          color: String(createForm.vehicle?.color || ''),
          noMesin: String(createForm.vehicle?.noMesin || ''),
          noRangka: String(createForm.vehicle?.noRangka || ''),
          noPolisi: normalizePlate(createForm.vehicle?.noPolisi || plate),
          modelMobil: String(createForm.vehicle?.model || ''),
          noMesinLegacy: String(createForm.vehicle?.noMesin || ''),
        },
      })
      setCreateOpen(false)
      setCreateForm({
        plateNumber: '',
        owner: { namaPemilik: '', alamat: '' },
        waPhone: '',
        vehicle: { model: '', type: '', year: '', color: '', noMesin: '', noRangka: '', noPolisi: '' },
      })
    } catch (e) {
      setSaveErr(e?.message || 'Gagal membuat pelanggan.')
    } finally {
      setSaving(false)
    }
  }

  const [dynamicTypes, setDynamicTypes] = useState([])
  const [typeMode, setTypeMode] = useState('select') // 'select' | 'custom'
  const [customType, setCustomType] = useState('')

  const currentModel = useMemo(() => String(activeVehicle.model || '').trim(), [activeVehicle.model])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!currentModel) {
        setDynamicTypes([])
        return
      }
      try {
        const types = await getTypesForModel(currentModel)
        if (!cancelled) setDynamicTypes(types)
      } catch {
        if (!cancelled) setDynamicTypes([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentModel])

  const resolvedTypeOptions = useMemo(() => {
    const base = dynamicTypes.length > 0 ? [''].concat(dynamicTypes) : typeOptions
    const unique = Array.from(new Set(base.filter((x) => typeof x === 'string')))
    return unique
  }, [dynamicTypes, typeOptions])

  useEffect(() => {
    const t = String(activeVehicle.type || '').trim()
    if (!t) {
      setTypeMode('select')
      setCustomType('')
      return
    }
    const inList = resolvedTypeOptions.includes(t)
    if (inList) {
      setTypeMode('select')
      setCustomType('')
    } else {
      setTypeMode('custom')
      setCustomType(t)
    }
  }, [activeVehicle.type, resolvedTypeOptions])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Customers</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Manage customer profiles stored in Firestore `users/{'{uid}'}`.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 320, maxWidth: '100%' }}>
            <input
              className="input"
              placeholder="Cari plat (tanpa spasi), contoh DB1234GL"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className="btn btnPrimary"
            type="button"
            onClick={() => {
              setSaveErr('')
              setCreateOpen(true)
            }}
          >
            + Add new customer
          </button>
        </div>
      </div>

      {err ? (
        <div
          className="card"
          style={{
            marginTop: 12,
            padding: 12,
            borderColor: 'rgba(239, 68, 68, 0.5)',
            background: 'rgba(239, 68, 68, 0.12)',
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        <div className="card" style={{ padding: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {['Plate', 'Owner', 'Model', 'WA', 'No. Mesin', 'No. Rangka', 'Alamat', 'UID', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {r.plateNumber || r.vehicle?.noPolisi || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {r.owner?.namaPemilik || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {r.vehicle?.model || r.vehicle?.modelMobil || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {r.waPhone || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {r.vehicle?.noMesin || r.vehicle?.noMesinLegacy || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {r.vehicle?.noRangka || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {r.owner?.alamat || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="muted">{r.id}</span>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setSaveErr('')
                        setSelected(r)
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="muted" style={{ padding: 12 }} colSpan={6}>
                    No users yet. Create one by logging in from the customer app.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {(createOpen || selected) ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Customer editor"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSaveErr('')
              setSelected(null)
              setCreateOpen(false)
            }
          }}
        >
          <div className="modalCard" style={{ width: 'min(100%, 860px)' }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{selected ? 'Edit' : 'Add'} customer</div>
            {selected ? (
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                UID: {selected.id}
              </div>
            ) : null}

            {saveErr ? (
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
                {saveErr}
              </div>
            ) : null}

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <label className="muted" style={{ fontSize: 12 }}>
                Plate Number (primary)
              </label>
              <input
                className="input"
                value={activeForm.plateNumber || ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (selected) setSelected((s) => ({ ...s, plateNumber: v }))
                  else setCreateForm((s) => ({ ...s, plateNumber: v }))
                }}
              />

              <label className="muted" style={{ fontSize: 12 }}>
                WhatsApp number (optional)
              </label>
              <input
                className="input"
                placeholder="+62812xxxx"
                value={activeForm.waPhone || ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (selected) setSelected((s) => ({ ...s, waPhone: v }))
                  else setCreateForm((s) => ({ ...s, waPhone: v }))
                }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    Owner Name
                  </label>
                  <input
                    className="input"
                    value={activeOwner.namaPemilik || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      if (selected) setSelected((s) => ({ ...s, owner: { ...(s.owner || {}), namaPemilik: v } }))
                      else setCreateForm((s) => ({ ...s, owner: { ...(s.owner || {}), namaPemilik: v } }))
                    }}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    Address
                  </label>
                  <input
                    className="input"
                    value={activeOwner.alamat || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      if (selected) setSelected((s) => ({ ...s, owner: { ...(s.owner || {}), alamat: v } }))
                      else setCreateForm((s) => ({ ...s, owner: { ...(s.owner || {}), alamat: v } }))
                    }}
                  />
                </div>
              </div>

              <div className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Model & Type</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Model (*)
                    </label>
                    <select
                      className="input"
                      value={activeVehicle.model || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        // When model changes, reset type (it will re-populate based on Firestore mapping)
                        if (selected) {
                          setSelected((s) => ({
                            ...s,
                            vehicle: { ...(s.vehicle || {}), model: v, type: '' },
                          }))
                        } else {
                          setCreateForm((s) => ({
                            ...s,
                            vehicle: { ...(s.vehicle || {}), model: v, type: '' },
                          }))
                        }
                      }}
                    >
                      <option value="" />
                      {TOYOTA_MODELS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Type (*)
                    </label>
                    <select
                      className="input"
                      value={typeMode === 'custom' ? '__custom__' : (activeVehicle.type || '')}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '__custom__') {
                          setTypeMode('custom')
                          if (selected) setSelected((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), type: customType || '' } }))
                          else setCreateForm((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), type: customType || '' } }))
                          return
                        }
                        setTypeMode('select')
                        setCustomType('')
                        if (selected) setSelected((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), type: v } }))
                        else setCreateForm((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), type: v } }))
                      }}
                    >
                      {resolvedTypeOptions.map((t) => (
                        <option key={t || 'blank'} value={t}>
                          {t}
                        </option>
                      ))}
                      <option value="__custom__">Custom…</option>
                    </select>
                    {typeMode === 'custom' ? (
                      <input
                        className="input"
                        style={{ marginTop: 8 }}
                        placeholder="Type (custom)"
                        value={customType}
                        onChange={(e) => {
                          const v = e.target.value
                          setCustomType(v)
                          if (selected) setSelected((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), type: v } }))
                          else setCreateForm((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), type: v } }))
                        }}
                      />
                    ) : null}
                  </div>

                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Tahun (*)
                    </label>
                    <select
                      className="input"
                      value={activeVehicle.year || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        if (selected) setSelected((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), year: v } }))
                        else setCreateForm((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), year: v } }))
                      }}
                    >
                      <option value="" />
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Warna
                    </label>
                    <select
                      className="input"
                      value={activeVehicle.color || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        if (selected) setSelected((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), color: v } }))
                        else setCreateForm((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), color: v } }))
                      }}
                    >
                      {colorOptions.map((c) => (
                        <option key={c || 'blank'} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    No. Mesin
                  </label>
                  <input
                    className="input"
                    value={activeVehicle.noMesin || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      if (selected) setSelected((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), noMesin: v } }))
                      else setCreateForm((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), noMesin: v } }))
                    }}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    No. Rangka
                  </label>
                  <input
                    className="input"
                    value={activeVehicle.noRangka || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      if (selected) setSelected((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), noRangka: v } }))
                      else setCreateForm((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), noRangka: v } }))
                    }}
                  />
                </div>
              </div>

              <label className="muted" style={{ fontSize: 12 }}>
                Plate (vehicle.noPolisi)
              </label>
              <input
                className="input"
                value={activeVehicle.noPolisi || ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (selected) setSelected((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), noPolisi: v } }))
                  else setCreateForm((s) => ({ ...s, vehicle: { ...(s.vehicle || {}), noPolisi: v } }))
                }}
              />

              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8 }}>
                {selected ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={async () => {
                      if (!selected?.id) return
                      if (!confirm('Delete this customer doc?')) return
                      await deleteUser(selected.id)
                      setSelected(null)
                    }}
                  >
                    Delete
                  </button>
                ) : (
                  <div />
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setSaveErr('')
                      setSelected(null)
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={selected ? onSave : onCreate}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

