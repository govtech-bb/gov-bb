import { $getEditor, $getRoot, $parseSerializedNode } from "lexical";
import { editorDefinition } from "../editor/core/context";
import { formDefinition } from "../forms/definition";
import { nativeFormToSerialized } from "../forms/editor/native-bindings";
import { demoForm } from "./form-registry/demo";

export { demoForm, demoFormEntry } from "./form-registry/demo";

/** Fresh drafts use the same native asset as complete-form registry creation. */
export function $demo() {
  const definition = formDefinition(editorDefinition($getEditor()));
  const state = nativeFormToSerialized(demoForm, definition);
  $getRoot().append(...state.root.children.map((node) => $parseSerializedNode(node)));
}
