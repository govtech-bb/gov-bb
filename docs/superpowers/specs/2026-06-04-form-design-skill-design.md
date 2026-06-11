# Design: `form-design` project skill

**Date:** 2026-06-04
**Status:** Approved

## Purpose

Give designers a Claude skill for creating and editing Government of Barbados
form recipes (service contract JSON) that adheres to all the principles the
Form Builder AI applies, plus the repo's versioned-file conventions.

## Decisions (from brainstorming)

- **Edit model:** editing a form creates a **new version file** next to the
  old one (`recipes/<formId>/<x.y.z>.json`) — existing version files are
  never modified.
- **Version bump:** every edit bumps the **minor** version only
  (`1.1.0 → 1.2.0`; `1.1.3 → 1.2.0`), unless the designer explicitly asks
  for a different bump.
- **Interaction:** conversational — Claude may ask the designer clarifying
  questions when genuinely ambiguous, unlike the single-shot Form Builder AI.
  Guardrails still decide deterministically where they answer the question.
- **Source of truth:** the skill does **not** duplicate the guardrails. It
  instructs Claude to `Read` `apps/form_builder_api/src/ai/system-prompt.ts`
  at use-time. Zero drift.
- **Name / trigger:** `form-design`, at `.claude/skills/form-design/SKILL.md`.
  Auto-invokes on create/edit-form requests; also `/form-design`.

## Skill content (single SKILL.md)

1. **Read guardrails first** — mandatory Read of
   `apps/form_builder_api/src/ai/system-prompt.ts`. All guardrail categories
   and critical rules apply verbatim, with three adaptations:
   - Output: write a recipe `.json` file in the repo, not a ```json chat
     block; the SQL-output section does not apply.
   - Interaction: conversational, not single-shot.
   - Scope: editing existing forms is in scope.
   - If the file is missing/moved: stop and tell the user; never proceed
     from memory.
2. **Creating** — new directory
   `apps/api/src/forms/form-definitions/recipes/<form-id>/` containing
   `1.0.0.json` with `version: "1.0.0"`.
3. **Editing** — copy the latest version file, apply changes, bump minor.
   Update `version`, filename, and `updatedAt`; preserve `createdAt`.
4. **Invariants** — `formId` must equal the directory name; filename must
   equal the `version` field (enforced at API boot and by
   `apps/api/src/forms/form-definitions/recipe-invariants.spec.ts`).
5. **Verification** — after any write:
   `cd apps/api && npx jest recipe-invariants`.

## Companion change: system-prompt.ts

Add to the live system prompt (the skill's source of truth): in
`fieldConditionalOn` / `optionalIf` behaviours, the compared `value` is
always **lowercased and kebab-cased** — it must match the watched field's
option `value` (which is kebab-case by convention), never the display label.
