# Chatbot streaming accessibility — remaining items

/ 2026-06-18 · `apps/chat`

## What this was

Issue #971 logged four streaming-accessibility gaps in the chatbot. PR #997
fixed the core ones (transcript no longer a live region, completed reply
announced once, `role="status"` on the Thinking indicator) and deferred three.
This session closed out those three.

## What changed

- **Send/Stop button** (`composer.tsx`) — previously two separate buttons that
  swapped on `streaming`. Swapping one element for another isn't announced as a
  state change. Collapsed them into **one persistent button** whose accessible
  name flips Send → Stop, so a screen reader announces the change on a single
  control. Behaviour preserved: submit + disabled-when-empty for Send, the stop
  handler while streaming, and the existing Enter / Shift+Enter handling.
- **Thinking dots** (`thinking.tsx`) — switched `animate-pulse` to
  `motion-safe:animate-pulse` so the dots stop animating when the OS requests
  reduced motion, matching the pattern the avatar already used.

## What didn't change, and why

- **Choice buttons** — already had `role="group"` + `aria-labelledby` wired to
  the question label (`choice-pills.tsx` + `field-widget.tsx`). Verified, no
  code needed. The one caller without a label (`choice-prompt.tsx`) omits it on
  purpose — its question is the model's prose, with no label element to point at.
- **Contrast** — the audit flagged mid-grey-on-white for checking. Measured:
  `mid-grey-00` is `#595959`, which is ~7:1 on white and passes WCAG AA and AAA
  for normal text. No colour change made. The shared design token was left
  untouched regardless (it affects every app).
- The orphaned `@keyframes shimmer` in `styles.css` is pre-existing dead code,
  left alone.

## Verification

`nx run chat:build` clean; `nx run chat:test` 151 pass / 0 fail. The spoken
screen-reader behaviour (Send → Stop announcement) still needs a manual
VoiceOver/NVDA pass against a streaming reply, as with PR #997 — build and tests
confirm structure and ARIA, not the audio output.
