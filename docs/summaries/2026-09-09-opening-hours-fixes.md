# Opening hours: prevent lost answers and clipped time controls

Sharing weekday hours now requires confirmation when it would replace different
existing hours. The message names the source day; cancelling keeps the checkbox
off and preserves all answers. Accepting copies hours to weekdays and leaves the
weekend untouched.

Opening-hours pickers use whole-minute increments, retaining configured values
such as 1800 seconds. Unsupported steps fall back to 60 seconds. The parser
preserves restored ranges containing seconds for correction instead of dropping
them on the next edit; the existing submission pattern still requires HH:MM.

The user reported AM/PM text being clipped. Native time inputs now size themselves
without flex shrinking. The week fills the package fieldset, and a container
query stacks day rows based on the width available to the component.

The required workspace build also exposed an obsolete multi-select branch in the
API display formatter. Selects became single-value fields in fbd3e739; the shared
email/webhook formatter now follows that contract. Tests use supported selects
with either an omitted or false multiple flag, and checkbox label mapping stays
covered.

## Verification

- Five regression failures reproduced before the opening-hours fix; all 25
  component tests now pass, including the existing empty/populated axe checks.
- 911 forms tests across 46 files pass. Forms TypeScript, changed-file ESLint,
  production build and React Doctor checks pass.
- 90 focused API formatter, email and webhook tests pass; coverage was disabled
  for that focused run.
- The required build passes for all 20 projects with landing excluded according
  to the repository’s local-build instructions.
- The updated 28-case scenario page builds, type-checks and is served at
  http://localhost:4175/opening-hours-break.html. Its scratch files remain
  uncommitted and the page remains running.

Visual verification is pending: no connected browser was available, and the
requested break workflow prohibits launching a browser for the inspection.
The AM/PM screenshot is evidence of the original bug, not proof of the fix.
Native picker appearance, actual dialog interaction, keyboard/screen-reader
behavior and 200% zoom still need a browser check.
