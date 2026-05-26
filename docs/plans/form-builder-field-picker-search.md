# form-builder field picker — search/filter

Tracks [#195](https://github.com/govtech-bb/gov-bb/issues/195).

## Goal

In the form builder's **Add Field** picker, let the author type to filter the available components, blocks, and custom fields. Real-time, case-insensitive substring search across all three tabs from a single input above the tab strip.

## Approach

The picker today is a single component, `apps/form_builder/app/routes/builder/ui/-field-picker.tsx`. It owns `activeTab` state and renders three flat lists pulled from `REGISTRY_COMPONENTS`, `REGISTRY_BLOCKS`, and `catalog.custom` (per ADR 0008). We extend that component:

- Add a controlled search input above the tab strip, holding `query` state alongside `activeTab`.
- Derive three filtered lists from `query`. A normalized comparator (lowercased substring) checks each item's user-visible name **and** its ref/fieldId.
  - Components: match against `primitive.label` and `primitive.fieldId` and `ref`.
  - Blocks: match against `block.blockId` and `ref`.
  - Custom: match against `item.displayName` and `item.ref`.
- Tab labels render a count badge always — `Components (35)` when no query, `Components (3)` while filtering. The badge uses the existing `.badge` style or a small inline variant.
- When the active tab's filtered list is empty but another tab has matches, render a hint row pointing the user at the tab(s) that do (`No matches here — try Blocks (1)`).
- Clearing the input (empty string) restores the full list.

Alternatives considered:

- **Hide tabs while searching, render one flat list with section headers.** Cleaner for cross-tab discovery but loses the kind affordance (component vs block vs custom is meaningful at insertion time). Rejected.
- **Auto-switch the active tab when the current one has no matches.** Surprising — the user's last explicit selection silently changes as they type. Rejected.
- **Pull in a fuzzy-search library (`fuse.js`, `minisearch`).** Overkill for <100 items with no description/tag fields. A `.toLowerCase().includes()` pass is fine and avoids adding a dep. Revisit if the list grows past a few hundred or we add richer metadata.

## Scope

- Add search input + `query` state to `FieldPicker`.
- Derive filtered Components / Blocks / Custom arrays from `query`.
- Update each tab's rendering to iterate the filtered array, not the raw source.
- Add count badges to tab buttons.
- Add the "no matches here, try X" hint when the active tab is empty but others aren't.
- Styles: a search input style in `apps/form_builder/app/styles/builder.module.css` and (if needed) a small count-badge variant for the tab buttons.

Out of scope (deliberately):

- Description/tag matching — `Primitive` and `Block` types don't carry those fields. The issue acknowledges this as "ideally if available."
- Keyboard navigation (arrow keys between matches, Enter to insert top match). Nice to have; not in #195.
- Persisting the query across navigations. Local state is enough.

## Files

- `apps/form_builder/app/routes/builder/ui/-field-picker.tsx` — add input, filter logic, count badges, empty-state hint.
- `apps/form_builder/app/styles/builder.module.css` — search input styling; tab-count badge tweak if the existing `.badge` doesn't compose cleanly on the tab buttons.

No new files expected. No new dependencies.

## Verify

- Manual: open `/builder/ui` on a form, type into the new search input, confirm:
  - Each tab's list shrinks to matches in real time.
  - Substring + case-insensitive matching works against labels, blockIds, displayNames, refs, fieldIds.
  - Tab badges reflect filtered counts.
  - Clearing input restores the full list and original counts.
  - When the active tab has no matches and another does, the hint renders.
  - Clicking a match still adds the field (existing `onAddField` path is untouched).
- Type check / lint pass: `pnpm -F form_builder typecheck` (or the repo-wide equivalent).
- No regression to existing behavior when the input is empty — picker should look and behave exactly as it does today.

## Open questions

- Should the search input have a visible clear (×) button, or is keyboard-only clearing (select-all + delete) enough? Leaning yes on the affordance, will decide during implementation if it costs much.
- Tab badge visual: reuse the existing `.badge` style, or render the count inline in the tab text (`Components (3)`)? Will pick during implementation based on how the existing styles compose.
