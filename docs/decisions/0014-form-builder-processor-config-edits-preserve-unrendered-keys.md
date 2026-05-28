# 0014 — Form builder processor config edits preserve unrendered keys

**Date:** 2026-05-27
**Status:** Accepted
**Related:** [#255](https://github.com/govtech-bb/gov-bb/issues/255), [#275](https://github.com/govtech-bb/gov-bb/issues/275), [ADR 0013](./0013-form-builder-round-trip-preserves-unauthored-fields.md)

## Context

The processors authoring UI (#275) lets a builder edit a processor's `config`
through a type-specific form. Two facts make config editing subtler than editing
a field override:

1. A config is a free-form shape per type. The `spreadsheet`/`opencrvs` configs
   **are** an arbitrary `Record<string, string | number>`, edited through a
   key-value editor where **removing** a key is a first-class operation.
2. Some config keys are deliberately **not rendered**. The webhook `secret` is
   never shown in the builder — a plaintext HMAC key does not belong in a recipe
   committed to git via the Deploy PR — but it must **survive** a round of
   editing. An existing recipe can also carry other keys a given builder version
   has no input for.

These pull in opposite directions. A reducer that *merges* the edited config over
the old one preserves unrendered keys for free, but then a key-value editor can
never remove a key (the deleted key survives the merge). A reducer that *replaces*
the config lets keys be removed, but naively drops every key the form didn't
re-supply — including `secret`.

## Decision

The reducer **replaces** a processor's config wholesale
(`UPDATE_PROCESSOR_CONFIG` stores exactly the config it is given). The obligation
to preserve unrendered keys therefore lives in the **config form**: every form
spreads the existing config first and overlays only the fields it edits
(`onConfigChange({ ...config, <edited> })`).

Consequence by construction:

- Key-value editors (spreadsheet, opencrvs, webhook `headers`) emit the full
  remaining record, so removal works — the replaced config simply omits the key.
- Object-shaped configs (email, webhook) spread `...config`, so unrendered keys
  (notably webhook `secret`) ride through every edit untouched.

This is the **edit-path** counterpart to ADR 0013, which governs the
**load/save** round-trip. 0013 keeps unauthored *recipe fields* through
serialize/deserialize; 0014 keeps unrendered *config keys* through an in-editor
edit.

## Consequences

- **Any new processor type or config form inherits this obligation.** A form that
  builds its config from scratch instead of spreading the existing one will
  silently drop `secret` (and any other unrendered key) the first time the user
  edits that processor. Spreading the existing config is the rule, not an
  optimization.
- The reducer action is typed with an opaque `config: Record<string, unknown>`
  and casts on store: it cannot statically know the matched processor's variant.
  The author-time `processorSchema` (server Validate flow) is the backstop that
  catches a malformed config the types no longer guard.
- Optional keys that are emptied should be **pruned to absent** by the form (e.g.
  webhook `headers` is deleted when its last row is removed), rather than
  persisting an empty `{}`. Required record configs (spreadsheet, opencrvs) keep
  `{}` — it is their valid empty state.
- The guarantee is tested on both sides: a reducer test that a caller-spread
  `secret` is stored verbatim, and a component test that editing a webhook's url
  through the real form leaves a pre-existing `secret` intact.
