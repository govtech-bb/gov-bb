# Recipe loader: non-fatal failures and non-prod error passthrough

## Context

Issue [#343](https://github.com/govtech-bb/gov-bb/issues/343). Before this
change, a malformed recipe file (`formId` mismatch, filename-version
mismatch, zod-fail, JSON.parse fail, even a read error) threw out of
`RecipeFileLoaderService.loadAll`, which runs in `onModuleInit`. That
crashed the API at boot, which on ECS rolled back the deploy, while
operators had only CloudWatch to find out *which* recipe was at fault.
Implemented from `docs/plans/recipe-loader-error-debuggability.md` on
branch `claudesiah/recipe-loader-error-debuggability` (merges into
`sandbox`).

## What we did

- **Loader** (`apps/api/src/forms/form-definitions/recipe-file-loader.service.ts`):
  moved the try/catch boundary inside the per-file loop. The same four
  throw sites (read, JSON.parse, zod, filename mismatch, formId mismatch)
  now hit a per-file `logger.error(...)` with file path + formId + error
  name + message, and `loadAll` continues with the next file. A formId
  whose every file failed simply stays out of the store — the existing
  404 path takes over.
- **Loader spec** (`recipe-file-loader.service.spec.ts`): the three
  `.rejects.toThrow(...)` cases (zod-fail, filename-version mismatch,
  formId mismatch) became "skips the bad recipe, logs the cause"
  assertions, with a `Logger.prototype.error` spy. Added a mixed-fixture
  test: one valid formId + one invalid formId → only the valid one
  appears in `findAll()`.
- **Filter** (`apps/api/src/common/exception.filter.ts`): `parseException`
  now returns `errorInfo: { name, message }` for non-`HttpException`
  `Error`s when `NODE_ENV !== "production"`. `catch()` adds that to the
  response body as `meta.error`, alongside the existing `meta.errors` for
  validation. Prod path is unchanged.
- **Filter spec** (`exception.filter.spec.ts`): added a non-prod test
  asserting `meta.error.name` + `meta.error.message`, and a prod test
  asserting `meta` is undefined and the generic message is unchanged.
  `NODE_ENV` is saved in `beforeEach` and restored in `afterEach`.
- **ADR-0015** records the env-gating principle for future error classes
  / filter branches.

## Why we did it that way

- **Per-file try/catch, not per-formId.** A formId with one bad version
  and one good version still serves the good version under
  `findByFormId({ formId })` (the latest valid one wins). Per-formId
  would have dropped the entire formId on a single bad file — coarser
  than needed.
- **Env gate inside `parseException`, not inside `catch()`.** One policy
  chokepoint. The call site never knows about `NODE_ENV`. A future filter
  branch that wants to add a different exception class just populates (or
  doesn't populate) `errorInfo` and the env gate stays load-bearing in
  one place — see ADR-0015.
- **`meta.error` as a sibling of `meta.errors`, not an overload.**
  `meta.errors` is authored field-level validation errors and is
  surfaced in prod; `meta.error` is rogue-throw detail and is non-prod
  only. Keeping them separate means tooling that scrapes responses can
  distinguish, and the prod-vs-non-prod surface area of each is
  unambiguous.
- **Rejected: wrap loader failures as `AppError.internal(detail)`.**
  Looks more principled, but `AppError` is an `HttpException` and the
  filter surfaces those bodies unconditionally — including in prod. We
  would have had to env-gate inside `AppError` or grow a second filter
  branch. The chosen `meta.error` path keeps the env gate as the single
  chokepoint. ADR-0015 makes that constraint explicit so future
  `AppError.internal`-shaped proposals get pushed back on.
- **Log level: `error`.** Plan's stated default; matches the severity
  in the issue. Open to dropping to `warn` if it causes alert-fatigue
  downstream — pin it on the field.
- **`Logger.prototype.error` spy in the loader spec** rather than reading
  the private logger field. Tests stay decoupled from the
  `loader["logger"]` implementation detail and pick up logs from any
  Logger instance in play (only the loader's is, in this spec).

## What we almost got wrong

Not much surfaced. The existing filter spec already covered every
`HttpException` branch, so the only behavior the new tests had to pin
was the non-`HttpException` branch — easy to scope. One subtle
gotcha worth noting: jest sets `NODE_ENV=test` by default, so the
existing `"generic Error (non-HTTP) → statusCode 500"` test now
*also* receives `meta.error` (it just doesn't assert on it, and
`toMatchObject` is loose). The new explicit non-prod and prod tests
are what actually pin the behavior.

## Open questions

- **Manual API smoke test pending.** Plan suggests: corrupt one recipe
  file (e.g. `{` at top), boot `pnpm --filter api dev`, confirm the API
  boots, log line names the bad file, `GET /form-definitions` returns
  the rest, hitting the bad formId returns 404. Then with
  `NODE_ENV=production`, confirm a deliberately-thrown plain `Error` in
  any route returns the generic body. Unit tests cover all the
  behavioral pieces; the smoke is incremental confidence on the
  Nest-boot path itself.
- **Log level** (above) — `error` is the default; revisit if it causes
  alert-fatigue downstream.
