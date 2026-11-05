// React entry point: components, hooks and browser registrations.

export {
  EditorComposer,
  EditorSessionProvider,
  useEditorDefinition,
  useLinkPages,
} from "./composer";

export { Editor } from "./editor";

export { defineRenderer, defineSlot, RendererHost, EditorSlot } from "./contributions";

export { registerOutsideKeys } from "./active-editor";

export { roomierSide, $validPoint, useCaretReturn } from "./editor-popup";

export { BlockRail, RailButton, DropLine, firstLineMiddle, menuKey, type Line } from "./block-rail";

export {
  useBlockControls,
  BlockMenuRoot,
  BlockGrip,
  type BlockControls,
  type BlockMenuTarget,
} from "./block-controls";

export { SlashMenu } from "./action-pickers/slash-menu";

export { ActionPicker, useActionPicker } from "./action-pickers/action-picker";

export { InsertDialog } from "./action-pickers/insert-dialog";

export { turnIntoOptions } from "./turn-into";

export { CaretLinkPopover } from "./caret-link";

export { UndoRedo } from "./undo-redo";

export { toastWithUndo } from "./undo-toast";

export { isMac, altKey, composing, shortcut } from "./shortcut";

export {
  container,
  ghost,
  ghostBase,
  placeholder,
  lineHint,
  el,
  $static,
  $tip,
  $stateTag,
  icon,
  $caretLine,
  registerLineHint,
} from "./block-dom";
