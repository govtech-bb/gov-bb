# Vendored anti-slop

Source: <https://github.com/dmmulroy/anti-slop>

Revision: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (upstream `main`/HEAD, verified 2026-10-05).

The 38 bundled assets match `skills/install-anti-slop/assets/anti-slop/` at the revision above. `upstream-sha256.json` records their SHA-256 checksums.

Entry points:

- `index.ts`: all 18 generic rules, enabled at error in the root `.oxlintrc.json`.
- `effect/index.ts`: preserved upstream opt-in plugin, not enabled because this project has no direct Effect dependency.
- `vendor/eslint-stylistic/`: bundled spacing implementation with its own upstream record and license.

No plugin rules were modified. Local additions are this record, `upstream-sha256.json`, and the upstream root MIT `LICENSE`. The nested Stylistic license and upstream record remain unchanged.

Toolchain: `oxlint` and `@oxlint/plugins` are both pinned to `1.87.0`; `oxfmt` is pinned to `0.72.0`. The native `oxc/no-accumulating-spread` companion is also enabled.

Project policy: narrowly listed parser, saved-draft and adapter files have exceptions for runtime representation checks. No assertion-safety, chained-cast, spacing or array-copy rule is disabled globally. See [Code quality](../../../docs/CODE-QUALITY.md) for checks and exception policy.

Verification: all 18 generic upstream RuleTester suites pass with Node 24 against the installed Oxlint/plugin versions. The plugin source and bundled assets match the checksums in `upstream-sha256.json`. The upstream spacing CLI regression also passes against the installed plugin (the test harness uses the local Oxlint binary instead of pnpm).
