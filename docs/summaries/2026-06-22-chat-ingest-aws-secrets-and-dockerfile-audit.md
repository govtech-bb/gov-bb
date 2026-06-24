# chat-ingest `@govtech-bb/aws-secrets` fix + Dockerfile runtime-resolution audit

**Date:** 2026-06-22
**Branch:** `worktree-fix-chat-ingest-aws-secrets`
**Trigger:** failed Deploy Sandbox run [27972008936](https://github.com/govtech-bb/gov-bb/actions/runs/27972008936) — `Build, Push & Trigger chat-ingest` failed
**Related:** follows the API/form-builder runtime-resolution fixes in #1525

## Context

The `Build, Push & Trigger chat-ingest` job failed at "Wait for ingest to
complete". The image built and pushed fine, but the ingest ECS task crash-looped
on boot:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@govtech-bb/aws-secrets'
  imported from /app/apps/chat/src/lib/db/index.ts
```

Because no ingest run ever *completed* after the trigger, the workflow polled
(`latest run predates this trigger … waiting`) for ~10 min and timed out.

This is a third instance of the same class as #1525: a workspace package that the
runtime container can't resolve. `@govtech-bb/aws-secrets` was extracted and
adopted in chat by #1392; it's a **source-only ESM package** (`exports:
"./src/index.ts"`, no build) that the ingest task runs via `tsx`, so its *source*
must be in the image.

## What we did

- **`apps/chat/Dockerfile.ingest`** — added `@govtech-bb/aws-secrets` to the
  pre-install `package.json` COPY list (so pnpm links it during the
  `--filter @govtech-bb/chat...` install and pulls its `@aws-sdk/client-secrets-manager`
  dep) and added a source COPY (`packages/aws-secrets/`) so tsx resolves it,
  mirroring how `content` is handled.
- **`apps/chat/Dockerfile`** (local-dev / docker-compose image) — same fix. Its
  boot CMD runs `tsx src/lib/db/migrate.ts`, which hits the same
  `db/index.ts → aws-secrets` import, so `docker compose up chat` was broken too.

## Audit of the remaining Dockerfiles

The user asked to check the other apps' Dockerfiles for the same class of bug.
Findings:

| Dockerfile | Used by | Runtime strategy | Verdict |
|---|---|---|---|
| `apps/api/Dockerfile` | ECS (deploy) + compose | compiled `node dist` | OK — fixed in #1525 (`@` symlink + symlink loop) |
| `apps/form_builder_api/Dockerfile` | ECS (deploy) | compiled `node dist` | OK — fixed in #1525 (symlink loop) |
| `apps/chat/Dockerfile.ingest` | ECS (deploy) | `tsx` source (ESM) | **fixed here** |
| `apps/chat/Dockerfile` | docker-compose (dev) | `tsx` migrate then `vite dev` | **fixed here** |
| `apps/forms/Dockerfile` | docker-compose (dev) | `vite dev` (bundled) | OK — Vite inlines deps; copies all `packages/` |
| `apps/landing/Dockerfile` | docker-compose (dev) | `vite dev` (bundled) | OK — Vite inlines deps |
| `apps/form_builder/Dockerfile` | docker-compose (dev) | `vite dev` (bundled) | OK — Vite inlines deps; copies all `packages/` |
| `apps/form_builder/Dockerfile.prod` | **nothing in-repo** | Nitro `node-server` `.output` | OK — see below |

**Why `Dockerfile.prod` is not a fix (vs the subagent's flag).** An audit
subagent flagged it "CRITICAL — aws-secrets/git-publish imported but only
`.output/` is copied." Verified otherwise: (1) it is referenced **nowhere** in
this repo (no CI, compose, script, or infra) — the form_builder frontend deploys
via **Amplify** (`NITRO_PRESET=aws_amplify`, default in `vite.config.ts`), whose
build job passed in the failing run; and (2) Nitro's `node-server` build produces
a **self-contained** `.output` that bundles workspace *source* — if it didn't,
the pre-existing workspace imports (form-types, registry, content, …) would
already break it, not just aws-secrets. So copy-only-`.output` is the correct,
standard Nitro pattern. Flagged for the chat/infra team to confirm if they ever
wire Dockerfile.prod into a real deploy, but no change made.

## Verification

- Cannot build Docker images locally (no docker socket); the real test is the
  next Deploy Sandbox run after merge.
- Confirmed the chat ingest/migrate boot path imports only `aws-secrets`
  (now copied) and `content` (already copied) — no second un-provided import
  lurking. `aws-secrets/src` (index.ts, secrets.ts) is present; the package
  imports no other workspace package, only `@aws-sdk/client-secrets-manager`.

## Notes

- No ADR: bug fix in the same class as #1525, not a new principle.
- The two chat Dockerfiles still hard-code their workspace package lists. Unlike
  the api/form_builder_api images (compiled, now using a `packages/*/` symlink
  loop), these do a scoped/source-copy install for `tsx`, so a generated list
  doesn't map as cleanly — left as targeted COPYs. Worth revisiting if a 4th
  instance appears.
