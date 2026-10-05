import type { ReactNode } from "react";

export type EditorRenderer = {
  readonly key: string;
  readonly render: (props: unknown) => ReactNode;
};

export type EditorSlotContribution = EditorRenderer & { readonly slot: string };
