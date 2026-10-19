import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  PUNCTUATION,
  useBasicTypeaheadTriggerMatch,
  type TriggerFn,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import { useCallback, useEffect, useRef } from "react";

// Allow punctuation used in block names and shortcuts, which Lexical otherwise treats as a query boundary
const punctuation = PUNCTUATION.replace("#", "").replace("\\-", "").replace("'", "");

/**
 * When "/" opens an insert menu. At the start of a line the query can run on, until a space follows one
 * that nothing matches. After a space elsewhere, as at the end of a list item's text, it opens only while the query is
 * one word that finds something, so "yes / no" and "24 / 7" close at their first space, and no empty menu holds the
 * arrow keys mid-sentence. A slash dismissed with Escape stays dismissed while it's there. matches runs inside the
 * editor's read, so it can ask the document what a query finds.
 */
export function useSlashTrigger(matches: (query: string) => boolean): TriggerFn {
  const [editor] = useLexicalComposerContext();

  const slash = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
    allowWhitespace: true,
    punctuation,
  });

  // The slash the menu is open for, and the one Escape dismissed, as text node and offset
  const open = useRef<string | null>(null);
  const dismissed = useRef<string | null>(null);

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (open.current) dismissed.current = open.current;

          return false; // the menu closes itself
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    [editor],
  );

  return useCallback<TriggerFn>(
    (text, editor) => {
      const match = slash(text, editor);
      const selection = $getSelection();
      const node = $isRangeSelection(selection) ? selection.anchor.getNode() : null;

      open.current = null;

      if (!match || !node) {
        dismissed.current = null;

        return null;
      }

      const at = `${node.getKey()}:${match.leadOffset}`;

      if (dismissed.current === at) return null;

      const lineStart = match.leadOffset === 0 && !node.getPreviousSibling();
      const spaced = /\s/.test(match.matchingString);

      if (
        lineStart
          ? spaced && !matches(match.matchingString)
          : spaced || !matches(match.matchingString)
      )
        return null;

      open.current = at;

      return match;
    },
    [slash, matches],
  );
}
