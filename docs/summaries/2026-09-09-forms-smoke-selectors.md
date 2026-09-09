# Forms smoke selectors after the package migration

The PR preview's JobStart smoke stopped at its first radio button because the
shared helper still expected application-generated option IDs. The React
package generates its own IDs. Radios and checkboxes now receive their native
option values; smoke helpers locate each fieldset and then its option value.
Declaration and conditional-field selectors follow the same fieldset boundary.

## Verification

- Two existing component checks failed before the native-value fix; all 118
  field-renderer checks pass after it.
- All 911 forms unit tests and 103 local browser tests pass. The browser suite
  uses mocked APIs and does not prove live submission behavior.
- Forms TypeScript and changed-file ESLint pass.
- The required workspace build passes for all 20 projects with landing excluded.
- The live suite collects 44 cases in 35 files. Four cases are already parked
  for recipe/payment issues; one catchment scenario requires a local API stack.
- The full live run is pending sandbox smoke/preview tokens: the local AWS SSO
  session has expired. The PR smoke will rerun after these fixes are pushed.

React Doctor was not run for this change: automatic approval review blocked
fetching and executing the external package. Installed checks passed instead.
