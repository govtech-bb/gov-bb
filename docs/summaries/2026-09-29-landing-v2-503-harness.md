# A built-server harness for landing_v2's 503 path (#2833)

## Context

#2702 made `apps/landing_v2` answer **503** when api_v2 is unreachable or answers 5xx with nothing cached. Two pieces carry that status to the citizen:

- `setResponseStatus(503)` inside the server functions
- `src/server/status.ts`, a root-route middleware that puts the 503 back on the server-rendered page, because Start answers a failed loader with 500

Both had been checked only with `curl -i`. #2833 asked for a test that fails if a Start upgrade turns the 503 back into a 500. The work is based on `origin/v2-rewrite`, which has no CI, so the local gate is the only gate.

## What we did

- `pnpm exec nx run landing_v2:e2e`:
  - `build-e2e` builds a Nitro `node-server` copy into `.output/`, chosen by `LANDING_V2_NITRO_PRESET` in `vite.config.ts`.
  - `e2e/support.ts` spawns that copy against a throwaway `node:http` api_v2.
  - `e2e/status.spec.ts` asserts six cases:
    - a healthy page is 200
    - a page is 503 when api_v2 answers 500
    - the `listPages` RPC is 503 when api_v2 answers 500
    - a malformed document is 500
    - an unknown url is 404
    - a page is 503 when api_v2 can't be reached
  - Each case checks the body text as well as the status.
- `vitest.config.ts` now includes only `src/**/*.test.{ts,tsx}`, so the unit suite doesn't run the harness.
- Follow-up #2844: run it in CI once landing_v2 has a pipeline.

## Why we did it that way

- **A built server in a child process, not Start's handler inside Vitest.** The in-process route depends on Start's dev-server manifest module, which is unproven under Vitest. landing_v2's `vitest.config.ts` also already records that booting Nitro under Vitest leaks handles. api_v2's `e2e/support.ts` is the pattern this copies.
- **`node-server`, not the Amplify build.** Nitro's `aws_amplify` runtime always listens on :3000 and ignores `PORT`, and :3000 is the forms dev server. Both presets feed the same `nitroApp.fetch` through srvx, so the status logic is the one Amplify runs. The preset has to be switched in `vite.config.ts`, because a preset passed to `nitro({…})` beats `NITRO_PRESET`.
  - The variable is the app's own, so another app's `NITRO_PRESET` can't leak in.
  - It is in `build`'s nx inputs, so a node-server build is never cached as an Amplify one.
- **The RPC case uses `listPages`**, because it takes no input: `GET /_serverFn/<id>` with no payload runs it.
  - The plan's id formula was wrong. Start hashes `src/server/pages.ts--listPages_createServerFn_handler`: a path relative to the Vite root, plus the extracted handler's name. That was read off the built chunk and confirmed in Start's compiler.
  - The request needs two headers. `Sec-Fetch-Site: same-origin` passes the CSRF check. `x-tsr-serverFn: true`, which Start's own client always sends, is needed for Start to answer with the status the server function set rather than a plain 500.
- **Every case has its own url, and the fake api sends no `Cache-Control`.** Once a url has been answered 200, `stale-if-error` would serve the cached copy on a later 5xx, and the 503 case would prove nothing.
- **The startup check accepts any HTTP status.** `GET /` runs `listPages`, and in this spec the fake `/pages` always answers 500.
- **The check proves it works.** With the root middleware commented out, both server-rendered 503 cases fail with 500. The RPC case still passes, because its status comes from `setResponseStatus` directly.

## What we almost got wrong

- **The planned unit test of `withUnavailableStatus` couldn't be written.** Exporting it from `pages.ts` failed `vite build`: Start's import protection refuses `@tanstack/react-start/server` in the client build. Kept private, the helper is dead code once the compiler strips the handler bodies, so it and its import disappear. Exported, it survives. Vitest never sees this; only the build does. The unit case was dropped, and the harness now carries the status assertion. Moving the helper into a module of its own was rejected as a restructure outside the plan.
- **The first version of the unit config would have run the harness.** Vitest's default glob matches `e2e/**/*.spec.ts`. The explicit `include` fixes that, as api_v2 does.
- **The first docs overclaimed.** They said the RPC was tested against an unreachable api_v2; only the page is. That's corrected in the second commit, but the first commit's message still says it, so squash on merge.

## Open questions

- CI wiring: #2844.
- `build` and `build-e2e` share Nitro's build dir, so running them in parallel could collide. Nothing documented does that, so it's left alone.
- The server-function id depends on Start's `<name>_createServerFn_handler` naming. A rename fails the RPC case loudly ("Server function info not found"), not silently.
