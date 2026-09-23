/**
 * Copies the 163 pharmacy records out of apps/landing into the spike's seed
 * data, dropping the file-level `lastUpdated` — per-record `updated_at` in
 * collection_records replaces it.
 *
 * The spike does not import across app boundaries at runtime; this runs once
 * and its output is committed.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../../..')
const source = join(
  repo,
  'apps/landing/src/routes/health-and-emergency-services/find-an-open-pharmacy/-data/pharmacies.json',
)

const { pharmacies } = JSON.parse(readFileSync(source, 'utf8'))
writeFileSync(
  join(here, '../src/seed-data/pharmacies.json'),
  JSON.stringify(pharmacies, null, 2) + '\n',
)
console.log(`wrote ${pharmacies.length} pharmacy records`)
