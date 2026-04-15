import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function usage() {
  console.log(
    [
      'Usage:',
      '  node tools/set-claims.mjs --serviceAccount "<path-to-json>" --email "<admin-email>" --role root',
      '',
      'Example:',
      '  node tools/set-claims.mjs --serviceAccount ".\\\\serviceAccountKey.json" --email "griffinmumu02@gmail.com" --role root',
    ].join('\n'),
  )
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

const serviceAccountPath = getArg('serviceAccount')
const email = getArg('email')
const role = getArg('role')

if (!serviceAccountPath || !email || !role) {
  usage()
  process.exit(1)
}

if (!['root', 'supervisor', 'aftersales', 'tradein'].includes(role)) {
  console.error('Invalid role. Allowed: root, supervisor, aftersales, tradein')
  process.exit(1)
}

const abs = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(__dirname, '..', serviceAccountPath)

const sa = JSON.parse(fs.readFileSync(abs, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(sa),
})

const user = await admin.auth().getUserByEmail(email)
await admin.auth().setCustomUserClaims(user.uid, { role })

console.log(`✅ Set role='${role}' for ${email} (uid: ${user.uid})`)
console.log('Note: user must sign out/in to refresh claims.')

