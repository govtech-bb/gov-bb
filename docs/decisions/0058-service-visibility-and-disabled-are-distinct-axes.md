# 0058. Service visibility and disabled are distinct axes

<!-- If a parallel consolidation PR also claims 0058, renumber at merge time
(heading + filename). -->

## Status

Accepted — introduced by #1646 (Phase 1), shipped as a prod hotfix (#1674) and
ported to sandbox here.

## Context

A form can be withheld from the public for two unrelated reasons, and #1646
surfaced that the codebase was about to conflate them:

- **"Not public yet"** — a service that has been authored but not launched. The
  editor wants it hidden from the public but visible to reviewers via a preview
  link. `apps/landing` already models this with a page-level `visibility` field
  (`public | preview | draft`).
- **"Take it down now"** — an operational kill switch for a form that is broken
  (e.g. its submission email is misrouted). An operator must flip it at runtime
  without a deploy, and it should be down for everyone, including reviewers.
  `apps/api` already models this with the `form_disabled_overrides` table →
  HTTP 410 Gone.

The temptation (and the issue's first framing) was to express both through one
mechanism — e.g. a `meta.disabled` flag read from the recipe. That would have
quietly removed the no-deploy emergency off switch (flipping it would now
require a form-builder Deploy → PR → merge → CI → ECS cycle) and overloaded one
field with two meanings.

## Decision

Visibility and disabled are **two distinct axes**, each with its own mechanism,
HTTP semantics, and bypass rule. Future work must not merge them.

| | **Visibility (launch gate)** | **Disabled (kill switch)** |
|---|---|---|
| Question | "is this public yet?" | "is this broken — take it down now?" |
| Lives in | recipe `meta.visibility` on disk | `form_disabled_overrides` DB table |
| Public response | **404** (pretend it doesn't exist) | **410 Gone** (it existed, it's down) |
| Bypass | yes — valid preview token | no — down for everyone |
| Who flips it & how | editor, pre-launch, via a deploy | operator, at runtime, no deploy |
| Precedence | — | checked **before** visibility |

Concretely, in `GET /form-definitions/:formId`: the `form_disabled_overrides`
410 check runs first and unconditionally; only then is visibility resolved. The
gate lives at the single recipe-resolution chokepoint
(`FormDefinitionsService.getRecipe`), which returns `null` for a non-public
recipe so every consumer — the single-form GET, draft-create version pinning,
the submission path — treats a hidden form as missing (404). A valid preview
token bypasses the gate.

## Consequences

- "Disabled" must never migrate into recipe `meta`; doing so would forfeit the
  runtime, no-deploy emergency off switch.
- "Visibility" must never become a runtime DB toggle; it travels with the
  recipe and changes via the normal publish/deploy path.
- A form can be in both states at once; disabled (410) wins because it is the
  more severe, operator-driven signal.
- Phase 2+ (form-builder UI for visibility, token reconciliation with landing's
  `PREVIEW_SECRET`/`DRAFT_SECRET`, a possible unified visibility API) builds on
  this separation rather than collapsing it.
