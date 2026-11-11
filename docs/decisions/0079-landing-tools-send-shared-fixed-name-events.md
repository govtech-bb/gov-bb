# 0079 — Landing tools send shared, fixed-name events

**Date:** 2026-11-11
**Status:** Accepted
**Amends:** [ADR 0004](./0004-analytics-events-use-fixed-names-and-structured-data.md) (lifts the `apps/landing` exemption for tools)
**Related:** [#3505](https://github.com/govtech-bb/gov-bb/issues/3505) (this
decision), [#3501](https://github.com/govtech-bb/gov-bb/issues/3501) (journey
tracking epic), [ADR 0064](./0064-mask-pii-in-analytics-search-queries.md)

## Context

`apps/landing` has interactive tools: the pharmacy and shelter finders, water
outages and alert sign-up, Crop Over permits, the severance, NIS self-employed
and pension calculators, and bank holidays. They send page views only, so we
cannot see which step people leave on, whether they get a result, or what they
do with it.

ADR 0004 binds forms to fixed event names with the detail in event data, but
says `apps/landing` is "explicitly exempt" and may name events per item. That
works for a bounded directory. It does not work for tools: a name per tool, per
step or per outcome would grow with every tool and question, and each tool
would report in its own shape, so no single dashboard view could cover them.

Tools also take sensitive input. A calculator asks for pay and years worked,
the finders can use the visitor's location, and the alert sign-up takes an
email address.

## Decision

**Landing tools are no longer exempt from ADR 0004.** Every tool sends the same
four event names, defined once in `packages/analytics/src/tool-events.ts` and
part of `TrackingData`:

| Event            | Required data     | Optional data                                                                        |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `tool-step-view` | `tool`, `step`    | none                                                                                 |
| `tool-result`    | `tool`, `outcome` | `results` (count), plus the flags and codes listed for that tool in `ToolResultData` |
| `tool-action`    | `tool`, `action`  | `target` (an ID defined in code)                                                     |
| `tool-error`     | `tool`, `error`   | `step`                                                                               |

- **The tool is data, not part of the name.** `tool` is a `ToolId`; steps,
  outcomes, actions and errors are short codes defined in code. A new tool adds
  a `ToolId` (and its `ToolResultData` entry), not new event names. A new event
  name needs a new _kind_ of event, as in ADR 0004.
- **Wrong data fails type-check.** `tool-result` is typed per tool, so a prop
  another tool owns, an unknown tool or a missing required prop is a compile
  error at the `trackEvent` call. `trackEvent`'s untyped fallback overload
  refuses the tool event names for this reason.
- **Everything goes through `trackEvent`** in `@govtech-bb/analytics`. No tool
  calls `window.umami` directly, so Umami and `/journey` always get the same
  event, with the same data and the same PII masking.
- **Names are sent as they are.** Tool events carry no `form` prop, so Umami's
  `<form>:<event>` packing never applies and they need no compact codes; the
  longest name is 14 characters, under Umami's 50. `/journey` gets the same
  name and props.
- **Prop keys fit `/journey`.** Every key matches the API's key rule
  (`^[a-zA-Z][a-zA-Z0-9_]{0,39}$`, so `snake_case`, not hyphens), and no event
  allows more than 20 props, the API's limit per event. A unit test checks both.

**Privacy bar for tools.** On top of ADR 0004's bar, a tool never sends:

- An amount entered or computed: pay, salary, years worked, a pension or
  severance estimate, or a contribution.
- An email address.
- Coordinates or distances. A finder may send that it used the visitor's
  location (`used_location`), never the location itself.
- Free text typed into a tool, such as a finder's search box. Send a yes/no
  flag (`has_query`) instead.

A tool may send: parishes, counts, yes/no flags, and IDs or codes defined in
code (a step, outcome, action, error, plan or a pharmacy or shelter ID).

## Consequences

- Each tool's instrumentation picks codes for its steps, outcomes, actions and
  errors, and adds any extra `tool-result` props to its `ToolResultData` entry,
  where review sees them against this bar.
- `tool-result` requires an `outcome`, so a tool whose result has no natural
  outcome still names one (for example `estimated` or `parish-chosen`).
- The rest of landing keeps ADR 0004's exemption: its directory events
  (`service-…`, `org-…`) and tagged-link clicks are unchanged.
- One dashboard view can filter any of the four events by `tool`, in Umami and
  in `/journey` logs alike.
