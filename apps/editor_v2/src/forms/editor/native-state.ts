import { $getState, $setState, createState, type LexicalNode } from "lexical";
import type {
  AnyFormDefinition,
  AnyFormBlock,
  QuestionBase,
  QuestionOption,
  PageBlock,
  ContentBase,
  LogicBlock,
  CalculatedBlock,
} from "../schema/types";

/** Native identities are independent of Markdown anchors and Lexical session keys. */
export type NativeNodeData = {
  version?: 1;
  form?: Omit<AnyFormDefinition, "title" | "blocks">;
  page?: Omit<PageBlock, "title" | "description">;
  question?: Omit<QuestionBase, "label" | "hint" | "options">;
  option?: { id: string; value: string | number | boolean; visible?: boolean; disabled?: boolean };
  options?: QuestionOption[];
  content?: Omit<ContentBase, "content">;
  logic?: LogicBlock;
  calculated?: CalculatedBlock;
  owner?: string;
  part?: "label" | "hint" | "input" | "option" | "list-item" | "list-content";
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- hintShape is a persisted Markdown metadata key; renaming would discard saved hint representation.
  hintShape?: "rich" | "blocks";
  hintOwner?: string;
  listItem?: { id: string; visible?: boolean };
  container?: string;
};

export const nativeState = createState("native", {
  parse: (value): NativeNodeData =>
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- NodeState retains incomplete native metadata so drafts stay editable; validateFormDefinition, not this storage parser, authorizes export.
    value && typeof value === "object" && !Array.isArray(value) ? (value as NativeNodeData) : {},
});

export const $native = (node: LexicalNode): NativeNodeData => $getState(node, nativeState);

/** Unlike legacy settings, an explicit false is data. Only undefined removes a property. */
export function $setNative<T extends LexicalNode>(node: T, patch: Partial<NativeNodeData>): T {
  return $setState(node, nativeState, (previous) => {
    const next = { ...previous };

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) Reflect.deleteProperty(next, key);
      else Object.assign(next, { [key]: structuredClone(value) });
    }

    return next;
  });
}

export const nativeBlockId = (state: NativeNodeData): string | undefined =>
  state.question?.id ??
  state.page?.id ??
  state.content?.id ??
  state.logic?.id ??
  state.calculated?.id;

export type NativeRawNode = {
  type: string;
  version: number;
  children?: NativeRawNode[];
  $?: { native?: NativeNodeData; [key: string]: unknown };
  [key: string]: unknown;
};

export const rawNative = (node: NativeRawNode): NativeNodeData => node.$?.native ?? {};

export function withNative(node: NativeRawNode, native: NativeNodeData) {
  return { ...node, $: { ...node.$, native: structuredClone(native) } };
}

export function nativeMetadata<T extends AnyFormBlock>(
  block: T,
  ...textKeys: (keyof T)[]
): Omit<T, "label" | "hint" | "options" | "content" | "title" | "description"> {
  const value = structuredClone(block);

  for (const key of textKeys) delete value[key];

  return value;
}
