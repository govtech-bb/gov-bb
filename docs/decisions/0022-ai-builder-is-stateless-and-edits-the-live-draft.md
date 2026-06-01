# 0022 — AI builder is stateless and edits the live draft

**Date:** 2026-06-01
**Status:** Accepted
**Supersedes:** [0011 — Builder-mode handoff goes through persistence](./0011-builder-mode-handoff-goes-through-persistence.md)
**Related:** [#490](https://github.com/govtech-bb/gov-bb/issues/490) — integrate UI + AI into one builder with a collapsible chat sidebar; [#332](https://github.com/govtech-bb/gov-bb/issues/332) — in-memory AI sessions lost on restart.

## Context

The Form Builder used to be two sibling surfaces: a UI editor (`/builder/ui`)
that edits a recipe as a client-side draft, and an AI chat page (`/builder/ai`)
that generated a recipe through a stateful server session
(`Map<id, Session>` holding the growing message history). The only bridge
between them was a heavyweight handoff — publish the AI recipe to
`form_definitions`, then re-open it by `formId` in the UI builder (ADR 0011).

That shape carried two costs:

- **Server-side session state.** The session map was lost on restart and
  couldn't be shared across instances (#332), and every turn replayed a growing
  history for no benefit once a single turn could carry the whole recipe.
- **A DB round trip to move a form a few hundred pixels.** Editing an
  AI-generated form meant persisting it first, even when the author only wanted
  to tweak an unsaved draft.

#490 unifies the two into one screen: the visual editor with a collapsible AI
sidebar docked beside it, sharing the editor's `draft` / `version` state.

## Decision

The form builder is **one client-stateful screen**. The editor owns the live
draft; the AI assistant is a panel within that screen, not a separate mode.

1. **Stateless server.** There is no server-side conversation or session. The
   one AI endpoint, `POST /builder/ai/convert`, takes
   `{ message?, recipeJson?, pdfBase64? }` and returns `{ recipe, reply }` in a
   single self-contained turn. The client carries the current recipe on every
   call, so nothing is lost on restart and horizontal scaling is unaffected.

2. **The assistant writes to the live draft.** A returned recipe is applied
   in place through the **same validate-then-load pipeline the editor uses** —
   deserialize → no-op guard → uniqueness pre-flight → contract validate →
   confirm-if-dirty → `LOAD_DRAFT` → patch bump. It is never persisted as a side
   effect of an AI action.

3. **No persistence handoff.** Moving a form between surfaces no longer goes
   through `form_definitions`. There are no `/builder/ui` or `/builder/ai`
   routes and no `?formId=` AI handoff; publishing stays the editor's existing
   Save draft / Deploy flow.

## Consequences

- **One source of truth: the in-memory draft.** Any future AI capability edits
  the draft through `applyAiRecipe`, not a parallel "rehydrate from the server"
  path. Reintroducing server-side AI state (multi-turn memory, async jobs) is a
  change to this principle and should supersede this record, not bolt a session
  map back on.
- **A broken or unchanged AI recipe never clobbers good work.** Validation gates
  the apply; an invalid recipe surfaces an error and leaves the draft untouched,
  and an unchanged recipe (a conversational reply) neither overwrites nor bumps
  the version.
- **Publishing is the editor's job, exclusively.** The AI assistant has no
  publish/delete authority. This is why the session-based publish/delete
  endpoints were removed outright.
- **Upload is inline-only.** With the session gone, the dormant presigned-S3
  upload path (keyed per session) was removed; PDF/image upload uses inline
  base64 with the 4 MB client guard. Lifting that cap means a *stateless*
  presigned flow (keys scoped by a random id, not a session), re-adding the
  `@aws-sdk/client-s3` deps at that time.
- **ADR 0011 no longer holds.** "Open implies created" and "handoff goes through
  persistence" described the two-mode world. There is no cross-mode handoff to
  route through persistence anymore.
