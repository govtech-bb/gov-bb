# CMS taxonomy and categories — draft plan

## Context

Add taxonomy/category management to GovBB's existing CMS using its existing components and dependencies. Planning only; no implementation before approval.

### Initial findings

- There are two plausible targets: the current `apps/editor_v2` + PostgreSQL-backed `apps/api_v2`, and the older Git/PR-backed content CMS in `apps/form_builder`.
- `api_v2` already stores categories/subcategories and exposes public `/categories` reads plus employee-only `GET /taxonomy`; pages have one `category_id`, and child pages inherit the parent's placement. Its documented HTTP surface has no category mutation endpoints.
- `editor_v2` already fetches taxonomy for page creation and Markdown/category conversion. Extend these flows rather than create another category source.
- The older CMS writes `packages/content/src/categories.ts` through GitHub; ADR 0056 establishes that as the legacy apps' shared source. Avoid accidentally updating the wrong CMS or introducing another mirror.
- Existing uncommitted editor work and other plans are present. Preserve them; use this separate plan file.

## Approach

Provisional: extend category management using the selected CMS's existing storage, auth, editing, and navigation patterns. Decide whether this is category CRUD alone or a general taxonomy/term system after requirements are clarified.

### Decisions to clarify

1. Target the v2 editor/API or the older form-builder CMS?
2. Categories/subcategories only, or categories plus tags/custom taxonomies? One category or multiple classifications per page?
3. CMS-only organization, or citizen-facing listings/filtering too? Must existing page/category URLs remain stable?

## Files to modify

Pending scope confirmation and code exploration. Likely areas for the v2 target:

- `apps/api_v2/src/modules`, `src/services`, `src/adapters`, `src/routes`: category rules, persistence, authenticated API contracts.
- `apps/editor_v2/src/api`, `src/routes`, `src/workspace`: API client/query hooks, management UI, page assignment.
- Public landing consumers and migrations only where the confirmed behavior requires them.

## Reuse

- `apps/api_v2/README.md`: architecture, authentication, write-origin protection, public category hierarchy, transactional page history and PostgreSQL test setup.
- `apps/editor_v2/src/api/client.ts`: existing `taxonomy()` read and generated `TaxonomyCategory` type.
- `apps/editor_v2/src/api/page-markdown.ts`: existing page/category conversion and `pickerCategories`.
- `apps/editor_v2/src/workspace/remote-page-dialogs.tsx`: existing category selection for new pages.
- `packages/content/src/categories.ts`: legacy taxonomy source; only touch if the legacy CMS is the agreed target.

## Steps

- [ ] Confirm the CMS target and taxonomy behaviors; document the supported model and required changes.
- [ ] Add only the required storage/domain/API behavior, preserving existing content, access controls, and URL contracts.
- [ ] Add taxonomy management and assignment to existing editor flows using existing components.
- [ ] Verify integration, regression coverage, public behavior where applicable, and document the supported workflow.

## Verification

- Add regression tests for category validation, assignment, hierarchy, deletion safety, authorization, and existing content compatibility according to the agreed scope.
- Run affected API/editor tests, type checks, and builds; API integration tests require local PostgreSQL.
- Before any later commit/push, run `pnpm exec nx run-many -t build --exclude=landing` and relevant tests; report environment blockers explicitly.
- Manually create/edit a category, assign content, reopen the editor, and check affected citizen-facing listings without changing unrelated content.
