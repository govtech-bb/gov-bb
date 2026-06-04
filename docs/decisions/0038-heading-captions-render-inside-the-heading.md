# 0038 — Heading captions render inside the heading

## Status

Accepted (2026-06-04)

## Context

Repeatable form steps gained an instance caption ("Account 2") above the step
title (#801). The first implementation rendered the caption as a sibling
`<span>` above the `<h1>`. Visually correct — but the h1's accessible name
stayed identical for every instance, so a screen-reader user navigating by
headings could not tell instance 2 from instance 5, while the review page
(which folds the marker into the heading text) could.

GOV.UK's design system solves this with the caption-in-heading pattern: the
caption `<span>` lives *inside* the heading element, joining its accessible
name while remaining visually distinct.

## Decision

A caption or eyebrow that contextualises a heading is rendered **inside** the
heading element, never as a sibling above it. Visual treatment comes from the
design-system `text-caption` utility (which resets size, weight, and
line-height, so heading styles do not bleed in) plus `block` for the
own-line eyebrow layout.

## Consequences

- Accessible names carry the caption ("Account 2 Financial Information"), so
  heading navigation distinguishes otherwise-identical headings.
- Tests asserting on a heading's accessible name must include the caption
  text when one is present.
- Any future caption/eyebrow adjacent to a heading (forms, landing, builder)
  should follow this pattern rather than sibling markup.
