# gov-bb — Monorepo Specification

A modular form component system for Barbados government services. This repository is the root of a TypeScript monorepo that houses multiple applications and shared libraries powering form authoring, submission, content, and AI-assisted experiences.

---

## 1. Repository Layout

```
gov-bb/
├── apps/             # Deployable applications (frontends, APIs, AI services)
├── packages/         # Shared, workspace-internal libraries (@govtech-bb/*)
├── docs/             # ADRs, plans, testing strategy, AI guardrails
├── scripts/          # SQL seeders and generator scripts
├── sql/              # Additional SQL assets
├── .github/          # CI/CD workflows
├── .husky/           # Git hooks (pre-commit, pre-push)
├── docker-compose.yml
├── docker-compose.dev.yml
├── amplify.yml
├── nx.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

The workspace is declared in `pnpm-workspace.yaml` with the globs `apps/*` and `packages/*`.

---

## 2. Languages & Runtime

- **Primary language:** TypeScript (v5.7.x) across every app and package.
- **Runtime:** Node.js **>= 20** (CI pins to Node 20).
- **Module style:** Strict TypeScript with ES2022 target and TypeScript project references.
- **Path aliases** (`tsconfig.base.json`): `@govtech-bb/form-builder`, `@govtech-bb/form-types`, `@govtech-bb/form-conditions`, `@govtech-bb/form-validation`, `@govtech-bb/registry`, `@govtech-bb/database`, plus app-local aliases like `@forms/*`.

---

## 3. Build Tools & Monorepo Orchestration

| Concern | Tool |
|---|---|
| Package manager | **pnpm v11.6.0** (enforced via `packageManager` in `package.json`) |
| Workspace layout | **pnpm workspaces** |
| Task orchestration & caching | **Nx v22.6.5** |
| Type checking | TypeScript project references (`tsc -b`) |
| Testing | **Vitest 4** is the standard runner across the monorepo (Jest has been removed); `apps/chat` uses the Node test runner (`tsx --test`) |
| Linting | **ESLint** (flat config, `eslint.config.mts`) with `typescript-eslint`, `@eslint/json`, `@eslint/css` |
| Formatting | **Prettier** — double quotes, trailing commas, semicolons, 80-column width, 2-space tabs |
| Secret scanning | **gitleaks** (optional pre-commit) |
| Git hooks | **Husky** + **lint-staged** |

### Nx configuration

- `nx.json` sets the default base branch to `main`.
- Build targets depend on `^build` (upstream-first) and are cached.
- `lint` and `test` targets are also cached.
- Each app/package contains a `project.json` describing its Nx targets.

### Key root scripts (from `package.json`)

- `pnpm build` → `nx run-many -t build`
- `pnpm lint` → `nx run-many -t lint`
- `pnpm test:all` → `nx run-many -t test`
- `pnpm format` / `pnpm format:check`
- `pnpm dev:<app>` → `nx dev <app>` (e.g. `dev:forms`, `dev:api`, `dev:landing`)
- TypeORM migration commands (`migration:create`, `migration:generate`, `migration:run`, `migration:revert`, `migration:show`) driven from `apps/api/typeorm.config.ts`.

---

## 4. Apps (`apps/`)

Each app is an independently deployable TypeScript project with its own `project.json` (Nx) and, where applicable, a `Dockerfile`. Apps consume the shared `@govtech-bb/*` packages via the `workspace:*` protocol.

Current apps (see each app's own README/SPEC for detail):

| App | Role | Stack | Port |
|---|---|---|---|
| `api` | Form definitions, submissions, processor dispatch (email/payment/spreadsheet) | NestJS + TypeORM | 3001 |
| `forms` | Public multi-step forms SPA | Vite + TanStack Router/Form | 3000 (Docker host 4200) |
| `landing` | Public service-discovery site | TanStack Start + Nitro (SSR) | 3000 |
| `chat` | "Ask alpha.gov.bb" RAG assistant | TanStack Start + AWS Bedrock + pgvector | 3000 |
| `form_builder` | Form recipe authoring tool | Vite + TanStack Start (Nitro) | — |
| `form_builder_api` | Backend for the form builder (recipe CRUD, validation, AI conversion) | Express 5 | 3003 |

Shared app conventions:
- TypeScript everywhere, with each app pinning its own `tsconfig.json` that extends `tsconfig.base.json`.
- React-based frontends use **Vite**, the **TanStack** ecosystem (Router/Query/Start), and **Tailwind CSS**.
- Backends use **NestJS** with **TypeORM** against PostgreSQL.
- Most apps ship a `Dockerfile` for containerized deployment.

---

## 5. Packages (`packages/`)

All packages are **workspace-internal** (`"private": true`), namespaced under `@govtech-bb/*`, and built with Nx's `@nx/js:tsc` executor into `dist/packages/<name>`. Cross-package dependencies use the `workspace:*` protocol.

| Package | Role |
|---|---|
| `@govtech-bb/form-types` | Foundational TypeScript + Zod definitions for the form domain |
| `@govtech-bb/form-builder` | Core form schema authoring and manipulation utilities |
| `@govtech-bb/form-conditions` | Conditional rendering & logic primitives for forms |
| `@govtech-bb/form-validation` | Field validation rules and runtime checks |
| `@govtech-bb/registry` | Component/form registry with runtime type information |
| `@govtech-bb/expressions` | JSON Logic + Luxon-based expression evaluation engine |
| `@govtech-bb/database` | TypeORM-backed persistence layer |
| `@govtech-bb/content` | Browser-safe Markdown/YAML content loading with Zod schema validation |
| `@govtech-bb/analytics` | Shared Umami analytics helper (forms, landing) |
| `@govtech-bb/ai-bedrock` | AWS Bedrock / Claude adapter (chat, form_builder_api) |
| `@govtech-bb/aws-secrets` | Shared AWS Secrets Manager helper |
| `@govtech-bb/git-publish` | Shared GitHub publish client for recipe deploys |

> `packages/preview-comments` is an empty stub (no `package.json` or source)
> and is a candidate for removal.

Conventions:
- Entry points exposed via `main`/`types` (or `exports`) pointing at `./src/index`.
- Each package owns its own `vitest.config.ts` for unit tests (Vitest 4).
- Linting and formatting are uniform across all packages via shared root config.

---

## 6. Local Development Environment

`docker-compose.yml` defines the full local stack; `docker-compose.dev.yml` overlays bind-mounts for hot reload during development.

Services:
- **postgres** — `pgvector/pgvector:pg16` on port `5432` (PostgreSQL with vector extension).
- **api** — NestJS backend on port `3001`, health-gated on Postgres.
- **forms** — Forms frontend on host port `4200` (container `3000`).
- **landing** — Public landing site on port `3000`.
- **chat** — RAG/LLM assistant (Claude on AWS Bedrock + pgvector embeddings).
- **form_builder** — Form recipe authoring tool.

Environment variables are templated in `.env.docker.example` and cover database credentials, CORS origins, Anthropic/AWS keys, the EzPay payment integration, and a `SEED_ON_BOOT` flag that pre-populates example form definitions.

---

## 7. Database & Migrations

- **PostgreSQL** is the system of record, with the `pgvector` extension enabled to support embedding-based search for the chat service.
- **TypeORM** is the ORM, configured from `apps/api/typeorm.config.ts`.
- Migrations live under `apps/api/src/database/migrations/` and are managed via the root `pnpm migration:*` scripts.
- `DB_SYNCHRONIZE=true` is permitted **only** in development — never in production.

---

## 8. AI Integration

Two distinct AI capabilities are integrated into the monorepo:

- **RAG chat assistant** — Anthropic Claude (default model `claude-haiku-4-5`) with AWS Bedrock embeddings, backed by `pgvector` for retrieval.
- **AI-assisted form authoring** — surfaced through the form builder; the `docs/form-builder-ai-guardrails.md` document captures the guardrails for LLM-driven schema generation.

---

## 9. CI / CD

### GitHub Actions (`.github/workflows/`)

- `ci.yml` — Build + test on PRs targeting `sandbox`/`dev` (no deploys).
- `pr-preview.yml` — Spins up an Amplify preview per PR; guards against dotted branch names.
- `forms-smoke.yml` — Reusable workflow that drives real form submissions against a deployed environment.
- `deploy-sandbox.yml` — Sandbox deployment; runs the live forms smoke jobs post-deploy.
- `deploy-prod.yml` — Production deployment.
- `zizmor.yml` — GitHub Actions security analysis.
- `assign-author-to-issues.yml`, `archive-merged-drafts.yml`, `project-automation.yml` — repo/project automation.

### Deployment targets

- **Frontend apps (landing, forms)** — AWS Amplify, driven by `amplify.yml`. The build pipeline installs `pnpm@10.30.0`, runs `pnpm install --frozen-lockfile`, then dispatches `pnpm exec nx run` targets per app. Artifacts ship with strict security headers (HSTS, CSP, `X-Frame-Options: DENY`). The Nx cache (`.nx/cache/**`) is cached between builds.
- **API** — Containerized via Docker, deployed to AWS Fargate with images pushed to ECR.

### Git hooks (`.husky/`)

- `pre-commit` — Runs `lint-staged` and (if installed locally) `gitleaks`.
- `pre-push` — Full TypeScript build (`pnpm exec tsc -b --pretty --verbose`).

---

## 10. Documentation (`docs/`)

- `decisions/` — Architecture Decision Records.
- `plans/` — Active feature and initiative plans.
- `summaries/` — Coverage analyses and snapshots.
- `testing/` — Test strategy and coverage policy.
- `superpowers/` — Auxiliary tooling notes.
- `form-builder-ai-guardrails.md` — Guardrails for LLM-assisted form authoring.

---

## 11. Notable Conventions

- **Type safety end to end** — Zod schemas + TypeScript types are shared across apps via the `@govtech-bb/*` packages so form structures, validation, and persistence stay aligned.
- **Single source of truth for form schemas** — `form-types` underpins `form-builder`, `registry`, `database`, and downstream consumers.
- **Nx-cached pipelines** — `build`, `lint`, and `test` are cached locally and on Amplify; respect `^build` ordering to avoid stale outputs.
- **Workspace protocol everywhere** — inter-package references always use `workspace:*` rather than version pins.
- **Forced lockfile installs** in CI/Amplify (`pnpm install --frozen-lockfile`).
