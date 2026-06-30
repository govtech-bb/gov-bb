# Visibility dropdown contrast in dark mode (#1739)

## Context

Issue #1739: in the form builder content editor, the Visibility `<select>` was
unreadable in dark mode — light text on a light dropdown popup. Reported as one
dropdown, but it affects all four native selects in the content side panel.

## What we did

Added `color-scheme` to the theme token blocks in
`apps/form_builder/app/routes/content/-styles.module.css`: `light` on
`:global(:root)`, `dark` on `:global([data-theme="dark"])`.

## Why we did it that way

The closed `.select` control was already correct (`--el-0` background, `--txt`
text, both flip with the theme). The bug was the **open** native option list:
there was no `<option>` styling and `color-scheme` was never declared anywhere
in form_builder, so the browser painted the popup with its default *light*
background while the options carried the *light* inherited text color →
light-on-light.

Two fixes were on the table:

- **A — declare `color-scheme` per theme.** The idiomatic native mechanism: the
  browser themes the option popup (and scrollbars and other UA-painted UI) to
  match. One declaration per theme, keyed on `[data-theme]`, so it covers all
  four selects and anything added later without per-element CSS.
- **B — style `.select option { background; color }`.** More surgical but only
  fixes selects, and `<option>` background styling has patchy Firefox/Safari
  support.

Chose A — it's the correct native lever and fixes the whole class of native
controls rather than fighting the browser per-element. Placed on the existing
token blocks because that's where the theme is already switched, and those
selectors are on `:root`/`[data-theme]` (not `.shell`), so portaled UI resolves
them too.

Build-verified (`nx run form-builder-app:build`). The visual effect is a browser
behavior of `color-scheme`, not exercisable in a headless build or unit test —
confirmed by eye on the Amplify preview.

## Open questions

None.
