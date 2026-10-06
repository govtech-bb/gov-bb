# Code quality

Install dependencies with `pnpm install` from the monorepo root. Run the editor's checks from `apps/editor_v2`:

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm check:boundaries
pnpm check:coverage
```

For automatic fixes, run `pnpm lint:fix`, then `pnpm format`. Review the diff and rerun lint and formatting checks. Imports are not automatically sorted.

## Configuration

[.oxlintrc.json](../.oxlintrc.json) configures Oxlint and the vendored anti-slop rules. [.oxfmtrc.json](../.oxfmtrc.json) configures Oxfmt. Application code, tests, browser scripts and executable documentation examples are checked; frozen fixtures, the generated route tree and vendored tools are excluded from formatting and linting.

The root Prettier command skips this app because it uses Oxfmt. Sherif also excludes the editor package while its React 19.3 and Lexical 0.51 versions differ from other apps; remove that exception when the dependency versions align.

`oxlint` and `@oxlint/plugins` are pinned together at `1.87.0`; `oxfmt` is pinned at `0.72.0`. The generic plugin rules and `oxc/no-accumulating-spread` are enabled at error. The optional Effect rules are not enabled because the app has no direct Effect dependency. [Upstream attribution, licenses and checksums](../tools/oxlint/anti-slop/UPSTREAM.md) are recorded beside the plugin.

## Validation and exceptions

Keep runtime validation at JSON, Markdown, saved-state, extension and browser input boundaries. Narrow exceptions permit those checks in specific files; the default rules apply elsewhere. The complete list is in [.oxlintrc.json](../.oxlintrc.json).

| Boundary | Why an exception is needed |
| --- | --- |
| Parsers, schema validators and converters | External values are unknown until checked. These readers need primitive checks, raw dictionaries and callbacks that accept untrusted data. |
| Saved drafts, Lexical NodeState and field settings | Incomplete authored data must survive save/reload so authors can repair it. Native export still requires validation. |
| Rich text and reference walkers | Native values include scalar unions and inline references that require representation checks. |
| Registry and extension adapters | Each installed module owns its configuration contract; shared composition preserves opaque data for that module. |
| Persistence, YAML metadata and workspace imports | Stored drafts, recovery journals, metadata and storage-key ownership are checked before use. |
| Test decoders and coverage readers | Tests exercise invalid inputs and extension boundaries, so they need the same validation operations. |

Use `SAFETY:` comments to explain type assertions whose invariants TypeScript cannot express. Do not claim that an incomplete draft satisfies the published schema. Where a draft or adapter genuinely needs an exception, keep it local and explain why.

The saved `hintShape` property has local naming exceptions because renaming it would change the storage format. Preserve persisted contracts when applying lint fixes.
