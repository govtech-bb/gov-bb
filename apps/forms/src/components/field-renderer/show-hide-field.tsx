import { JSX } from "react";
import { FieldRenderContext } from "./render-context";

export function renderShowHideField(ctx: FieldRenderContext): JSX.Element {
  const { field, f, commitChange } = ctx;

  // Value is a boolean: false = collapsed (default), true = expanded.
  // The toggle itself carries no validation. Native <details>/<summary>
  // gives us the disclosure semantics, keyboard behaviour and marker
  // rotation for free (govbb-show-hide* classes). The controlled
  // sibling fields and hint are rendered by form-renderer in a
  // govbb-show-hide__content wrapper that reads this boolean reactively,
  // so the open state is driven through TanStack-Form via onToggle.
  const isOpen = (f.state.value as boolean | undefined) ?? false;
  return (
    <details
      className="govbb-show-hide"
      open={isOpen}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (next !== isOpen) commitChange(next);
      }}
    >
      <summary className="govbb-show-hide__summary">{field.label}</summary>
    </details>
  );
}
