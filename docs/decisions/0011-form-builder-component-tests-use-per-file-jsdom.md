# 0011 — form_builder component tests opt into jsdom per-file

**Date:** 2026-05-27
**Status:** Accepted
**Related:** [#234](https://github.com/govtech-bb/gov-bb/issues/234)

## Context

Until now every `form_builder` test was a `.spec.ts` file running under jest's
default `testEnvironment: "node"` — server functions, the recipe reducer, id
validation. There were no React component tests; the jest config's
`testRegex` (`.*\.spec\.ts$`) didn't even match `.tsx`.

Deferring the forms list off the `/builder/ui` critical path (#234) added the
first behaviour worth testing at the component level: `FormPicker`'s
loading/empty/error rendering and the `useFormsList` mount-fetch hook. Those
need a DOM (jsdom) and Testing Library, neither of which the node-env config
provided. The obvious shortcut — flipping `testEnvironment` to `jsdom`
globally — would change the environment out from under the existing server
suites, which assume Node.

## Decision

`form_builder`'s jest project stays `testEnvironment: "node"` globally. React
component suites are `.spec.tsx` files that **opt into jsdom per-file** with a
docblock:

```tsx
/**
 * @jest-environment jsdom
 */
```

Supporting wiring (in `apps/form_builder/jest.config.ts`):

- `testRegex` matches both extensions: `.*\.spec\.tsx?$`.
- CSS-module imports resolve through `identity-obj-proxy` (a declared root
  devDependency, not a transitive of `@nx/jest`) so components importing
  `*.module.css` render without a CSS loader.
- Component suites use `@testing-library/react` / `-jest-dom` (already root
  devDependencies); the TanStack `createServerFn` shim in `test-mocks/` keeps
  imported server modules from attempting real RPCs.

## Consequences

- **Add component tests as `.spec.tsx` + docblock.** Do not switch the project's
  global `testEnvironment` to jsdom — the node suites depend on Node. Reach for
  the per-file docblock instead.
- **Mixed environments in one project are intentional.** A reviewer seeing both
  node and jsdom suites under `form-builder-app` should not "fix" it by
  homogenising the environment.
- **Keep jest-only CSS/asset stubs declared, not transitive.** `identity-obj-proxy`
  is in the root `package.json`; a future consumer of the CSS mapper must not
  rely on it arriving via `@nx/jest`.
