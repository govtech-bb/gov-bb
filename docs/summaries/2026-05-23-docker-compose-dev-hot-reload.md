# Docker compose: full stack with hot reload — Implementation Session

**Date:** 2026-05-23
**Branch:** `chore/docker`

## Context

The compose stack on this branch already ran postgres + api + landing + forms + chat, with hot reload on the three Vite apps. Two gaps remained vs. "run the complete app in docker with hot reloading":

1. **`apps/form_builder` was not in the stack at all.** It's a real TanStack Start app that talks directly to Postgres (via `@govtech-bb/database`) and to Anthropic + Bedrock — the same surface area as chat + api combined.
2. **The api ran as a compiled prod build.** The existing compose comment block stated this was deliberate ("api is intentionally NOT bind-mounted") and pointed developers at `pnpm dev:api` on the host. Reasonable, but it splits the dev loop across two terminals and skips docker for the one app most likely to need fast iteration.

`apps/web`, mentioned in the original README, no longer exists — confirmed by `ls apps/`. Dropped from scope.

## What we did

**API Dockerfile gets a `dev` stage** (`apps/api/Dockerfile`). New stage sits _between_ `builder` and `runner` so `runner` remains the default last stage — prod builds (ECS, CI) don't need to pass `--target`. The dev stage inherits everything builder produces and swaps the CMD to `pnpm exec nx dev api`, matching the host-side `pnpm dev:api` watcher exactly.

**Compose api service switches to `target: dev`** with bind mounts for `apps/api/src`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, and `./packages`, plus anonymous volumes for `node_modules`. The old misleading "api intentionally NOT bind-mounted" header was rewritten.

**Polling env vars were added to the api service** after the initial hot-reload test failed silently. Confirmed: `nx dev`'s tsc-watch chain doesn't see file events through docker-desktop's macOS bind-mount layer. Set `CHOKIDAR_USEPOLLING=true`, `CHOKIDAR_INTERVAL=500`, `TSC_WATCHFILE=dynamicPriorityPolling` and the chain restarts within ~3 seconds of an edit. Vite has its own FS-event path that already works without this knob, so the Vite apps don't carry the env var.

**New `apps/form_builder/Dockerfile`** patterned on `apps/chat/Dockerfile` (closest sibling — TanStack Start + Vite, Postgres-connected, AI deps). Single-stage dev image, non-root user, shared BuildKit `pnpm-store` cache mount.

**New `form_builder` compose service** depending on postgres, host port `3003`, bind-mounting `apps/form_builder/app` + `./packages`.

**`./packages` mount standardised across every app service.** Previously: forms mounted it fully, chat mounted only `packages/content`, landing mounted nothing. Now all five apps mount the full tree so an edit to any shared package hot-reloads every consumer.

**`.env.example` extended** with the `form_builder` block (`FORM_BUILDER_PORT`, `SESSION_SECRET`, `GITHUB_OAUTH_CLIENT_ID/SECRET`, `OAUTH_REDIRECT_BASE`, `AI_PROVIDER`, `AI_MODEL`).

Smoke test: `docker compose up -d` brings up all six containers; every web port responds (api 200, landing 200, forms 200, chat 200, form_builder 307→auth gate); api restart timed at ~3s from file edit; Vite HMR confirmed via `[vite] page reload` log line.

## Why we did it that way

**`nx dev api` in the container, not `nest start --watch`.** During planning I proposed adding `@nestjs/cli` and running `nest start --watch` to match what I assumed `pnpm dev:api` did on the host. Reading `apps/api/project.json` showed the host workflow actually uses Nx's `@nx/js:node` executor (tsc --watch + node restart) — `@nestjs/cli` isn't declared anywhere in the repo, and the `start:dev` script in `apps/api/package.json` is dead code. So the dev stage runs `pnpm exec nx dev api`: same watcher as the host, no new dependency, no ~80MB CLI install.

**Dev stage placed before runner, not after.** Docker treats the last stage as the default build target when no `--target` is passed. Putting `dev` after `runner` would silently break every prod build (ECS, CI) the moment this PR landed. Comment in the Dockerfile spells this out so a future contributor doesn't reorder them.

**Polling forced on api only.** Vite ships its own chokidar configuration that handles docker-desktop's mount layer. The `nx dev` → tsc → node-watcher chain does not — confirmed empirically by editing `apps/api/src/main.ts` while watching `docker compose logs -f api`: the file content propagated into the container instantly (visible via `docker compose exec api head main.ts`), but tsc never noticed. Polling fixed it; CPU cost is negligible for an in-container watcher.

**form_builder uses `AI_PROVIDER`/`AI_MODEL`, not `LLM_MODEL`.** The first compose entry mirrored chat's env block, which uses `LLM_MODEL`. Reading form_builder's own `.env.example` and the call sites showed it actually reads `AI_PROVIDER` (defaults to `anthropic`) and `AI_MODEL` (no default — must be set). Different naming convention from chat; documented in the compose comment and the root `.env.example`.

**SESSION_SECRET has a dev-only default.** `apps/form_builder/app/server/forms.ts` and `publish.ts` both throw "SESSION_SECRET is not set" on any `/builder` request. With no default in compose, every fresh `docker compose up` would land users on a 500 page until they read `.env.example` and generated a base64 secret. Set a clearly-marked dev default in the compose interpolation so the stack boots green, and require an override in `.env` for any non-throwaway use.

**form_builder depends on postgres, not on api.** Both talk to the `modular_forms` database; api owns the migrations, form_builder is a reader/writer. There's a theoretical race where form_builder hits the DB before api has run its boot-time migrations, but in practice api boots faster than form_builder's first DB call and the alternative (`depends_on: api { condition: service_healthy }`) couples the form_builder cold-start to api's full bootstrap. Documented the race in the compose comment so it's not invisible if it ever bites.

**No README/ADR writing in this session.** Per the project's split — `/bb:dev-finish` writes summaries, ADRs are a high bar and reserved for principles that constrain future work. Considered and skipped both: the dev-stage ordering is tactical, and the macOS chokidar workaround is a fix not a convention.

## Open items (flagged, not fixed)

- **Cross-package hot reload to api.** Editing `packages/form-types/src/*.ts` won't trigger an api restart today — api's `tsconfig.json` `include` is scoped to `src/**`. Vite apps pick up package edits via their import graph. Fix requires expanding the api's tsc watch path or running an `nx watch` sidecar; separate session.
- **Chat healthcheck reports `unhealthy`.** Pre-existing — the in-container `wget http://localhost:3000/api/health` gets `Connection refused` while the same URL from the host returns 200 with `db: connected`. Likely an IPv4/IPv6 resolution mismatch (alpine `localhost` → `::1`, vite binds 0.0.0.0). Not introduced by this branch; out of scope.
- **GitHub OAuth for form_builder.** Empty client-id/secret defaults let the container boot and serve the redirect-to-login flow, but the round-trip won't complete until a real OAuth App is registered. Documented in `.env.example`.
