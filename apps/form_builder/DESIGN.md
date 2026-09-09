---
name: "Content and Smart tools"
description: "The existing Content workspace for maintaining public service content."
colors:
  el-0: "#ffffff"
  el-50: "#fbfbfa"
  el-100: "#f7f7f5"
  el-150: "#f0f0ee"
  el-200: "#e5e5e5"
  el-250: "#dcdcdc"
  el-400: "#a1a1a1"
  el-500: "#8a8a8a"
  el-800: "#3a3a3a"
  el-1000: "#1c1c1c"
  txt: "#1c1c1c"
  txt-dim: "#a1a1a1"
  on-inverse: "#ffffff"
  err-bg: "#fdeded"
  err-bd: "#f3c0bd"
  err-tx: "#8c1d18"
  el-0-dark: "#232323"
  el-50-dark: "#202020"
  el-100-dark: "#1c1c1c"
  el-150-dark: "#2a2a2a"
  el-200-dark: "#333333"
  el-250-dark: "#3f3f3f"
  el-400-dark: "#6e6e6e"
  el-500-dark: "#9b9b9b"
  el-800-dark: "#d4d4d4"
  el-1000-dark: "#e5e5e5"
  txt-dark: "#e5e5e5"
  on-inverse-dark: "#1c1c1c"
  err-bg-dark: "#3a1816"
  err-bd-dark: "#6e2a25"
  err-tx-dark: "#f2b8b5"
typography:
  body:
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    letterSpacing: "-0.15px"
  title:
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.2
  group:
    fontSize: "1rem"
    fontWeight: 600
  label:
    fontSize: "13px"
    fontWeight: 500
  control:
    fontSize: "13.5px"
    fontWeight: 500
    letterSpacing: "-0.15px"
  hint:
    fontSize: "0.875rem"
    lineHeight: 1.5
  badge:
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.02em"
rounded:
  rad-s: "6px"
  rad-m: "8px"
  rad-l: "12px"
  pill: "999px"
spacing:
  "6": "6px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "24": "24px"
components:
  button-primary:
    backgroundColor: "{colors.el-1000}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.control}"
    rounded: "{rounded.rad-m}"
    padding: "9px 16px"
  button-primary-hover:
    backgroundColor: "{colors.el-800}"
  button-secondary:
    backgroundColor: "{colors.el-0}"
    textColor: "{colors.txt}"
    typography: "{typography.control}"
    rounded: "{rounded.rad-m}"
    padding: "8px 14px"
  input:
    backgroundColor: "{colors.el-0}"
    textColor: "{colors.txt}"
    typography: "{typography.body}"
    rounded: "{rounded.rad-s}"
    padding: "9px 12px"
    width: "100%"
  review-badge:
    backgroundColor: "{colors.el-1000}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  group-card:
    backgroundColor: "{colors.el-0}"
    rounded: "{rounded.rad-l}"
    padding: "0"
  record-selected:
    backgroundColor: "{colors.el-1000}"
    textColor: "{colors.on-inverse}"
    rounded: "{rounded.rad-m}"
    padding: "8px 14px"
    width: "100%"
  error-banner:
    backgroundColor: "{colors.err-bg}"
    textColor: "{colors.err-tx}"
    rounded: "{rounded.rad-s}"
    padding: "10px 12px"
---

# Design System: Content and Smart tools

## Overview

**Creative North Star: "The Content workspace"**

This is a source-derived record of the incumbent Content interface, scoped to its service list and Smart tools editor. It extends the existing workspace with familiar fields, record controls, review steps, and a public preview. It does not establish a new application-wide theme.

The authority is [Content styling](app/routes/content/-styles.module.css), [Smart tools styling](app/routes/content/-tools.module.css), [the editor](app/routes/content/tool.tsx), [fields](app/routes/content/-tool-fields.tsx), [preview](app/routes/content/-tool-preview.tsx), and [Content home](app/routes/content/index.tsx). No approved design comp or browser screenshots were available; this document records source behavior, not a visual verification result.

**Key Characteristics:**

- Neutral surfaces, compact Inter typography, and restrained borders.
- Native controls with visible labels and grouped records.
- A responsive editor beside the actual public interface.

## Colors

The default appearance combines warm near-white surfaces with charcoal text; the existing dark appearance reverses their emphasis.

### Primary

`el-1000` is the strong action and selected-record surface; `on-inverse` supplies its text. `el-800` is the primary hover surface and readable field-label/hint color.

### Neutral

`el-100` is the workspace background, `el-0` the control/card/header surface, and `el-50` the quiet hover surface. `el-150` separates service rows; `el-200` provides ordinary borders; `el-250` strengthens hover borders. `el-400` marks chip hover, `el-500` focused input borders, `txt` primary text, and `txt-dim` secondary Content-list metadata.

The `err-*` family identifies errors and removal notices. It is a functional status family, not a decorative accent. Tool field hints use `el-800` rather than faint list metadata.

The frontmatter records light defaults. The `-dark` suffix documents the same CSS property's override under `[data-theme="dark"]`; it is not a new runtime variable. `txt-dim` retains its value in both appearances. Reuse the live `--el-*`, `--txt*`, `--on-inverse`, and `--err-*` properties. The same theme selector sets native `color-scheme`.

Sidecar neutral ramps reuse source colors. Error ramps are generated reference swatches for the design panel; they do not add application tokens.

## Typography

Inter is loaded at regular, medium, and semibold weights by [the Content route](app/routes/content.tsx), with the fallback stack recorded above. Titles establish the document; legends distinguish field groups; labels remain directly beside their controls. There is no separate display face or decorative heading scale in this editor.

The frontmatter lists the explicit source sizes. Button labels use the control role; field values use the body size. Textareas and tool hints use comfortable line spacing. Review values preserve line breaks and wrap long text instead of clipping it.

## Layout

The Content shell fills the dynamic viewport, with a persistent document header and scrolling body. The Smart tools body has two equal, shrinkable columns separated by the large spacing step: editing on the left, public preview on the right. Both columns permit their contents to shrink without forcing the grid wider.

At `64rem` and below, the grid becomes one column and the preview stops being sticky. At `40rem` and below, body/header horizontal padding uses the compact spacing step; the inherited header and service rows stack. The editor uses the large spacing step for body padding, column gaps, and group separation; compact padding is `spacing.16`. Field spacing is `spacing.18`, while action rows wrap with `spacing.12` gaps.

Searchable record lists scroll at a maximum height of `260px`; their full-width buttons have a minimum height of `40px`. Opening-hour rows wrap, with labels flexing from `140px`. The preview frame uses the available width, a height of `70vh`, and a minimum height of `400px`.

## Elevation & Depth

Smart tools uses flat surfaces and borders; its editor, record groups, and preview frame have no decorative shadow. Inputs inherit the Content focus treatment: a stronger border and subtle outer ring. The sidecar records that ring as a focus effect. Other Content overlays have their own existing styles and are outside this editor's pattern set.

## Shapes

Use the inherited small radius for fields and error banners, medium radius for buttons and tool links, and large radius for Content category cards. Compact review badges use the existing pill shape. Fieldsets are unboxed; individual records start with a separator rather than another nested card. Checkboxes and date/time/select controls retain their native form.

## Components

- **Buttons:** the primary action is a solid inverse surface; secondary actions are bordered surface controls. Primary hover changes the surface, with a short background/opacity transition; disabled primary buttons dim. Links styled as actions preserve link semantics.
- **Inputs:** visible labels precede native input, select, and textarea controls. Optional fields say so. Field hints and errors are associated through `aria-describedby`, and invalid fields use `aria-invalid`. Input focus changes the border and ring; other interactive controls inherit the shell's current-color focus outline.
- **Content navigation and cards:** service rows remain grouped in existing category cards. A tool's kind appears as its edit link, and pending publication appears as a separate review badge. The editor returns through “Back to Content”; the Content home retains its existing Builder/Content switch.
- **Record editor:** identity-backed collections have search, a pressed-state selected record, and a single record editor. Add/remove controls manage focus. Reordering uses labeled buttons. Removal confirmation is inline and uses the error surface family.
- **Review and status:** the review presents human labels and before/after values. Validation appears in a focused error summary as well as beside the fields. Draft, connection, and submission messages explain the current state; submission success explicitly says the change is not live yet.
- **Public preview:** an explicitly titled iframe loads the tool's real public interface. Page and applicable message-state selectors use ordinary fields. The public pharmacy directory remains a locator; calculators, checklists, calendars, and feeds retain their own public layouts. The editor does not restyle their internals.

## Do's and Don'ts

- **Do** reuse the Content theme variables, type roles, and native controls.
- **Do** keep labels, hints, errors, and review states visible and associated with their controls.
- **Do** preserve the actual public tool interface inside the preview and the editor's one-column responsive layout.
- **Don't** introduce a separate Smart tools palette, display font, or decorative card hierarchy.
- **Don't** turn tool maintenance into a raw configuration editor for non-coders.
- **Don't** treat submitted changes as already published or source inspection as browser verification.
