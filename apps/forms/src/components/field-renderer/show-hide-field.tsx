import { JSX, ReactNode } from "react";
import { Hint, ShowHide } from "@govtech-bb/react";
import { FieldRenderContext } from "./render-context";

export function renderShowHideField(
  ctx: FieldRenderContext,
  children?: ReactNode,
): JSX.Element {
  const { field, f, commitChange } = ctx;

  // Unmount collapsed fields so they do not validate; their saved values stay
  // in TanStack Form and reappear when the disclosure opens again.
  const isOpen = (f.state.value as boolean | undefined) ?? false;
  return (
    <ShowHide
      summary={field.label}
      open={isOpen}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (next !== isOpen) commitChange(next);
      }}
    >
      {isOpen && (
        <>
          {field.hint && <Hint>{field.hint}</Hint>}
          {children}
        </>
      )}
    </ShowHide>
  );
}
