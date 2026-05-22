# 0003 — Form-authoring tooling lives in apps/form_builder

**Date:** 2026-05-20  
**Status:** Accepted

## Context

Before this decision, form-authoring tooling was split across three apps:

- **Manual visual builder** — `apps/form_builder/app/routes/builder/` (TanStack Start app)
- **AI builder backend** — `apps/api/src/form-builder/` (NestJS module: controller, service, Anthropic/Bedrock client, system prompt, in-memory session store)
- **AI builder chat UI** — `apps/forms/src/routes/admin/form-builder.tsx` (admin page in the end-user runtime app)

The split forced the AI chat UI to call its own backend via `fetch(VITE_API_URL)` across an app boundary with CORS, even though both processes lived in the same monorepo and talked to the same Postgres via the same `@govtech-bb/database` data source. It also made the answer to "where does new authoring tooling go?" ambiguous — every new mode (template gallery, recipe versioning UI, batch import) could plausibly live in any of the three apps.

Separately, `apps/forms/src/lib/form-builder/` is a runtime helper library that renders forms at submission time. It happens to share the name "form-builder" but is unrelated to authoring tooling, and is intentionally **excluded** from this principle.

## Decision

All form-authoring tooling — manual builder, AI builder, and any future authoring mode — lives in the standalone `apps/form_builder/` TanStack Start app. Authoring tools do not run inside `apps/api/` (the NestJS submission backend) or `apps/forms/` (the end-user runtime).

This was operationalized by:

- Moving the AI backend into TanStack Start server functions at `apps/form_builder/app/server/ai-builder/`.
- Moving the chat UI to `apps/form_builder/app/routes/builder/ai/`.
- Restructuring `/builder` as a landing chooser, with `/builder/ui` (manual) and `/builder/ai` (AI) as siblings.
- Removing the NestJS `FormBuilderModule` and the `apps/forms` admin page entirely.

## Consequences

**Positive:**
- One mental model: "to author a form, go to `apps/form_builder`."
- New authoring features add server functions in `app/server/` and routes in `app/routes/builder/`, with no cross-app CORS hops.
- The AI builder and the manual builder share `getDataSource()`, so a recipe published via AI is immediately visible in the manual builder's form picker.
- `apps/api` is leaner: no AI SDKs (`@anthropic-ai/sdk`, `@aws-sdk/client-bedrock-runtime`) and no `AI_*` env vars to validate.

**Negative / tradeoffs:**
- The `apps/form_builder` app now bundles the Anthropic + Bedrock SDKs even when only the manual builder is used. Acceptable because the AI client lazy-loads them via dynamic `import()`.
- The previously-public `POST /form-builder/sessions/...` HTTP endpoints are gone. Any external integration that relied on them must move to calling the server functions via TanStack Start's RPC, or be rebuilt as a server function consumer.

**Out of scope (deferred):**
- Renaming `apps/forms/src/lib/form-builder/` to disambiguate it from the authoring app.
- Unifying the AI builder's immediate-publish flow with the manual builder's draft→publish flow. They coexist for now.
- Adding auth to `/builder/*`. Both modes remain open inside the app.
