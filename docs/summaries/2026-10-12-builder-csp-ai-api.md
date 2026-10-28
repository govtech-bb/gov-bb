# Builder CSP blocked the AI assistant

2026-10-12 · `form_builder`, `amplify.yml` · #3027

## Context

On sandbox, both chat and PDF upload in the form builder's AI assistant failed
with "The AI service could not be reached." The message hid the cause.
`aiRequest` uses the same text for three different failures.

## What we did

- `amplify.yml`: the builder's CSP now allows
  `https://forms.api.sandbox.alpha.gov.bb` in `connect-src` and `blob:` in
  `img-src`.
- `transport.ts`: `aiError()` keeps the message the user sees, but logs the
  real cause and attaches it as `cause`. `transport.spec.ts` covers each of the
  three failure branches.

## Why we did it that way

**The browser console found it, not the code.** Reading the code narrowed it
to three possible failures. The user's console showed the CSP blocking the
`fetch` to `/builder/ai/documents/presign`, and blocking `blob:` thumbnails. The
browser calls `BUILDER_API_URL` directly, and the CSP only listed GitHub and
S3.

**An exact host, not `https:`.** Forms, landing and analytics use
`connect-src https:`. The builder holds a GitHub token, so we kept its policy
tight and named the one API host. The form builder only runs on sandbox. Any
new environment needs its API host added here.

**Logging the cause** means the next failure of this kind shows up in the
console instead of looking like an outage.

## Open questions

- Verifiable only after the Amplify deploy.
- form_builder_api trims `CORS_ORIGIN` entries for the token check but not for
  `cors()`. A space after a comma in the task definition would pass one check
  and fail the other.
