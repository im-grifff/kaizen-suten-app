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
      '  node tools/seed-model-types.mjs --serviceAccount "<path-to-json>"',
      '',
      'Example:',
      '  node tools/seed-model-types.mjs --serviceAccount ".\\\\serviceAccountKey.json"',
    ].join('\n'),
  )
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

const serviceAccountPath = getArg('serviceAccount')
if (!serviceAccountPath) {
  usage()
  process.exit(1)
}

const abs = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(__dirname, '..', serviceAccountPath)

const sa = JSON.parse(fs.readFileSync(abs, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(sa),
})

const db = admin.firestore()

const MODEL_TYPES = {
  AGYA: [
    'E A/T',
    'E M/T',
    'G A/T',
    'G A/T GR',
    'G A/T TRD',
    'G CVT',
    'G M/T',
    'G M/T GR',
    'G M/T TRD',
    'G STD A/T',
    'G STD M/T',
    'GR CVT',
    'GR M/T',
  ],
  CALYA: ['E A/T', 'E M/T', 'E MT', 'E STD M/T', 'G A/T', 'G AT', 'G M/T', 'G MT'],
  RUSH: [
    'G A/T',
    'G A/T NEW',
    'G LUX M/T',
    'G M/T',
    'G M/T LUX',
    'G M/T NEW',
    'S A/T',
    'S A/T GR',
    'S A/T GR Sport',
    'S A/T TRD',
    'S A/T TRD NEW',
    'S A/T TRD Sportivo',
    'S A/T TRD Sportivo Ultimo',
    'S M/T',
    'S M/T GR',
    'S M/T TRD',
    'S M/T TRD NEW',
    'S M/T TRD Sportivo',
    'S M/T TRD Sportivo Ultimo',
    'TRD Sportivo A/T',
    'TRD Sportivo M/T',
  ],
}

let written = 0
for (const [model, types] of Object.entries(MODEL_TYPES)) {
  await db.collection('model_types').doc(model).set(
    {
      model,
      types,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  written += 1
}

console.log(`✅ Seeded model_types for ${written} models: ${Object.keys(MODEL_TYPES).join(', ')}`)

