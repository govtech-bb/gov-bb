import {
  $addUpdateTag,
  COMMAND_PRIORITY_NORMAL,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from "lexical";
import { editorDefinition } from "../core/context";
import type { TurnInto } from "../core/turn-into";
import type { TurnIntoOption } from "../../ui/turn-into";
import { pressedShortcut, shortcut } from "./shortcut";

/**
 * Turn into's choices as its menus list them: a search-only type only where the lines are one, and each shortcut as the
 * platform writes it.
 */
export function turnIntoOptions({
  value,
  choices,
}: NonNullable<ReturnType<TurnInto["$choices"]>>): TurnIntoOption[] {
  return choices
    .filter((choice) => !choice.searchOnly || choice.value === value)
    .map((choice) => ({
      value: choice.value,
      label: choice.label,
      icon: choice.icon,
      shortcut: choice.keys && shortcut(choice.keys),
    }));
}

/**
 * Turn into's shortcuts: each turns the selection's lines into its type, or back into plain text when
 * they already are that type.
 */
export function registerTurnIntoKeys(editor: LexicalEditor) {
  const turnInto = editorDefinition(editor).turnInto;

  if (!turnInto) return () => {};

  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      if (!editor.isEditable() || event.isComposing) return false;
      const offer = turnInto.$choices();
      const choice = offer?.choices.find((item) => item.keys && pressedShortcut(event, item.keys));

      if (!offer || !choice) return false;
      event.preventDefault();
      $addUpdateTag(HISTORY_PUSH_TAG);
      turnInto.$turnInto(offer.value === choice.value ? offer.choices[0]!.value : choice.value);

      return true;
    },
    COMMAND_PRIORITY_NORMAL,
  );
}
