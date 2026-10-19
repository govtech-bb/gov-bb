import {
  $addUpdateTag,
  $isElementNode,
  $isTextNode,
  HISTORY_PUSH_TAG,
  type LexicalNode,
} from "lexical";
import type { ReactNode } from "react";
import type { EditorDefinition } from "./definition";

/** A type of text block that Turn into offers: one of the editor's insert actions, by its id. */
export type TurnIntoChoice = {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Its shortcut, in shortcut()'s terms, such as ["mod", "alt", "2"]. */
  readonly keys?: readonly string[];
  /**
   * Left out of the menus unless the lines already are one, as Heading 4 is on a page. Its shortcut, the "/" menu and
   * Markdown still turn lines into it.
   */
  readonly searchOnly?: boolean;
};

/**
 * Turn into, for an editor's text blocks: the lines a selection touches become another type of text block, keeping
 * their text. The block menus, the selection toolbar, the shortcuts and the "/" menu all turn lines through it. Its
 * callbacks run in the editor's Lexical context.
 */
export type TurnInto = {
  /**
   * The choices for the selection's lines, plain text first, and the one they all are (null when they differ); null
   * where they can't turn, such as in a table or a button.
   */
  readonly $choices: () => {
    readonly value: string | null;
    readonly choices: readonly TurnIntoChoice[];
  } | null;
  /** Turns the selection's lines into a choice. */
  readonly $turnInto: (value: string) => void;
};

/**
 * A "/" menu's text choice, on a line with more text than was typed to open the menu, turns the line into itself
 * rather than adding a block below it. `$removeTyped` takes away what was typed first. True when it did.
 */
export function $turnLineInto(
  definition: EditorDefinition,
  id: string,
  line: LexicalNode,
  typed: string,
  $removeTyped: () => void,
) {
  const turnInto = definition.turnInto;

  if (
    !turnInto ||
    !$isElementNode(line) ||
    line.getTextContent().length <= typed.length ||
    !turnInto.$choices()?.choices.some((choice) => choice.value === id)
  )
    return false;

  $removeTyped();
  // The space before the "/" was only there to open the menu
  const last = line.getLastDescendant();

  if ($isTextNode(last)) last.setTextContent(last.getTextContent().trimEnd());
  line.selectEnd();
  $addUpdateTag(HISTORY_PUSH_TAG);
  turnInto.$turnInto(id);

  return true;
}
