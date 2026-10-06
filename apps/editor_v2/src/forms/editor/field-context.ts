import { $getEditor, type LexicalNode } from "lexical";
import { editorDefinition } from "../../editor/core/context";
import { formDefinition } from "../definition";
import { sourceContentForNode } from "../source/content";

/** All imperative reads use their editor's explicitly installed configuration. */
export const $installedFields = () => formDefinition(editorDefinition($getEditor())).fields;

export const $installedField = (kind: string) =>
  $installedFields().find((field) => field.kind === kind);

export const $installedContents = () => formDefinition(editorDefinition($getEditor())).contents;

export function $installedContent(node: LexicalNode) {
  const contents = $installedContents();

  const source = sourceContentForNode(
    contents.map((content) => content.source),
    node.exportJSON(),
  );

  return contents.find((content) => content.source === source);
}

export const $hasConditionalLogic = () =>
  $installedContents().some(
    (content) =>
      content.source.storage.type === "widget" &&
      content.source.storage.value === "conditional-logic",
  );
