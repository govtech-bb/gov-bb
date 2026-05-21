# Remove PII Console Logs

**Audit finding:** Web #8

## Goal

Remove unconditional console calls in the `forms` app that log user-submitted field values, eliminating the PII exposure identified in audit finding Web #8.

## Approach

Delete the two offending statements outright. No `import.meta.env.DEV` guard — neither log has a legitimate debugging purpose that outweighs the risk, and deletion is permanent.

*Alternative considered:* gate behind `import.meta.env.DEV` — rejected because even dev-only logs of full submission data are an unnecessary risk on a government platform, and the logs carry no diagnostic value worth preserving.

## Scope

- Remove `console.log({ formattedData })` from the `onSubmit` handler
- Remove `console.error(\`Value ${value} for field ${fieldId} is unknown.\`)` from the validation unknown-value branch — the function already returns `"unknownState"` as a sentinel; the log adds nothing except raw field data

## Files

- `apps/forms/src/routes/forms/$formId/index.tsx` — line 108
- `apps/forms/src/lib/form-builder/validation-methods.ts` — line 70

## Branch

`fix/remove-pii-console-logs` off `dev`

## Verify

- Run the forms test suite — confirm no regressions
- Grep `apps/forms/src` for remaining `console.log/warn/error` to confirm no further PII-carrying calls
- Manual smoke test: submit a form in dev and confirm DevTools console shows no field data

## Open questions

None.
