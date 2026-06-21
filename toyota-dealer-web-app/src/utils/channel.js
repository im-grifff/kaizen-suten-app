/**
 * Sumber customer (acquisition channel):
 * - first  = Dealer (default, deployment utama)
 * - second = OtoXpert (akses via QR/link khusus /access/otoxpert)
 */
export const CHANNEL_FIRST = 'first'
export const CHANNEL_SECOND = 'second'
export const CHANNEL_STORAGE_KEY = 'suten_channel'

export function channelLabel(c) {
  if (c === CHANNEL_SECOND) return 'OtoXpert'
  if (c === CHANNEL_FIRST) return 'Dealer'
  return '-'
}

/**
 * Deteksi channel dari lokasi (path/query). Mengembalikan null jika tidak ada
 * penanda channel sama sekali (supaya tidak menimpa nilai tersimpan).
 */
export function detectChannelFromLocation(loc) {
  const path = String(loc?.pathname || '').toLowerCase()
  const search = String(loc?.search || '').toLowerCase()

  const isSecond =
    path.includes('/otoxpert') ||
    path.includes('/otoexpert') ||
    /[?&]src=otoxpert\b/.test(search) ||
    /[?&]src=otoexpert\b/.test(search) ||
    /[?&]src=second\b/.test(search) ||
    /[?&]channel=otoxpert\b/.test(search) ||
    /[?&]channel=otoexpert\b/.test(search) ||
    /[?&]channel=second\b/.test(search)
  if (isSecond) return CHANNEL_SECOND

  const isFirst =
    path === '/access' ||
    /[?&]src=dealer\b/.test(search) ||
    /[?&]src=first\b/.test(search) ||
    /[?&]channel=dealer\b/.test(search) ||
    /[?&]channel=first\b/.test(search)
  if (isFirst) return CHANNEL_FIRST

  return null
}

export function getStoredChannel() {
  try {
    const v = localStorage.getItem(CHANNEL_STORAGE_KEY)
    if (v === CHANNEL_FIRST || v === CHANNEL_SECOND) return v
  } catch {
    // ignore
  }
  return ''
}

export function setStoredChannel(channel) {
  if (channel !== CHANNEL_FIRST && channel !== CHANNEL_SECOND) return
  try {
    localStorage.setItem(CHANNEL_STORAGE_KEY, channel)
  } catch {
    // ignore
  }
}

/**
 * Tangkap channel dari lokasi saat ini; jika ada penanda, simpan & kembalikan.
 * Jika tidak ada penanda, kembalikan nilai tersimpan (jika ada).
 */
export function captureChannelFromLocation(loc) {
  const detected = detectChannelFromLocation(loc)
  if (detected) {
    setStoredChannel(detected)
    return detected
  }
  return getStoredChannel()
}

/** Channel efektif untuk disimpan ke DB (default Dealer/first). */
export function getChannelOrDefault() {
  return getStoredChannel() || CHANNEL_FIRST
}
