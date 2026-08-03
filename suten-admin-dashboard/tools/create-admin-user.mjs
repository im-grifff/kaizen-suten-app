/**
 * Buat (atau perbarui) satu user admin Firebase Auth + set custom claim `role`.
 *
 * Dipakai untuk menyiapkan akun admin internal. Kalau email-nya sudah ada,
 * user TIDAK dibuat ulang — hanya password (bila diberikan) & claim yang di-update.
 *
 * Usage:
 *   node tools/create-admin-user.mjs --serviceAccount "<path.json>" \
 *     --email "orang@contoh.com" --password "<password>" --role sa
 *
 * Flags:
 *   --password "<pw>"   opsional kalau user sudah ada (claim saja yang di-set).
 *   --displayName "<n>" opsional.
 *
 * CATATAN: jangan menaruh password di dalam file/skrip yang di-commit.
 * Setelah akun dipakai, minta pemiliknya ganti password sendiri.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ALLOWED = ['root', 'supervisor', 'aftersales', 'tradein', 'otoxpert', 'sa']

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  const next = process.argv[idx + 1]
  return next && !next.startsWith('--') ? next : null
}

const serviceAccountPath = getArg('serviceAccount')
const email = getArg('email')
const password = getArg('password')
const role = getArg('role')
const displayName = getArg('displayName')

if (!serviceAccountPath || !email || !role) {
  console.error('Wajib: --serviceAccount <path.json> --email <email> --role <role>')
  console.error(`Role yang diizinkan: ${ALLOWED.join(', ')}`)
  process.exit(1)
}
if (!ALLOWED.includes(role)) {
  console.error(`Role "${role}" tidak dikenal. Allowed: ${ALLOWED.join(', ')}`)
  process.exit(1)
}
if (password && password.length < 6) {
  console.error('Password Firebase minimal 6 karakter.')
  process.exit(1)
}

const absSa = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(__dirname, '..', serviceAccountPath)
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(absSa, 'utf8'))) })

const auth = admin.auth()

let user = null
try {
  user = await auth.getUserByEmail(email)
  console.log(`ℹ️  User sudah ada (uid: ${user.uid}) — tidak dibuat ulang.`)
  const patch = {}
  if (password) patch.password = password
  if (displayName) patch.displayName = displayName
  if (Object.keys(patch).length) {
    user = await auth.updateUser(user.uid, patch)
    console.log(`✅ Diperbarui: ${Object.keys(patch).join(', ')}`)
  }
} catch (e) {
  if (e?.code !== 'auth/user-not-found') throw e
  if (!password) {
    console.error('User belum ada — --password wajib diisi untuk membuat user baru.')
    process.exit(1)
  }
  user = await auth.createUser({
    email,
    password,
    displayName: displayName || undefined,
    emailVerified: false,
  })
  console.log(`✅ User dibuat (uid: ${user.uid})`)
}

await auth.setCustomUserClaims(user.uid, { role })
const fresh = await auth.getUser(user.uid)
console.log(`✅ Claim di-set: role='${fresh.customClaims?.role}' untuk ${email}`)
console.log('   User harus logout/login agar token ter-refresh.')
process.exit(0)
