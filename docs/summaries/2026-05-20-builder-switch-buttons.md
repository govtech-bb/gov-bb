# Builder Switch Buttons — Implementation Session

**Date:** 2026-05-20
**Branch:** `platform/merge-builders`

## Context

`/builder/ui` and `/builder/ai` already coexisted in the form_builder app after the recent AI builder move. The only way to get from one to the other was to navigate back to the `/builder` landing chooser. This session added direct switch buttons in both directions.

## What we did

- UI side: `handleSwitchToAi` on `BuilderPage` (owns `isDirty` + `navigate`), button rendered at the top of `StepList`, full-width, above "+ Add Step".
- AI side: `handleSwitchToUi` on `AiFormBuilderPage`, button rendered inline next to the "Form Builder AI" h2.
- Shared purple accent (`#7c3aed`) so the two buttons read as a paired feature distinct from the existing blue (Submit) and red (Danger) actions. Added a `.btnSwitch` class to `builder.module.css` for the UI side; AI side uses inline styles to match (rest of that page is inline-styled).
- Dirty-state confirms mirror the existing `handleNew` pattern: UI side gates on `isDirty`; AI side gates on `session.sessionId !== null` (the visible chat history is in-memory and disappears on navigation).

## Why we did it that way

**Button placement on the UI side went through three positions before landing where it is.** Initial plan put it in the toolbar's left action cluster next to "New" / "Open". User requested it next to the "Form Builder" heading. That looked off because the toolbar is a single flex row with uniform `gap: 8px` — the button sat equidistant between the title and the form-ID input, reading as "floating in the middle of two things." User then asked to move it out of the toolbar entirely, above "+ Add Step" in the step list column. That placement works because the step list is a vertical column with its own visual rhythm — the switch button reads as a peer of "+ Add Step" rather than competing with the form-meta inputs. The width-100% finish was the user's final ask so the two stacked buttons feel uniform.

**Confirm gate is `session.sessionId !== null`, not "user typed anything".** A user can type into the chat input or attach a PDF without ever creating a session. The plan scoped this as pure navigation — no state hand-off — and uses `sessionId` as the proxy because session-bound history is what actually disappears on navigation. The "typed but not sent" edge case is intentionally not covered; expanding it would mean tracking chat-form dirty state, which was explicitly out of scope.

**Handler lives on the page, not the leaf component.** `BuilderPage` owns `navigate` and `isDirty`; `StepList` just gets an `onSwitchToAi: () => void`. The alternative — passing `isDirty` into `StepList` so it could do its own confirm — would have leaked page state into a component that otherwise knows nothing about it.

**`.btnSwitch` is colour-only; layout is inline.** The class defines background/border/hover. The width/margin live on the specific instance in StepList. Keeping the class layout-agnostic means a second consumer (if one ever appears) doesn't inherit step-list-specific sizing.

## Open questions

None.
