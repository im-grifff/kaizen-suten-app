/**
 * Set Firebase Auth custom claim `role` untuk banyak admin sekaligus.
 *
 * Usage:
 *   node tools/set-claims-batch.mjs --serviceAccount ".\serviceAccountKey.json" --config ".\tools\admin-claims.batch.example.json"
 *
 * Salin admin-claims.batch.example.json → admin-claims.local.json (di-gitignore) jika ingin mengubah daftar tanpa commit.
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
  return process.argv[idx + 1] || null
}

function usage() {
  console.log(`
Usage:
  node tools/set-claims-batch.mjs --serviceAccount "<path-to-service-account.json>" --config "<path-to-batch.json>"

Contoh (Windows):
  node tools/set-claims-batch.mjs --serviceAccount ".\\\\serviceAccountKey.json" --config ".\\\\tools\\\\admin-claims.batch.example.json"

File JSON: array of { "email": "...", "role": "supervisor" | "tradein" | "aftersales" | "root" }
`)
}

const serviceAccountPath = getArg('serviceAccount')
let configPath = getArg('config')

if (!serviceAccountPath) {
  usage()
  process.exit(1)
}

if (!configPath) {
  const local = path.join(__dirname, 'admin-claims.local.json')
  const example = path.join(__dirname, 'admin-claims.batch.example.json')
  if (fs.existsSync(local)) configPath = local
  else if (fs.existsSync(example)) configPath = example
  else {
    console.error('Missing --config and no tools/admin-claims.local.json or admin-claims.batch.example.json found.')
    usage()
    process.exit(1)
  }
}

const absSa = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(process.cwd(), serviceAccountPath)
const absCfg = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath)

if (!fs.existsSync(absSa)) {
  console.error('Service account file not found:', absSa)
  process.exit(1)
}
if (!fs.existsSync(absCfg)) {
  console.error('Config file not found:', absCfg)
  process.exit(1)
}

const entries = JSON.parse(fs.readFileSync(absCfg, 'utf8'))
if (!Array.isArray(entries)) {
  console.error('Config must be a JSON array of { email, role }')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(absSa, 'utf8'))
admin.initializeApp({
  credential: admin.credential.cert(sa),
})

let ok = 0
let fail = 0
for (const row of entries) {
  const email = String(row?.email || '').trim()
  const role = String(row?.role || '').trim()
  if (!email || !role) {
    console.warn('Skip baris tanpa email/role:', row)
    fail += 1
    continue
  }
  if (!ALLOWED.includes(role)) {
    console.error(`Invalid role "${role}" for ${email}. Allowed: ${ALLOWED.join(', ')}`)
    fail += 1
    continue
  }
  try {
    const user = await admin.auth().getUserByEmail(email)
    await admin.auth().setCustomUserClaims(user.uid, { role })
    console.log(`✅ ${email} → role=${role} (uid ${user.uid})`)
    ok += 1
  } catch (e) {
    console.error(`❌ ${email}:`, e?.message || e)
    fail += 1
  }
}

console.log(`\nSelesai: ${ok} berhasil, ${fail} gagal/skip.`)
console.log('Pengguna harus logout lalu login lagi di dashboard agar claim terbaca.')
