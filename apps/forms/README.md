# @govtech-bb/forms

Multi-step modular forms SPA for Barbados government services. Vite + TanStack Router + TanStack React Form + Zod.

```bash
pnpm dev      # start on port 3000
pnpm test     # run Jest unit tests
pnpm build    # production build
```

See [`.env.example`](./.env.example) for environment variables.

## Testing

```bash
pnpm test          # Jest unit tests
pnpm test:e2e      # Playwright E2E vs a local dev server + the synthetic
                   # `master` form, with mocked submissions (no backend)
pnpm test:smoke    # Live smoke: drives REAL DB-backed forms end-to-end and
                   # SUBMITS FOR REAL against a deployed environment
```

The **live smoke** suite (`e2e/smoke/`, run via `playwright.smoke.config.ts`) is
kept out of the normal `test:e2e` / `nx test` run. By default it targets
`https://forms.sandbox.alpha.gov.bb`; override with `SMOKE_BASE_URL`:

```bash
# Against the deployed sandbox (default):
pnpm exec nx run forms:smoke

# Against a local stack (Vite :3000 + API :3001 pointed at a real S3 bucket
# via `aws sso login`):
SMOKE_BASE_URL=http://localhost:3000 pnpm --filter @govtech-bb/forms test:smoke

# Just the temp-teacher form:
pnpm --filter @govtech-bb/forms exec playwright test \
  --config playwright.smoke.config.ts temp-teacher-application.smoke.spec.ts
```

**In CI:** the `temp-teacher-application` smoke spec runs automatically after a
sandbox forms deploy — see the `smoke-test-forms` job in
[`deploy-sandbox.yml`](../../.github/workflows/deploy-sandbox.yml). It submits a
real application (recipient `testing@govtech.bb`) on every forms deploy.

## Analytics (Umami)

The forms app sends pageview and curated form-funnel events to [Umami Cloud](https://umami.is/) when configured.

### Enabling

Set `VITE_UMAMI_WEBSITE_ID` (and optionally `VITE_UMAMI_SRC`) in the deploy environment. See [`.env.example`](./.env.example) for the contract. When the variable is unset (including in local `pnpm dev`), no script is loaded and no events are sent — keeping dev traffic out of the dataset.

### How it works

- **Script injection** happens in `src/main.tsx`, gated on `VITE_UMAMI_WEBSITE_ID`. The script is loaded with `data-auto-track="false"` so pageviews come from a single deterministic source — the TanStack Router subscriber.
- **Pageviews** fire from `router.subscribe('onResolved', trackPageview)` in `src/main.tsx` — one event per resolved route, including step changes via the `?step=` search param.
- **Form-funnel events** are fired from React effects and event handlers, never from `data-umami-event` attributes. See the helper at [`src/lib/analytics.ts`](./src/lib/analytics.ts) (`trackEvent`, `trackPageview`) — both no-op when `window.umami` is absent.

### Event taxonomy

A small fixed set of event names; high-cardinality dimensions (`form_id`, `step_id`, `field_id`, `reason`) go in event data. This keeps Umami's dashboard sane — every new form/step/field doesn't add a new metric.

| Event name | Fires when | Data |
|---|---|---|
| `form-open` | Form route mounts | `form_id` |
| `form-step-view` | A step becomes the resolved step | `form_id`, `step_id`, `step_index`, `step_count` |
| `form-step-advance` | User advances past a step (non-repeatable transitions) | `form_id`, `from_step`, `to_step` |
| `form-step-back` | User goes back a step | `form_id`, `from_step`, `to_step` |
| `form-field-error` | A field fails client-side validation on advance-attempt | `form_id`, `step_id`, `field_id`, `reason: 'validation'` |
| `form-submit` | Submit button clicked | `form_id` |
| `form-submit-success` | Submission API returns success / pending_payment | `form_id`, `step_count` |
| `form-submit-error` | Submission API returns failed/error or network throws | `form_id`, `reason: 'server' \| 'network'` |
| `form-file-select` | User picks a file in a file-upload field | `form_id`, `step_id`, `field_id`, `mime`, `size_kb` |

### Privacy

The forms app handles PII. The analytics layer enforces:

- **Never captured:** field values, field labels, free-text field input, filenames.
- **Always OK:** field IDs (stable, code-defined via `field.fieldId`), step IDs, form IDs, MIME types, file sizes in KB, validation reason categories.

If a future form ever uses a `field_id` that contains user-supplied content, revisit before adding it to events.
