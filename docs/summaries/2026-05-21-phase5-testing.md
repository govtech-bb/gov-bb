# Phase 5 testing coverage — spec improvements and threshold ratchets

## Context

Phase 5 of the testing improvement plan targeted 90% coverage across all workspaces. Phases 1–4 (prior sessions) had laid down tooling, API specs, schema specs, and the initial forms component specs. This session continued from that state, improving the four remaining Phase 3 component specs (`form-error`, `routes/index`, `file-upload`, `review`) and ratcheting coverage thresholds for `apps/api`, `apps/forms`, `packages/form-types`, and `packages/form-conditions`.

Work ran on the `test/increase-coverage` branch (created during the session by merging `dev` after `fix/remove-pii-console-logs` was merged via PR #47).

## What we did

- **`form-error.spec.tsx`** — new spec covering three error-type branches (404, network, generic), reset callback, homepage link, and axe audit. Consolidated duplicate "Try again" assertions; added `userEvent.setup()` for click test; added href assertion on the homepage link.
- **`routes/index.spec.tsx`** — improved existing spec: replaced direct `Route.useLoaderData` mutation with `jest.spyOn` so `restoreAllMocks` cleans up correctly; added href assertion to verify link wiring; fixed `mockForms` type.
- **`file-upload.spec.tsx`** — improved existing spec: scoped file-input lookup to `result.container.querySelector` (was `document.querySelector`, which would return wrong element in multi-render scenarios); tightened the max-size display regex from `/--/` to `/Max Size:.*--/i`.
- **`review.spec.tsx`** — added display-value formatting tests (select/date/file/radio/checkbox/default) to existing spec; added file-with-names test; made date assertion locale-independent by deriving the expected string the same way the component does; added Change-link click test verifying `mockNavigate` is called.
- **Threshold ratchets** — `apps/forms` (13/14/23/24), `apps/api` (62/72/80/81), `packages/form-types` statements 63, lines 65. `packages/form-conditions` had no room to ratchet (calculated actual−2 was below current thresholds).
- **ADR 0003 updated** — Exemption 2 ("apps/forms functions deferred") closed out as a permanent exemption; see `docs/decisions/0003-90pct-coverage-target-and-exemptions.md`.

## Why we did it that way

**DOM-scoped selectors vs document.querySelector.** The `file-upload.spec.tsx` helper was querying `document.querySelector` for the hidden file input. This works when there is exactly one rendered component in the DOM at a time, but in a shared jsdom environment multiple renders can coexist across tests if cleanup is incomplete. `result.container.querySelector` scopes the lookup to the specific render tree — more correct and eliminates the fragility.

**`jest.spyOn` over direct property mutation.** The original `routes/index.spec.tsx` assigned `Route.useLoaderData = jest.fn(...)` directly. `jest.restoreAllMocks()` only restores spies created via `jest.spyOn`; direct assignments persist across tests and suites. The fix costs nothing and makes teardown reliable.

**Locale-independent date assertion.** The `review.spec.tsx` date test originally hardcoded `"Jan 01 2026"`. `Date.toDateString()` is system-locale-dependent and produces different strings on non-English CI runners. Computing the expected string with the same chain the component uses (`toDateString().trim().replace(/^\w+\s/, "")`) makes the test environment-agnostic, at the cost of not catching bugs in the formatting logic itself — an acceptable trade-off given the switch branch is still exercised and a formatting change in the component would require updating both the component and the derivation.

**forms functions threshold at structural floor.** Phase 3 measurements produced 16.72% functions for `apps/forms`. The gap is entirely `form-renderer.tsx` and `routes/forms/$formId/index.tsx`. Both require mocking TanStack Form, TanStack Router, and draft state simultaneously; the result would test mocks rather than components. The Playwright suite covers these paths with real user journeys. Adding unit tests here was rejected in favour of accepting the permanent exemption. See ADR 0003.

**api branches still at 64.89%.** The API branches threshold was ratcheted to 62 (actual−2), not raised to the plan's target of 88. The Phase 2 spec additions (metrics service, repository specs) didn't move the needle significantly on branches. Reaching 88% branches in `apps/api` would require inspecting the HTML coverage report and targeting the specific uncovered conditionals in `SubmissionsService`, `SpreadsheetProcessor`, and `RegistryService.hydrateForm` — deferred to a future session.

## Open questions

- `apps/api` branches at 64.89% (target: 88%). Phase 2 specs exist but didn't close the gap. Next step: open the HTML coverage report, identify the top uncovered branch lines, write targeted tests.
- `apps/forms` statements/lines/branches coverage is low overall (26.9%/15.4%/25.03%). This is structural: the forms app denominator includes many untested files (form-renderer, routes, stores). The numbers will improve if more leaf components get unit specs; improving the big components requires the E2E-or-unit scope decision already resolved in ADR 0003.
