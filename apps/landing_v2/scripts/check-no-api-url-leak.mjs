// Post-build guard: fail if the content API base URL leaked into a client asset.
// Copy of apps/landing/scripts/check-no-secret-leak.mjs.
//
// CONTENT_API_URL is read by the `getPage` server function only (no VITE_
// prefix), so it is server-only by construction. This check is a cheap
// regression guard: a future `define`, a client-side `process.env` read, or an
// inlined config would surface here and fail the build instead of shipping the
// API origin to the browser.
//
// Runs as part of `pnpm build`. When the var is unset (an env-less `nx build`)
// there is nothing to leak, so skip.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CLIENT_DIR = '.output/public'

/** Secrets that must not appear in any client asset, keyed by name for output. */
const SECRETS = { CONTENT_API_URL: process.env.CONTENT_API_URL }

function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    files = files.concat(statSync(path).isDirectory() ? walk(path) : [path])
  }
  return files
}

const present = Object.entries(SECRETS).filter(([, value]) => value)
if (present.length === 0) {
  console.log(
    '[check-no-api-url-leak] no secrets set at build time — skipping.',
  )
  process.exit(0)
}

let leaked = false
const files = walk(CLIENT_DIR)
for (const [name, value] of present) {
  const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(value))
  if (offenders.length > 0) {
    leaked = true
    console.error(
      `[check-no-api-url-leak] ${name} leaked into ${offenders.length} client asset(s):`,
    )
    for (const f of offenders) console.error(`  - ${f}`)
  }
}

if (leaked) {
  console.error(
    '[check-no-api-url-leak] FAIL: a server-only secret reached the client bundle.',
  )
  process.exit(1)
}

console.log(
  `[check-no-api-url-leak] OK: scanned ${files.length} client asset(s), no secret leaked.`,
)
