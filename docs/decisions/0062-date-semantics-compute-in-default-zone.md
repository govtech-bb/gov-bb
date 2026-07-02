# 0062 — Date semantics compute in the default zone, anchored at UTC midnight

## Context

The platform serves Barbados (UTC−4). "Today" and date-relative logic appear in
several places: the `today()` expression, age-gating, conditional field
visibility, and the form-validation date-comparison rules (`pastRunner`,
`pastOrTodayRunner`, `futureRunner`, `futureOrTodayRunner`).

`packages/expressions` computes "today" in `DEFAULT_ZONE = "America/Barbados"`.
`packages/form-validation` computed it in UTC (`new Date()` + `Date.UTC(...)`).
Between Barbados midnight and UTC midnight (~4 hours each evening) those are
different calendar dates, so the validator and the visibility/age logic
disagreed about the same value on the same submission (issue #1825).

A second, easy-to-miss constraint surfaced while fixing it: submitted dates are
stored **anchored at UTC midnight** (`parseDate` builds `Date.UTC(y, m, d)`). A
"today" anchored at Barbados midnight (04:00 UTC) — which
`DateTime.now().setZone(DEFAULT_ZONE).startOf("day").toJSDate()` produces — would
sit 4 hours ahead of same-day submitted dates and skew every `<` / `>`
comparison, reintroducing a bug in the other direction.

## Decision

All "today" / date-comparison semantics compute in `DEFAULT_ZONE`
(`America/Barbados`), never from a UTC-derived "today".

When a computed "today" is compared against stored/submitted dates, it is
anchored at **UTC midnight of the default-zone calendar date**:

```ts
const now = DateTime.now().setZone(DEFAULT_ZONE);
const today = new Date(Date.UTC(now.year, now.month - 1, now.day));
```

i.e. take the zone's calendar date (`year`/`month`/`day`), then rebuild it with
`Date.UTC` — matching how `parseDate` anchors submitted dates. Do **not** use
`startOf("day").toJSDate()` for values compared against UTC-midnight-anchored
dates.

`DEFAULT_ZONE` is the single source of truth for the zone and is exported from
`@govtech-bb/expressions`.

## Consequences

- New date logic must derive "today" from `DEFAULT_ZONE`, not `new Date()` in
  UTC. Reviewers should treat a UTC-derived "today" in date-comparison code as a
  defect.
- Code comparing a computed "today" against stored dates must match their
  anchoring (UTC midnight here). Anchoring the two sides differently is the
  subtle failure mode this record exists to prevent.
- `DEFAULT_ZONE` is currently known in both `expressions` and `form-validation`.
  A future consolidation could route `form-validation`'s `today()` through
  `expressions.today()` to keep one implementation; not done here.
