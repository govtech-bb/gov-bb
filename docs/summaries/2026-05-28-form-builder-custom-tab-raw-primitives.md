# Form builder — Custom tab populated with raw primitives

**Date:** 2026-05-28
**Branch:** form-builder/custom-tab-raw-primitives → sandbox
**Plan:** [docs/plans/form-builder-custom-tab-raw-primitives.md](../plans/form-builder-custom-tab-raw-primitives.md)
**Related ADR:** ADR 0015 (raw primitive components)

## Context

After raw primitives landed (`raw-text`, `raw-textarea`, `raw-number`, `raw-date`, `raw-tel`, `raw-email`, `raw-checkbox`, `raw-radio`, `raw-file`, `raw-select` — see ADR 0015), they were leaking into the form builder's **Components** tab because `REGISTRY_COMPONENTS` is the merged full set. The picker showed them alongside the standardised MDA components (Address, Name, Telephone, …), which muddied that tab. They needed a home that signalled "low-level, drop-in primitive" without inventing a new tab the user would have to learn.

## What we did

Single-file change to `apps/form_builder/app/routes/builder/ui/-field-picker.tsx`:

- Imported `REGISTRY_PRIMITIVES` alongside `REGISTRY_COMPONENTS` / `REGISTRY_BLOCKS`.
- **Components** tab: filtered out any ref present in `REGISTRY_PRIMITIVES` (10 entries removed).
- **Custom** tab: merged `REGISTRY_PRIMITIVES` entries with `catalog.custom` into one alphabetised list, with each row tagged by `source: "primitive" | "custom"` so the click handler can branch.
- Click handler: primitive rows emit `{ kind: "component", ref: "components/<fieldId>", overrides: {} }`; DB custom rows emit `{ kind: "custom", ref, overrides: {} }`.
- Empty-state copy: dropped "No custom components registered." (no longer accurate now that primitives always populate); added a generic "No matches." when the merged + query-filtered list is empty.

No registry, contract, or backend changes — raw primitives were already wired through `REGISTRY_COMPONENTS` for recipe resolution; the picker contract for them stays `kind: "component"` per ADR 0015.

## Why we did it that way

**No new "Primitives" tab.** ADR 0015 anticipated one, but the label isn't obvious to a non-technical builder, and a fourth tab makes the picker bigger to scan. Co-locating primitives with DB customs under "Custom" keeps the picker at three tabs and the cognitive load of "what's in here?" easy: standardised fields ↔ Components, layout ↔ Blocks, everything else (raw + DB) ↔ Custom.

**Flat list inside Custom, no subheadings.** Considered grouping ("Primitives" / "Custom components") but rejected — flat list keeps search uniform (one query, one result set) and the UI simple. Source matters to the click handler, not to the user reading the list.

**Click handler branches by `source`, not by ref shape.** A primitive's ref is still `components/<fieldId>`, so we *could* dispatch by `ref.startsWith("components/")`. Tagging the row explicitly with `source` at construction time keeps the dispatch readable and decouples it from the registry's naming convention — if the ref scheme ever changes, the picker doesn't need to relearn it.

**Components-tab empty-state check left alone.** It checks raw `REGISTRY_COMPONENTS` length, not the filtered list. Matches the existing pattern (Blocks does the same). The cross-tab "try X tab" hint already handles the query-empty case for Components.

**Custom-tab "No matches." was a small deviation worth recording.** The plan literally said "only show an empty message when the merged + query-filtered list is empty." First pass dropped the stale copy entirely and added nothing, on the reasoning that (a) the merged list is never structurally empty (10 primitives are always present) and (b) the cross-tab hint above already covers the query-empty case. On review Isaiah preferred the literal interpretation — a "No matches." line below — so that's what shipped. The cross-tab hint and "No matches." can co-occur on Custom when a query filters everything out *and* other tabs have hits; the two messages reinforce rather than contradict.

## Open questions

None.
