// Headless entry point: no React or DOM at runtime, so converters and pure form layers can use it.

export { defineEditor, type EditorDefinition } from "./core/definition";

export { createHeadlessEditor } from "./core/create-editor";

export type {
  EditorModule,
  EditorRegistration,
  DocumentNode,
  DocumentNodeDefinition,
} from "./core/module";

export type { EditorSlotContribution } from "./core/contributions";

export { editorDefinition, installedEditorDefinition } from "./core/context";

export {
  executeAction,
  $executeAction,
  $availableActions,
  rankActions,
  sectioned,
  type EditorAction,
  type ActionContext,
  type ActionRequest,
  type ActionOutcome,
} from "./core/actions";

export { $turnLineInto, type TurnInto, type TurnIntoChoice } from "./core/turn-into";

export { HISTORY_START_TAG, pushStep, registerEditorHistory, type Step } from "./core/history";

export { createEditorSession, type EditorSession } from "./core/session";

export { createEditableGate, setEditorReadOnly } from "./core/editability";

export { $caretBlock, $atEdge } from "./core/caret";

export { $paragraphAfter } from "./core/blocks";

export { immutableData } from "./core/immutable";
