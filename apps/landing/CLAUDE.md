# CLAUDE.md — apps/landing

The alpha.gov.bb services site. Nx project `landing`; TanStack Start + Nitro (`aws_amplify` preset)
SSR on Amplify compute. Read the root `CLAUDE.md` first; this file adds what is specific here.

## Content

- Service pages are markdown with YAML frontmatter under `src/content/` — a flat `<slug>.md` for a
  combined page, or `<slug>/index.md` plus `<slug>/start.md`. Frontmatter is validated by
  `src/lib/frontmatter.ts` (shared schema: `packages/content/src/schemas.ts`). Every page edit goes
  through the `service-page-content` skill; it owns the heading patterns, the Start button and the
  route-list rewrite rules.
- `vite-plugin-markdown.ts` compiles the markdown to modules at build time, keeping the parser out
  of the client bundle.
- Code-route feature modules live as a folder under `src/routes/<url>/` with route files plus
  dash-prefixed siblings (`-meta.ts`, `-ui/`, `-data/`, `-lib/`) that TanStack Router ignores as
  routes. `packages/content/src/load-feature-routes.ts` discovers the `-meta.ts` `META` exports for
  the services index. Example: `src/routes/health-and-emergency-services/water-outages/`.
- Form availability is resolved at runtime by a server function (`src/lib/available-forms.ts`,
  ADR 0030), not baked in at build. The build is `vite build && node scripts/check-no-secret-leak.mjs`
  and works offline.

## Secrets and config

Secrets are baked into Nitro `runtimeConfig` in `vite.config.ts` because the Amplify SSR Lambda
never sees Console environment variables. Never read them from `process.env` at request time; add
new ones the same way and let `check-no-secret-leak.mjs` prove they stay out of client assets.

## Checks

- `pnpm exec nx run landing:test` covers the content registry, the frontmatter contract and the
  markdown plugins. Never run it while `landing:dev` is running — both write `routeTree.gen.ts` and
  thrash each other.
- Type checking is its own target, `pnpm exec nx run landing:typecheck`; the root `tsc -b` does not
  include this app. `pnpm typecheck` runs both.
- `README.md` here documents routing, analytics events, Start-now buttons and the `visibility`
  rollout gate; `SPEC.md` and `SEARCH.md` cover the product and search behaviour.
