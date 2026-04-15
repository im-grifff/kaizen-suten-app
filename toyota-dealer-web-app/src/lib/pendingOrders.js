/**
 * Draft: simpan order ke localStorage (demo).
 * Nanti bisa diganti Firestore untuk Dashboard admin.
 */
const KEY_PARTS = 'siteman_orders_parts'
const KEY_INSURANCE = 'siteman_orders_insurance_extend'

function readList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function writeList(key, list) {
  localStorage.setItem(key, JSON.stringify(list))
}

export function savePartsOrder(payload) {
  const list = readList(KEY_PARTS)
  const row = {
    id: crypto.randomUUID(),
    type: 'parts',
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...payload,
  }
  list.push(row)
  writeList(KEY_PARTS, list)
  return row
}

export function saveInsuranceExtendRequest(payload) {
  const list = readList(KEY_INSURANCE)
  const row = {
    id: crypto.randomUUID(),
    type: 'insurance_extend',
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...payload,
  }
  list.push(row)
  writeList(KEY_INSURANCE, list)
  return row
}
