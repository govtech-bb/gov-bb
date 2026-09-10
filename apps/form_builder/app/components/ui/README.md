# GovTech UI

Reusable components for GovTech's form builder and content tools. Base UI supplies interaction and accessibility; local React, Tailwind, and CSS define our components. Open `/dev/ui` to review every component in light and dark appearances. The catalogue is development-only.

Import `ui.css` once at the application root; it also loads Inter from `@fontsource-variable/inter`. Use component imports in application code:

```tsx
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";

<Input
  name="title"
  label="Form title"
  description="Shown to applicants."
  error={errors.title}
  required
/>
<Select
  name="department"
  label="Department"
  items={[
    { value: "education", label: "Education" },
    { value: "health", label: "Health" },
  ]}
  value={department}
  onValueChange={setDepartment}
/>
<Button type="submit" variant="primary" loading={saving}>Save draft</Button>
```

- `styles/tokens.css` owns surfaces, foregrounds, status colors, typography, and radii. Use semantic Tailwind classes such as `bg-ui-base`, `text-ui-subtle`, and `border-ui-hairline`.
- `utils/control.ts` owns shared control sizes: `xs` (24px), `sm` (28px), `base` (36px), and `lg` (40px), at a 16px root. Use `base` for ordinary form editing.
- `styles/components.css` owns shared focus and surface rules. `styles/calendar.css` themes the installed DayPicker.
- `styles/motion.css` owns timing and CSS transitions. `animation/` measures navigation highlights; Base UI owns popup lifecycles and keyboard behavior. Reduced motion removes movement.

Set `data-mode="light"` or `data-mode="dark"` on the document element so portaled content inherits the theme. The app's theme hook also keeps `data-theme` synchronized. `PortalProvider` supports a custom portal container; set the same theme on that container when embedding the library.

`Field` accepts a string error or `{ message, match }` for native validation. Help text remains visible alongside errors. Its name, disabled state, validation mode, and validation function pass through to Base UI. Bare inputs compose with `Field`; components with a `label` prop handle that composition themselves. Use `Form` from this library for Base UI form validation, or a native form for ordinary submission.

Use `className` and native element props for local adjustments. Give icon buttons an accessible name and use `render={<Button />}` to compose overlay triggers. Links take `href`; `LinkProvider` can adapt the application's router. Select accepts both item arrays and object maps; item arrays support disabled choices.

`ConfirmationProvider` is mounted at the app root. Get `confirm` with `useConfirmation()` at component scope, then call `await confirm({ title, description, confirmLabel, destructive })` in an event handler. The promise resolves to `false` on cancellation or provider unmount.

`ToastProvider`, `useToastManager`, and `createToastManager` use Base UI's manager directly. Use `type: "success" | "error" | "warning" | "info"` for status, `actionProps` for an action, and `data` for custom content or multiple actions. Give errors and actionable notices `timeout: 0` so the user can dismiss them.

## Tokens, surfaces, and scrolling

See [Colors](./COLORS.md) for the token reference and theme overrides. Review live swatches, eight surface levels, nested overlays, and all scrollbar orientations at `/dev/ui`.

```tsx
import { Elevated, SurfaceProvider, useSurface, surfaceClasses } from "../components/ui/surface";
import { ScrollArea } from "../components/ui/scroll-area";

<SurfaceProvider value={1}>
  <Elevated offset={2} shadowLevel={3} className="rounded-xl p-4">
    <Elevated offset={4} shadowLevel={5} className="rounded-lg p-4">
      Nested panel
    </Elevated>
  </Elevated>
</SurfaceProvider>

<ScrollArea
  aria-label="Reporting months"
  orientation="horizontal"
  className="w-full"
  viewportClassName="scroll-fade-x"
>
  <div className="flex w-max gap-3 p-4">{months}</div>
</ScrollArea>
```

`Elevated` adds `offset` to `useSurface()` (1 outside a provider), rounds and clamps the result to 1–8, and provides the new level to descendants. `shadowLevel` defaults to that level; dialogs use 5 and menus use 3 so their shadow weight stays consistent as they nest. Native div props and refs are forwarded; `render` composes with Base UI parts. `surfaceClasses(backgroundLevel, shadowLevel?)` is available for manual composition; pair it with `SurfaceProvider` when it contains other elevated components. `Surface` remains a flat structural container.

`ScrollArea` supports `vertical` (default), `horizontal`, and `both`. Constrain the outer box with `className`; `viewportClassName` styles the scrolling element; `viewportProps` forwards its ref, scroll handler, and accessible role. Use `scroll-fade` vertically and `scroll-fade-x` horizontally, or both together. Fades disappear at content boundaries and when there is no overflow. `aria-label` or `aria-labelledby` names the keyboard-focusable viewport. `ScrollBar` is also exported for composition with Base UI's scroll-area parts. Touch keeps native overflow scrolling and native scrollbars without remounting the content. `ui-scroll-native` applies the shared scrollbar colors to an existing native scrolling element.
