import { $getEditor, type LexicalNode } from "lexical";
import { $availableActions, sectioned } from "../../src/editor/core/actions";
import { govbbFormEditor } from "../../src/presets/govbb-form";

/** Default-preset test view; real targets exercise the installed action policy. */
export function $insertionGroups(target: LexicalNode | null | undefined) {
  const actions = target
    ? $availableActions($getEditor(), govbbFormEditor, { targetKey: target.getKey() })
    : govbbFormEditor.actions.filter((action) => action.group !== "Answer inputs");

  return sectioned(actions).map(
    ({ group, items }) => [group, items.map(({ item }) => item)] as const,
  );
}
