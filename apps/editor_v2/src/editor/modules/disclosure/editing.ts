import {
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalEditor,
  type RangeSelection,
} from "lexical";
import { $depth, $setDepth, $settings } from "../../core/document-state";
import { $isShowHideNode, type ShowHideNode } from "./nodes";
import { $paragraphBefore, $toText } from "../formatting/editing";

export function $enterDisclosure(block: ElementNode, atStart: boolean): boolean {
  return $isShowHideNode(block) && !block.isEmpty() && atStart ? $paragraphBefore(block) : false;
}

export function $exitDisclosure(block: ElementNode): boolean {
  if (!$isShowHideNode(block) || block.isEmpty()) return false;
  $toText(block);

  return true;
}

export function $disclosureSelection() {
  const selection = $getSelection();

  const block = $isRangeSelection(selection)
    ? selection.anchor.getNode().getTopLevelElement()
    : null;

  return $isRangeSelection(selection) && $isShowHideNode(block) ? { selection, block } : null;
}

export function $pasteDisclosure(
  selection: RangeSelection,
  block: ElementNode,
  text: string,
): boolean {
  if (!$isShowHideNode(block)) return false;
  selection.insertText(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" "),
  );

  return true;
}

/** Empty text at the end of a disclosure exits one level, retaining its root-block representation. */
export function $exitDisclosureBody(block: ElementNode): boolean {
  if (!$isParagraphNode(block) || !block.isEmpty() || !$depth(block)) return false;
  const next = block.getNextSibling();

  if (next && $depth(next) >= $depth(block)) return false;
  $setDepth(block, $depth(block) - 1);
  block.selectStart();

  return true;
}

/** Content-only nesting display; forms keep their richer nesting projection in their own adapter. */
export function markDisclosures(editor: LexicalEditor) {
  return editor.registerUpdateListener(({ editorState }) =>
    editorState.read(
      () => {
        const hosts: ShowHideNode[] = [];

        for (const block of $getRoot().getChildren()) {
          while (hosts.length && $depth(hosts.at(-1)!) >= $depth(block)) hosts.pop();
          const dom = editor.getElementByKey(block.getKey());

          if (dom) {
            dom.hidden = hosts.some((host) => !!$settings(host).folded);
            dom.toggleAttribute("data-nested", hosts.length > 0);

            if (hosts.length) dom.style.setProperty("--nest", `${hosts.length * 28}px`);
            else dom.style.removeProperty("--nest");
          }

          if ($isShowHideNode(block)) hosts.push(block);
        }
      },
      { editor },
    ),
  );
}
