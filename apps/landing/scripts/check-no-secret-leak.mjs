// Post-build guard: fail if a server-only secret leaked into a client asset.
//
// PREVIEW_SECRET is baked into the SSR bundle via Nitro runtimeConfig (see
// vite.config.ts) and must never reach the browser. runtimeConfig keeps it
// server-only by construction, but this check is a cheap regression guard: a
// future `define`, a client-side `process.env` read, or an inlined config would
// surface here and fail the build instead of silently shipping the token.
//
// Runs as part of `pnpm build`, so it guards Amplify's production build too —
// where PREVIEW_SECRET is set in the build container. When the secret is unset
// (local offline build, CI without the var) there is nothing to leak, so skip.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CLIENT_DIR = '.amplify-hosting/static'

/** Secrets that must not appear in any client asset, keyed by name for output. */
const SECRETS = { PREVIEW_SECRET: process.env.PREVIEW_SECRET }

function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    files = files.concat(
      statSync(path).isDirectory() ? walk(path) : [path],
    )
  }
  return files
}

const present = Object.entries(SECRETS).filter(([, value]) => value)
if (present.length === 0) {
  console.log('[check-no-secret-leak] no secrets set at build time — skipping.')
  process.exit(0)
}

let leaked = false
const files = walk(CLIENT_DIR)
for (const [name, value] of present) {
  const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(value))
  if (offenders.length > 0) {
    leaked = true
    console.error(
      `[check-no-secret-leak] ${name} leaked into ${offenders.length} client asset(s):`,
    )
    for (const f of offenders) console.error(`  - ${f}`)
  }
}

if (leaked) {
  console.error(
    '[check-no-secret-leak] FAIL: a server-only secret reached the client bundle.',
  )
  process.exit(1)
}

console.log(
  `[check-no-secret-leak] OK: scanned ${files.length} client asset(s), no secret leaked.`,
)
