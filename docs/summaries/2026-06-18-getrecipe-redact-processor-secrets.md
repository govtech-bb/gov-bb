# Redact processor secrets from getRecipe (#294)

/ 2026-06-18 · `apps/form_builder`

## What this was

`getRecipe` returned the full recipe — including processor secrets — to the
browser, where it's reachable via DevTools, a malicious extension, or XSS. The
live leak was the webhook HMAC `secret` / `auth.secret` and the opencrvs
`token`. (Payment config already lives only in the DB `form_config` sidecar,
ADR 0033, so it wasn't the issue here.) Fix: keep those secrets off the wire.

## Approach (and why)

Chosen with the owner: **redact-on-read + restore-on-save**, self-contained in
`form_builder`, scoped to `getRecipe` only.

- **New `redact-processor-secrets.ts`** — a known-field redactor (no change to
  the shared `@govtech-bb/form-types` package). `redactRecipeSecrets` swaps each
  present secret for a `__REDACTED__` placeholder; `restoreRecipeSecrets` puts
  the real value back, matching processors by `type` + position;
  `assertNoRedactedSecrets` fails closed.
- **`forms.ts`** — extracted `resolveStoredRecipe` (the draft-vs-published
  precedence) so `getRecipe` *and* the save path resolve the secret from the
  same source. `getRecipe` returns the recipe redacted. `submitRecipe` /
  `updateRecipe` / `rekeyRecipe` restore secrets before forwarding — only when a
  placeholder is actually present, so secret-free saves make no extra fetch.

The hard part is the save round-trip: the editor never renders these fields but
carries them forward, so a naive redaction would persist the placeholder over
the real secret. Restore-on-save (secrets are server-authoritative) avoids that.

### Two deliberate deviations from the plan, both toward safety

1. **Fail loud, not silent-omit.** The plan said "if no stored counterpart,
   leave the secret absent." A test showed that silently *drops* the secret, so
   restore now leaves the placeholder and `assertNoRedactedSecrets` throws —
   a save can never blank or wipe a webhook secret.
2. **Restore reads draft *or* published** (via `resolveStoredRecipe`), not just
   the draft, so editing a published-only form doesn't lose its secret.

### Alternatives rejected

- Schema discriminator in `form-types` (issue option 3) — cleanest but edits a
  shared package; overkill for three fields.
- Separate stricter `getProcessorsConfig` endpoint (option 2) — unnecessary, the
  UI never needs the secret.

## Out of scope

`getFormConfig` still returns the DB sidecar's payment `department`/`paymentCode`
to the browser unredacted — same class of leak, deliberately deferred. Worth a
follow-up issue.

## Verification

- `nx run form-builder-app:build` clean.
- `nx run form-builder-app:test` — 646 pass, incl. 9 new redaction/restore specs
  and the unchanged existing `forms.spec.ts` getRecipe/save tests.
