# 0064 — Mask PII in analytics search queries

**Status:** Accepted · **Date:** 2026-07-22 · **Issue:** #2079 · **Relates:** #1751, ADR-0004

## Context

The public search box sent the **raw, untrimmed** user query to Umami Cloud (a
third party) on its `search` / `search-submit` / `search-no-results` /
`search-result-click` events. On a government-services search, citizens type
names, national ID / NIS / phone / TAMIS numbers, and emails — all leaving
verbatim. At the same time, a search-analytics report (#2043) genuinely needs
the readable query text ("what are people searching for"), so dropping or
hashing the query is not acceptable.

## Decision

Redact **structured PII we can reliably detect — emails and runs of 6+ digits —
and keep everything else readable.** Masking style (team decision on #2079):
keep the first and last character, replace the middle with asterisks
(`123456` → `1****6`), chosen over a plain `#` so analytics readers can tell
something was redacted.

A "number" is a run of digit groups joined only by spaces or dashes, counted
together — so a phone or ID typed with separators (`246-123-4567`,
`1 246 123 4567`) is masked as one unit, not just a contiguous run. The digit
threshold is **6+ total across the run** (team decision): shorter numbers that
occur in real form names — years (`cape exam registration 2024`), `under 11` —
stay readable, while every genuinely long identifier is still masked (NIS = 6,
phone = 7+, TAMIS = 10-15, national ID = 6+). A word between two groups breaks
the run, so two separate years stay readable while a national ID is masked end
to end.

Redaction happens at **one chokepoint** — `maskSearchQuery` applied to any
`query` string inside `trackEvent` (`@govtech-bb/analytics`) — so every current
and future search event is covered and no call site can forget.

## Consequences

- Service terms and form-name numbers stay readable in the report
  (`passport renewal`, `cape exam registration 2024` unchanged); long identifiers
  are masked (`…insurance 1234567890` → `…insurance 1********0`).
- Numbers typed with separators are masked as one run, so a national ID
  (`850101-0001` → `8*********1`) and a spaced/dashed phone
  (`246-123-4567` → `2**********7`) no longer slip through.
- **Known limits (accepted):**
  - A free-text **name** has no digits, so it is not masked. Mitigated by the
    report only surfacing the most-frequent queries (one-off names never appear);
    reliable name detection would need NLP.
  - Several standalone short numbers in one query (e.g. two separate years) are
    each below the 6-digit threshold and stay readable; only groups joined
    directly by spaces/dashes are counted together.
- Future analytics events must not put non-PII data in a property literally named
  `query`, or it will be masked. New free-text-to-analytics surfaces should route
  through the same masking.
