# 0136. ADR numbers are unique, and deprecated ADRs stay

**Date:** 2026-11-10
**Status:** Accepted

## Context

An ADR in `docs/decisions/` took the next free number when it was written,
not when it merged. Parallel branches, and `main` and `v2-rewrite` adding
ADRs separately, kept picking the same number. By #3120, 32 numbers were
shared by 87 files, and "ADR 0074" could mean any of three decisions. A
reference in code, a test or a doc could only be decoded from its context
and git history.

Many ADRs are also about v1 apps that the v2 rewrite replaces: `apps/api`,
`forms`, `form_builder`, `form_builder_api`, `cms`, and `landing`'s
static-markdown content. They read as current guidance for v2 work.

## Decision

**An ADR number names exactly one decision.** #3120 renumbered all 135 ADRs
to `0001`–`0135`, in the order they were first committed. It kept each slug
and rewrote every reference in the repo.

**A new ADR takes the next free number when it merges.** A branch's number
is provisional until then. If another ADR has merged with the same number,
the later merge renumbers its own ADR: the filename, the heading and every
reference to it.

**An ADR that stops applying stays where it is.** It is marked Deprecated,
with a date, a reason and its previous status. It is never deleted or
renumbered:

```text
**Status:** Deprecated (2026-11-10, #3120): about `apps/forms`, a v1 app; kept as a historical record. Previously: Accepted
```

A superseded ADR keeps its Superseded status.

This covers `docs/decisions/` only. editor_v2 keeps its own series in
`apps/editor_v2/docs/decisions/`.

## Consequences

- An ADR number cited in a commit message, issue or PR before 2026-11-10 is
  an old number. The PR that closes #3120 has the old → new table to decode
  it. The repo's own references were all rewritten.
- A branch that adds an ADR may have to renumber it when it rebases. This
  is a merge-time step, not a CI check: a check would only turn the clash
  into rework after review.
- A merge from `main` into `v2-rewrite` brings in any ADR that `main` has
  added since, under `main`'s number. Each one takes the next free number
  above `v2-rewrite`'s set at that merge.
