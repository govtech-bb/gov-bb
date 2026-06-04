# Per-formId kill switch (PR 3 of GitHub publish phasing)

## Context

PR 3 of the 5-PR form-builder-GitHub-publish phasing. Plan lived at
`docs/superpowers/plans/2026-05-22-kill-switch.md` (committed on `claudesiah/dev`,
not in this branch). PRs 1–2 had not landed, so the plan applied cleanly.

The goal: let ops disable a broken form at runtime without a redeploy by writing
a row to `form_disabled_overrides`. `GET /form-definitions/:formId` short-circuits
to `410 Gone` with body `{ disabled: true, reason }` when an override exists.

## What we did

- Built `FormDisabledOverridesModule` (entity, repo, service, admin controller,
  DTO, hand-written migration) under `apps/api/src/forms/form-disabled-overrides/`.
- Short-circuited `FormDefinitionsController.get` to throw a 410 `HttpException`
  with the spec-mandated body when an override exists.
- Drove implementation via subagents — fresh agent per task, each completing
  one TDD red→green cycle and committing — to keep the main session focused on
  coordination.
- Verified end-to-end against a real local Postgres: migration ran, schema
  matches expectations, smoke spec passes.
- Out-of-plan fix: the migration glob in `data-source.ts` ate the new smoke
  spec. Switched it to extglob `!(*.spec){.ts,.js}` (commit `440b15f`).

## Why we did it that way

**Per-formId, not per-version.** Disabling a form disables every published
version of it. The override table has `form_id` as the single PK column.
Per-version disabling was rejected: it's not what ops actually wants when a
form is broken, and adding it later is one extra PK column + a query change.

**Throw `HttpException`, not a custom filter.** NestJS serializes the response
argument verbatim when it's an object, so `throw new HttpException({ disabled:
true, reason }, 410)` yields exactly the spec-mandated body. No bypass of the
global filter, no envelope shape change for this one path. Considered emitting
the disabled response through `ApiResponse.success` with a 410 — rejected
because the spec is explicit that the body shape is the bare object, and
clients should branch on HTTP status not envelope status.

**No application-level auth on admin endpoints.** The controller's class
docstring spells this out. Auth lands in issue #11; until then admin endpoints
are network-ACL'd at the load balancer and `disabledBy` is passed in the body.
Adding a stub guard now would be churn — #11 already plans to replace the
body-supplied identifier with the authenticated principal.

**`findAll` does NOT filter disabled forms.** Documented trade-off in the
controller comment. Ops still sees the form in the list; they correlate by
hitting the per-form GET (which returns 410) or the admin status endpoint.
Filtering would have meant joining `form_disabled_overrides` into the list
query and changing the response semantics for unauthenticated callers — out
of scope for a PR billed as "minimal kill switch."

**Migration glob fix.** TypeORM's CLI loads every `.ts`/`.js` in the migrations
folder. The plan's smoke spec is in that folder so Jest can pick it up too;
without the glob fix, `migration:show` crashed on `describe is not defined`.
Moving the spec out of the folder was an alternative — rejected because the
dynamic filename-resolution logic in the spec (which tolerates timestamp
rebases) is cleaner when the spec lives next to the file it loads. The new
glob is also defensive: any future `*.spec.ts` in the migrations folder is
automatically excluded.

## Open questions

- The curl-based e2e (Task 15 of the plan) was not run in this worktree. The
  workspace's runtime module resolution for `@govtech-bb/form-types` expects a
  `src/index.js` co-located with `src/index.ts`, which only the Nx dev pipeline
  produces. Unit tests cover the same paths (4 short-circuit specs + 4 admin
  controller specs + 6 service specs), so the marginal coverage from curl is
  small. The user can run Task 15 on their normal dev environment after merge
  if they want full e2e sign-off.

## What we almost got wrong

- First pass at workspace package builds left `packages/form-types/dist/` out
  of sync with `package.json#main`, which only became visible when trying to
  boot the API. Caught early; recorded here so a future reader doesn't waste
  time chasing it as a kill-switch bug.
