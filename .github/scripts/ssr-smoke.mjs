#!/usr/bin/env node
// SSR smoke test — boots a built Amplify WEB_COMPUTE server and asserts its
// homepage actually responds, catching "build succeeded but runtime hangs/5xx"
// regressions BEFORE they deploy to staging.
//
// This is the check that would have caught the 2026-05-31 landing outage: a
// transitive @tanstack/react-start bump compiled clean but hung every SSR
// request (createServerFn path), so build/typecheck/unit all passed and only
// the post-deploy URL smoke — after it was already live — went red.
//
// Usage:  node .github/scripts/ssr-smoke.mjs <compute-dir> <label>
//   <compute-dir>  e.g. apps/landing/.amplify-hosting/compute/default
//   <label>        human label for logs, e.g. "landing"
//
// Boot-time env (SESSION_SECRET, GITHUB_OAUTH_*, etc.) is inherited from the
// caller's environment — the workflow sets dummy values for apps that need
// them to start (e.g. form-builder's session cipher).
//
// Pass  = homepage responds with status < 500 within REQUEST_TIMEOUT_MS.
//         (200/301/302/307/404 all mean "the SSR runtime is alive" — an auth
//         redirect or not-found still proves the server handles requests.)
// Fail  = server never listens, the request times out (a hang), or status >= 500.

import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { join } from 'node:path'

const computeDir = process.argv[2]
const label = process.argv[3] ?? computeDir
if (!computeDir) {
  console.error('usage: node ssr-smoke.mjs <compute-dir> <label>')
  process.exit(2)
}

const PORT = 3000 // the Amplify compute preset hard-codes 3000
const BOOT_TIMEOUT_MS = 30_000 // max wait for the server to start listening
const REQUEST_TIMEOUT_MS = 10_000 // a healthy SSR root answers in <1s; a hang must fail fast

const entry = join(computeDir, 'index.mjs')
console.log(`[smoke:${label}] booting ${entry} on :${PORT}`)

const server = spawn(process.execPath, ['index.mjs'], {
  cwd: computeDir,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
server.stdout.on('data', (d) => {
  serverOutput += d
  process.stdout.write(`[smoke:${label}] ${d}`)
})
server.stderr.on('data', (d) => {
  serverOutput += d
  process.stderr.write(`[smoke:${label}] ${d}`)
})

let exited = false
server.on('exit', (code) => {
  exited = true
  if (code !== 0 && code !== null) {
    fail(`server process exited with code ${code} before/while serving`)
  }
})

function cleanup() {
  if (!exited) server.kill('SIGKILL')
}
function pass(msg) {
  console.log(`[smoke:${label}] ✅ ${msg}`)
  cleanup()
  process.exit(0)
}
function fail(msg) {
  console.error(`[smoke:${label}] ❌ ${msg}`)
  cleanup()
  process.exit(1)
}

// Poll the port until the server is listening, then issue one request to /.
const bootDeadline = Date.now() + BOOT_TIMEOUT_MS
function waitForListen() {
  if (exited) return // exit handler already failed us
  if (serverOutput.includes('Listening on')) return hitRoot()
  if (Date.now() > bootDeadline) {
    return fail(`server did not start listening within ${BOOT_TIMEOUT_MS}ms`)
  }
  setTimeout(waitForListen, 250)
}

function hitRoot() {
  console.log(`[smoke:${label}] GET http://127.0.0.1:${PORT}/`)
  const started = Date.now()
  const req = request(
    { host: '127.0.0.1', port: PORT, path: '/', method: 'GET' },
    (res) => {
      const ms = Date.now() - started
      res.resume() // drain
      if (res.statusCode >= 500) {
        return fail(`GET / returned ${res.statusCode} in ${ms}ms (server error)`)
      }
      pass(`GET / returned ${res.statusCode} in ${ms}ms`)
    },
  )
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    req.destroy()
    fail(`GET / did not respond within ${REQUEST_TIMEOUT_MS}ms (runtime hang)`)
  })
  req.on('error', (e) => fail(`GET / failed: ${e.message}`))
  req.end()
}

waitForListen()
