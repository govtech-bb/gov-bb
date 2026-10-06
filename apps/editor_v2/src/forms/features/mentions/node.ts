import {
  $create,
  $getState,
  $isElementNode,
  $setState,
  createState,
  TextNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import type { DisplayReference } from "../../schema/types";

export const fieldState = createState("field", { parse: (v) => (typeof v === "string" ? v : "") });

// Displayed to respondents until the referenced question has an answer.
export const defaultState = createState("defaultValue", {
  parse: (v) => (typeof v === "string" ? v : ""),
});

export const nativeReferenceState = createState("nativeReference", {
  parse: (value): DisplayReference | undefined => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- this is repairable mention state; native schema validation checks the full reference before export.
    return value as DisplayReference;
  },
});

/**
 * An atomic reference to a field: typing goes around it and deletion removes the whole token.
 * The stored field key survives label changes; respondents see the referenced answer in its place.
 */
export class MentionNode extends TextNode {
  override $config() {
    return this.config("mention", {
      extends: TextNode,
      stateConfigs: [
        { stateConfig: fieldState, flat: true },
        { stateConfig: defaultState, flat: true },
        { stateConfig: nativeReferenceState },
      ],
    });
  }
  override createDOM(config: EditorConfig, editor?: LexicalEditor) {
    const dom = super.createDOM(config, editor);
    dom.classList.add(
      "cursor-pointer",
      "rounded-xs",
      "bg-interactive-subtle",
      "px-0.5",
      "text-interactive",
      "box-decoration-clone",
      "hover:bg-teal-20",
    );
    dom.spellcheck = false;

    return dom;
  }
  override canInsertTextBefore() {
    return false;
  }
  override canInsertTextAfter() {
    return false;
  }
}

export const mentionLabel = (title: string) =>
  `@${title.length > 30 ? `${title.slice(0, 27)}...` : title}`;

export const $createMentionNode = (field: string, title: string) =>
  $setState($create(MentionNode), fieldState, field)
    .setTextContent(mentionLabel(title))
    .setMode("token");

export const $isMentionNode = (node: LexicalNode | null | undefined): node is MentionNode =>
  node instanceof MentionNode;

export const $mentionField = (node: MentionNode) => $getState(node, fieldState);

/** The mention's default value: piped in when the field has no answer. "" for none. */
export const $mentionDefault = (node: MentionNode) => $getState(node, defaultState);

export const $nativeMentionReference = (node: MentionNode) => $getState(node, nativeReferenceState);

export function $setNativeMentionReference(node: MentionNode, reference: DisplayReference) {
  $setState(node, nativeReferenceState, structuredClone(reference));
  $setState(
    node,
    fieldState,
    "answer" in reference
      ? reference.answer
      : "value" in reference
        ? reference.value
        : reference.context,
  );
  $setState(node, defaultState, reference.fallback ?? "");
}

export function $createNativeMentionNode(reference: DisplayReference, title: string) {
  const node = $createMentionNode(
    "answer" in reference
      ? reference.answer
      : "value" in reference
        ? reference.value
        : reference.context,
    title,
  );

  $setNativeMentionReference(node, reference);

  return node;
}

export const $nativeReference = $nativeMentionReference;

export const $setNativeReference = $setNativeMentionReference;

export const $mentionsIn = (node: LexicalNode): MentionNode[] =>
  $isMentionNode(node)
    ? [node]
    : $isElementNode(node)
      ? node.getChildren().flatMap($mentionsIn)
      : [];
