# Colors

GovTech UI uses semantic tokens: choose the role of the element, not a hue. All values live in [styles/tokens.css](./styles/tokens.css). The `/dev/ui#colors` catalogue shows the same tokens in either appearance.

```tsx
<div className="bg-ui-base text-ui-default border border-ui-hairline">
  <Button variant="primary">Save draft</Button>
  <p className="text-ui-subtle">Visible to the service team.</p>
</div>
```

Raw Tailwind color classes and `dark:` classes are restricted by ESLint in the UI library and catalogue. Component code uses one class in both modes.

## Mode and themes

Set `data-mode="light"` or `data-mode="dark"` on `html` for the whole app, or on a parent for a local preview. Tokens use `light-dark()` with `color-scheme`. A `color-mix()` fallback preserves the same pairs on older browsers. There is no per-component dark-mode styling.

GovTech is the default theme. Theme names are independent of mode: use `data-theme` to scope your own token overrides. Each paired token has a `-light` and `-dark` value; change those values rather than repeating classes throughout the app.

```css
/* An agency theme only needs to override the roles it changes. */
[data-theme="agency"] {
  --ui-brand-light: oklch(0.4882 0.21717 264.38);
  --ui-brand-dark: oklch(0.80907 0.0956 251.81);
  --ui-brand-hover-light: oklch(0.42445 0.18087 265.64);
  --ui-brand-hover-dark: oklch(0.88234 0.05706 254.13);
}
```

```tsx
<div data-theme="agency" data-mode="dark">
  <Button variant="primary">Save draft</Button>
</div>
```

Import overrides after `ui.css`. There is one stylesheet to edit; no theme generator or additional theme package. Apply mode/theme to the document for portaled overlays. For an isolated themed section, give `PortalProvider` a container inside that section. React's surface context crosses portals automatically; CSS inheritance follows the portal's actual DOM parent.

## Surfaces

| Token | Role |
| --- | --- |
| `bg-ui-canvas` | Page background |
| `bg-ui-base` | Default component background |
| `bg-ui-elevated` | Raised secondary layer |
| `bg-ui-recessed` | Inset areas, such as segmented tab tracks |
| `bg-ui-tint` | Subtle fills and hovered rows |
| `bg-ui-contrast` | Inverted surfaces, paired with `text-ui-inverse` |

Use `Elevated` for panels that actually stack. It chooses `bg-ui-surface-1` through `bg-ui-surface-8` and the matching shadow from the surrounding level. Light surfaces flatten toward white; dark surfaces get lighter as they rise. `bg-ui-tint` inside an elevated surface follows its background, so hover remains visible at greater depths.

## Brand and controls

| Token | Role |
| --- | --- |
| `bg-ui-brand` | Primary action fill |
| `bg-ui-brand-hover` | Primary action hover fill |
| `bg-ui-control` | Form input background |
| `bg-ui-control-hover` | Hovered control fill |
| `outline-ui-focus` / `ring-ui-focus` | Keyboard focus indicator |

## Text

| Token | Role |
| --- | --- |
| `text-ui-default` | Body text and labels |
| `text-ui-strong` | Highest emphasis |
| `text-ui-subtle` | Descriptions and secondary labels |
| `text-ui-inactive` | Disabled or inactive content |
| `text-ui-placeholder` | Input placeholders |
| `text-ui-inverse` | Text on brand or inverted surfaces |
| `text-ui-link` | Links |
| `text-ui-info`, `text-ui-success`, `text-ui-warning`, `text-ui-danger` | Readable status text |
| `text-ui-on-status` | Light text on solid status fills |
| `text-ui-on-warning` | Dark text on the solid warning fill |

The foreground for a status is separate from its solid fill: `text-ui-danger` uses the readable text value, while `bg-ui-danger`, `fill-ui-danger`, and `border-ui-danger` use the solid indicator value. Opacity modifiers work on both.

## Status

| Solid token | Background token | Meaning |
| --- | --- | --- |
| `ui-info` | `bg-ui-info-tint` | Information |
| `ui-success` | `bg-ui-success-tint` | Successful completion |
| `ui-warning` | `bg-ui-warning-tint` | Attention or caution |
| `ui-danger` | `bg-ui-danger-tint` | Error or destructive action |

```tsx
<div className="flex items-center gap-2 rounded-lg bg-ui-danger-tint p-3 text-ui-danger">
  <WarningIcon aria-hidden="true" />
  <span>Enter a service title.</span>
</div>
```

Pair status with text or an icon; color alone does not explain what happened. The optional `ui-neutral`, `ui-purple`, and `ui-teal` fills support categorical badges; they do not replace the four status roles.

## Borders and scrollbars

| Token | Role |
| --- | --- |
| `border-ui-hairline` / `ring-ui-hairline` | Boundaries between flat surfaces |
| `border-ui-line` / `ring-ui-line` | Stronger boundaries for controls |
| `ui-scrollbar` | Visible resting scrollbar thumb |
| `ui-scrollbar-hover` | Hovered or dragged thumb |

Border tokens specify color, not thickness. Use `border`, `border-2`, or a ring width separately. Elevated shadows include their own edge; avoid adding another border solely for depth.
