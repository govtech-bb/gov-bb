# Docker stack recovery — Session Summary

**Date:** 2026-05-21
**Branch:** fix/docker-stack-recovery
**ADR:** [docs/decisions/0003-containerised-api-needs-explicit-workspace-symlinks.md](../decisions/0003-containerised-api-needs-explicit-workspace-symlinks.md)
**Closes:** #15
**Builds on:** [PR #23 (docker-compose for local dev stack)](https://github.com/govtech-bb/gov-bb/pull/23)

## What was built

A follow-up to PR #23 that recovers the docker-compose stack on `dev`, closes the open container-runs-as-root finding (#15), sweeps stale `apps/web/*` paths left over from the apps/web → apps/forms rename, and lands the ADR + summary that didn't make it into the original PR.

## Why this exists

When I picked up where PR #23 left off, three things were broken on `dev`:

1. **`docker-compose.yml` had unresolved merge-conflict markers.** The chat RAG PR (`945f80f`) introduced its own minimal compose file at the repo root with a conflicting `name:` and a different postgres image; the conflict was committed without being resolved. `docker compose up` fails with a YAML parse error in that state.
2. **`apps/forms/Dockerfile` still referenced `apps/web/*`.** The "rename apps/web to apps/forms" commit (`6b0ee14`) moved the file but didn't update its content. The `forms` image as it stood on dev would have failed to build (`COPY apps/web/package.json` against a non-existent path).
3. **No app container ran as a non-root user.** Issue #15 (CIS Docker Benchmark violation) was open against the api Dockerfile, with the same finding implicitly applying to landing and forms.

A separate concern is that the README's "Running with Docker" section (added in PR #23) was rolled back to a pre-pnpm-migration state by some intermediate merge. That's flagged as its own issue rather than re-asserted here — the rollback happened for some reason (most likely accidental in a merge) and re-applying it without understanding the cause repeats the same kind of move.

## Why it looks the way it does

**Compose resolution chose pgvector image, not postgres-alpine.** The chat RAG work needs the `vector` extension. The forms api doesn't, but pgvector/pgvector:pg16 is a drop-in superset of postgres:16 — including all of plain postgres's features plus vector. Single image, both apps satisfied. The optional `scripts/postgres-init.sql:/docker-entrypoint-initdb.d/init.sql:ro` mount creates the `chat` database alongside `modular_forms` and enables the vector extension on it. Verified locally: both databases exist after a fresh `docker compose up -d`, `\dx` on the chat database shows `vector 0.8.2`.

**Forms Dockerfile rewritten end-to-end, not just patched.** Updating every `apps/web` reference to `apps/forms` (plus the nx target name `web:build` → `forms:build`) touched enough lines that a clean rewrite was easier to review than a series of small edits. The behaviour is unchanged from PR #23's apps/web/Dockerfile — same multi-stage shape, same `vite dev` runtime CMD, same workspace-package copying.

**Non-root user added to all three Dockerfiles, not just api.** Issue #15 was filed against the api specifically but the same finding applies cleanly to landing and forms. Doing all three at once avoids a follow-up issue. Pattern is identical in each runtime stage:

```dockerfile
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
```

Verified `docker compose exec <svc> id` on each: `uid=100(app) gid=101(app)` not `uid=0(root)`.

**Stale `apps/web/package.json` reference in `apps/landing/Dockerfile` swept too.** Same rename leftover. Caught while in the file for the non-root change.

**README restoration deliberately deferred.** Filing a separate issue with what got lost (pnpm prereqs note, full Docker section, updated script table). The team should triage. Re-asserting without understanding which merge wiped it is the same shape of move that broke things in the first place.

## What survived from PR #23 (no action needed)

- `apps/api/Dockerfile` workspace symlinks (`RUN mkdir -p node_modules/@govtech-bb && ln -sfn ...`) — I initially thought these had been lost on dev based on a partial diff read; closer inspection confirmed they're still there.
- `apps/api/src/main.ts` bootstrap (migrations + optional seed) — merged cleanly with new helmet middleware.
- `apps/api/package.json` `workspace:*` protocol for `@govtech-bb/*` deps.
- `apps/landing/Dockerfile` overall shape (just the one stale path reference needed fixing).
- `.env.docker.example`.
- The `apps/api/.dockerignore` deletion and the root `.dockerignore`.

## Decisions worth flagging

- **Pgvector for compose postgres is a unilateral call.** I picked it because it's a drop-in superset and both apps need a postgres. The chat dev should confirm — if they want a separate dedicated chat postgres instance, the compose can be restructured to two services. Not blocking.
- **Forms Dockerfile got a rewrite, not a targeted patch.** Diff will look larger than necessary in the PR. Worth a glance to confirm the rewrite matches the team's expectation of what the image should do.
- **README rollback is out of scope** — filed as a separate issue.

## Key files

| File                                                                         | Change                                                                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml`                                                         | Resolved merge conflict; switched postgres image to `pgvector/pgvector:pg16`; mounted `scripts/postgres-init.sql`; renamed `web` service → `forms`. |
| `docker-compose.dev.yml`                                                     | Renamed `web` overlay → `forms`; updated bind-mount paths.                                                                                          |
| `apps/forms/Dockerfile`                                                      | Full rewrite: every `apps/web` reference → `apps/forms`; nx target `web:build` → `forms:build`. Added non-root user.                                |
| `apps/api/Dockerfile`                                                        | Added non-root user block before CMD. (Workspace symlinks already present from PR #23.)                                                             |
| `apps/landing/Dockerfile`                                                    | Fixed stale `apps/web/package.json` COPY → `apps/forms/package.json`. Added non-root user block.                                                    |
| `docs/decisions/0003-containerised-api-needs-explicit-workspace-symlinks.md` | New ADR. Records the constraint that future workspace deps must be added to the api Dockerfile's symlink block.                                     |
| `docs/summaries/2026-05-21-docker-stack-recovery.md`                         | This file.                                                                                                                                          |

## Verification

Local (Apple Silicon, Docker 29.5.1):

- Fresh `docker compose --env-file .env.docker down -v && up -d`:
  - postgres up healthy (pgvector image), api healthy in ~15s
  - Both `modular_forms` and `chat` databases exist
  - `chat` database has `vector 0.8.2` extension enabled
- HTTP probes:
  - `localhost:3000/` (landing) → 200
  - `localhost:3001/health` (api) → 200
  - `localhost:3001/form-definitions` → returns seeded `example-name-change` form
  - `localhost:4200/` (forms) → 200
- `docker compose exec id` on api / landing / forms → `uid=100(app)` not root
- Pre-push hook `pnpm exec tsc -b` green

## Follow-ups intentionally not in this PR

- **README restoration / what got lost in the merge** — separate issue.
- **Image slimming** — runtime images still carry build-stage dev deps; ~1 GB each. Worth a focused pass.
- **Declare `@nestjs/cli`** in the monorepo — would unblock api hot reload in the dev overlay (currently devs run `pnpm dev:api` natively).
- **Stale `npm run` strings in `apps/*/project.json`** — cosmetic.
- **CI smoke-test that boots the api image and probes `/health`** — would catch missing workspace symlinks (ADR 0003) before merge.
- **Wire chat into compose** — commented placeholder is in place; chat dev fills in.
