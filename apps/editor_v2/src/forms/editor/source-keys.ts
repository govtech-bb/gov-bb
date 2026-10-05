import { $getRoot, $setState, createState, RootNode, type LexicalEditor } from "lexical";
import {
  $blockGroup,
  $blockKind,
  $ensureBlockIds,
  $ensureQuestionFields,
  $formBlocks,
  $isInput,
  $isQuestionNode,
  $questionKey,
  $settings,
  settingsState,
} from "./nodes";
import { sourceSlug } from "../source/identifiers";

export const sourceAnchorState = createState("sourceAnchor", {
  parse: (value) => (typeof value === "string" ? value : ""),
});

/** Shared authoring keys outlive label edits, first-option deletion and reordering. */
export function $ensureSourceKeys(root = $getRoot()) {
  $ensureBlockIds(root);
  $ensureQuestionFields(root);

  const assigned = new Map<string, string>(),
    used = new Set<string>();

  const answers = $formBlocks(root).filter($isInput);

  for (const answer of answers) {
    const field = $questionKey(answer),
      current = $settings(answer).sourceKey;

    if (assigned.has(field)) continue;

    if (
      typeof current === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(current) &&
      !used.has(current)
    ) {
      assigned.set(field, current);
      used.add(current);
    }
  }

  for (const answer of answers) {
    const field = $questionKey(answer);

    if (!assigned.has(field)) {
      const title = $blockGroup(answer).find($isQuestionNode)?.getTextContent();

      const base =
        /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(field) && !/^[\da-f]{8}-[\da-f-]{27}$/i.test(field)
          ? field
          : sourceSlug(title || `${$blockKind(answer)}-question`);

      let key = base,
        n = 2;

      while (used.has(key)) key = `${base}-${n++}`;
      assigned.set(field, key);
      used.add(key);
    }

    const key = assigned.get(field)!;

    if ($settings(answer).sourceKey !== key)
      $setState(answer, settingsState, (settings) => ({ ...settings, sourceKey: key }));
  }
}

export const registerSourceKeys = (editor: LexicalEditor) =>
  editor.registerNodeTransform(RootNode, $ensureSourceKeys);
