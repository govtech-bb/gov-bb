# Save a draft despite validation errors

## Context

The form builder gated **Save draft** on validation the same way it gates
**Deploy**: `handleSaveDraftClick` only opened the version-entry `SubmitModal`
when `runValidation()` returned valid. That blocked a useful collaboration flow
— an in-progress, not-yet-valid form couldn't be saved for someone else to open
and review. The backend already stores recipes as-is on save (no contract
validation on `POST`/`PUT /builder/forms`), so the only barrier was this UI
gate.

## What we did

- `apps/form_builder/app/routes/builder/ui/index.tsx`: rewrote
  `handleSaveDraftClick` so an **invalid** result prompts
  `window.confirm("…Save it as a draft anyway so others can review it?")`; on
  confirm (or when valid, with no prompt) it opens the `SubmitModal` exactly as
  before. `handleDeployClick` is unchanged — deploy stays hard-gated on
  validity.
- `index.spec.tsx`: the pre-existing "invalid ⇒ modal stays closed" test became
  the **cancel** case (`window.confirm` → false); added an **invalid + confirm**
  case (→ true, modal opens); the valid-path test now also asserts
  `window.confirm` is never called.

## Why we did it that way

- **`window.confirm` over a styled "Save anyway?" modal.** Confirm is already
  the established pattern in this builder (AI-builder switch, form picker,
  processor removal). The validation panel already lists the actual errors, so
  the dialog only has to ask the yes/no question — a new component + React state
  would buy nothing behaviourally. Rejected the styled modal as
  over-engineering for a yes/no prompt.
- **Kept the confirm step rather than saving invalid silently.** The
  deliberate-choice gate is the whole point; a bad save should never be
  accidental.
- **Validity gates publish, not draft persistence.** This is the standing
  principle behind the asymmetry: Save draft can bypass validation (with
  consent), Deploy cannot. We considered recording it as an ADR but decided it's
  localized enough to live in the code + this summary — future builder work
  should still respect it: don't add validity gates to draft saving.
- **The `SubmitModal`'s semver check stays as a second, independent gate.**
  Bypassing recipe validation doesn't bypass version entry — an invalid draft
  still needs a valid version to save.

## What we almost got wrong

The plan's "Verify" section didn't mention that the existing unit test
explicitly asserted an invalid draft *never* opens the modal — the exact
behaviour this change inverts. Left unedited it would have silently passed
anyway (jsdom's `window.confirm` returns false by default), masking the new
confirm path. We caught it during orientation and split it into explicit
cancel/confirm cases with a mocked `window.confirm` so both branches are
actually exercised.

## Open questions

None. Scope was confirmed up front: Save draft only; version still required; no
reviewer-facing "invalid" marker beyond the existing validation panel.
