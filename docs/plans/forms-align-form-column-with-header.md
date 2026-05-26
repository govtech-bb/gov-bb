# Align forms-app content column with the header column

## Goal

Form content in the `forms` app sits in the same centered 1080px column as the site header and official banner, instead of being centered as a narrower 720px column floating to the right of the header on wide screens.

## Approach

Match the wrapper pattern used by the `frontend-alpha` repo's multi-step form (`src/components/forms/builder/multi-step-form.tsx`), which wraps the form in a single `.container py-8 lg:py-16` div — no `mx-auto`, no inner `max-w-[720px]`, no extra `px-4`. The form fills the full 1080px container width; individual field components self-constrain.

Alternative considered: keep a 720px form column, left-aligned within the container (the "Suggested fix" in the original problem write-up). Rejected because the reference repo doesn't use a fixed form-column width — that constraint belongs at the field level, not the page level.

## Scope

- `apps/forms/src/routes/__root.tsx` — replace the inner wrapper div's classes.

## Change

`apps/forms/src/routes/__root.tsx:28`:

```diff
-      <div className="mx-auto w-full max-w-[720px] px-4 py-8 lg:py-12">
+      <div className="container py-8 lg:py-16">
         <Outlet />
       </div>
```

## Verify

- `pnpm --filter @govtech-bb/forms dev`, open the index route at a >1080px viewport, and confirm:
  - Form content's left edge aligns with the header logo's left edge.
  - At narrow viewports the content has the same ~1rem inset as the header (via `.container`'s `calc(100% - 2rem)`).
- Existing `__root.spec.tsx` continues to pass.
