import type { ReactNode } from "react";

export type EditorRenderer = {
  readonly key: string;
  readonly render: (props: unknown) => ReactNode;
};

/** A renderer added to a named slot, such as editor.overlay. */
export type EditorSlotContribution = EditorRenderer & { readonly slot: string };
