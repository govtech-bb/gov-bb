# A brand-new form is valid by default (drop the Applicant Email seed) (#572)

## Context

A freshly created form failed validation out of the box. New forms seeded
**two** email processors in `makeDefaultProcessors()`
(`apps/form_builder/app/routes/builder/-recipe-reducer.ts`, added in #501):

- **MDA Email** — `recipientField: "contactDetails.email"` (non-empty, passes).
- **Applicant Email** — `recipientField: ""` (deliberately blank).

The author-time schema requires a non-empty recipient
(`recipientField: dynamic(z.string().min(1))`), so the blank Applicant Email
failed the moment the author clicked **Validate** — before they'd done anything
wrong. Plan: `docs/plans/new-form-valid-by-default-drop-applicant-email-seed.md`.

## What we did

- `makeDefaultProcessors()` now returns **only** the MDA Email processor;
  dropped the blank-recipient Applicant Email entry. Rewrote the doc comment to
  explain why no applicant-email is seeded.
- Updated the seeding/RESET tests in `-recipe-reducer.spec.ts`: two→one
  processor, replaced the "seeds a blank Applicant Email" assertion with a
  "does not seed a blank-recipient processor" guard, re-indexed the MDA Email
  test to `[0]`, and dropped the now-stale `[1]` id assertion in the
  consecutive-resets test.

## Why we did it that way

- **Stop shipping an invalid scaffold — don't weaken validation.** The runtime
  independently re-checks `recipientField` (`min(1)`) at resolve time
  (`resolvedProcessorSchema`), so a blank recipient can never silently deliver
  to nobody. The right fix is to not seed something invalid, not to relax the
  schema for *all* email processors (which would stop warning an author who adds
  one and forgets the recipient). An author-added applicant-email processor
  still starts blank and is *correctly* flagged until configured.
- **Drop the Applicant Email seed only — keep MDA Email.** Considered dropping
  all seeding (since AI-generated forms may not include these processors), but
  decided with the user to keep the valid MDA Email seed as a sensible default;
  the problem was only the *blank* seed.
- **Kept the `"MDA Email"` label** even though it's now the only seed — still
  accurate, and harmless.

## Out of scope (verified unaffected)

- The **+ Add Processor** flow (`makeDefaultProcessor("email")`) — author-added
  email processors stay blank-then-validated.
- The AI form-generation path (`system-prompt.ts`) — separate recipient guidance.
- `-processors-editor.spec.tsx` fixtures that reuse the "Applicant Email" /
  "MDA Email" labels — they test editor rendering, not the seed.
