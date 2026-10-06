import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $setSelection,
  mergeRegister,
  RootNode,
  type ElementNode,
  type LexicalEditor,
} from "lexical";
import { $installedField } from "../../editor/field-context";
import {
  $autoPageTitle,
  $blockGroup,
  $blockKind,
  $createPageTitleNode,
  $depth,
  $formBlocks,
  $headStart,
  $isFormTitleNode,
  $isInput,
  $isPageBreak,
  $isPageDescriptionNode,
  $isPageHead,
  $isPageStart,
  $isPageTitleNode,
  $isQuestionNode,
  $nextBlock,
  $pageHead,
  $pageType,
  $prevBlock,
  $setDepth,
  $setSettings,
  $settings,
  $takesHead,
  serviceLine,
} from "../../editor/nodes";

/** Keep each page's editable heading beside its start, migrating old page names without losing text. */
export function $normalizePageHeads(root: RootNode) {
  for (const start of root.getChildren().filter($isPageStart)) {
    const page = [];

    for (let node = $nextBlock(start); node && !$isPageBreak(node); node = $nextBlock(node))
      page.push(node);
    const wants = $takesHead(start);
    let title = wants ? page.find($isPageTitleNode) : undefined;

    if (wants && !title) {
      const name = $settings(start).name;
      const oldName = typeof name === "string" ? name.trim() : "";
      const first = page[0];

      if (!oldName && $isQuestionNode(first) && !$blockGroup(first).some($isInput)) {
        title = first.replace($createPageTitleNode(), true);
      } else {
        title = $createPageTitleNode();

        if (oldName) title.append($createTextNode(oldName));
      }

      start.insertAfter(title);
    }

    if (title && !$nextBlock(start)?.is(title)) {
      const description = $nextBlock(title);
      start.insertAfter(title);

      if ($isPageDescriptionNode(description)) title.insertAfter(description);
    }

    if (wants && $settings(start).name !== undefined) $setSettings(start, { name: undefined });

    for (const node of page) {
      if (!node.isAttached() || !$isPageHead(node) || node.is(title)) continue;

      if ($isPageDescriptionNode(node) && title && $prevBlock(node)?.is(title)) continue;

      if (node.getTextContent())
        node.replace($setDepth($createParagraphNode(), $depth(node)), true);
      else node.remove();
    }
  }
}

/** Derived canvas details stay out of saved content. */
export function markPageHeads(editor: LexicalEditor) {
  return editor.registerUpdateListener(({ editorState }) =>
    editorState.read(
      () => {
        const blocks = $formBlocks();

        for (const start of blocks.filter($isPageStart)) {
          const head = $pageHead(start);
          const confirmation = $pageType(start) === "confirmation";
          head.forEach((block, i) => {
            const dom = editor.getElementByKey(block.getKey());

            if ($isPageTitleNode(block))
              dom
                ?.querySelector(":scope > [data-text]")
                ?.setAttribute("data-placeholder", $autoPageTitle(start));
            const receipt = dom?.querySelector<HTMLElement>(":scope > [data-receipt]");

            if (receipt) receipt.hidden = !(confirmation && i === head.length - 1);
          });
        }

        for (const block of blocks.filter($isQuestionNode)) {
          const input = $blockGroup(block).find($isInput);
          const field = input && $installedField($blockKind(input));
          const canHideLabel = field?.capabilities.hideLabel ?? true;
          editor
            .getElementByKey(block.getKey())
            ?.toggleAttribute(
              "data-label-hidden",
              !!input && $settings(input).hideLabel === true && canHideLabel,
            );
        }
      },
      { editor },
    ),
  );
}

export const registerPageHeads = (editor: LexicalEditor) =>
  mergeRegister(editor.registerNodeTransform(RootNode, $normalizePageHeads), markPageHeads(editor));

/** Undefined leaves ordinary blocks alone; false lets Lexical split the plain-text head. */
export function $enterInHead(block: ElementNode, atStart: boolean): boolean | undefined {
  if ($isFormTitleNode(block)) {
    const [title] = $pageHead(block);

    if (!title) return undefined;
    title.selectStart();

    return true;
  }

  if (!$isPageHead(block)) return undefined;

  if ($isPageDescriptionNode(block) && block.isEmpty()) {
    block.replace($setDepth($createParagraphNode(), 0)).selectStart();

    return true;
  }

  if (atStart && !block.isEmpty()) return true;
  const next = $nextBlock(block);

  if ($isPageTitleNode(block) && $isPageDescriptionNode(next)) {
    next.selectStart();

    return true;
  }

  return false;
}

/** Prevent a page heading from joining across a page boundary. */
export function $deleteAtHead(
  block: ElementNode,
  backward: boolean,
  target: ElementNode | null,
): boolean {
  if ($isPageTitleNode(block)) {
    if (!backward) return block.isEmpty() || !$isPageDescriptionNode(target);
    const start = $headStart(block);

    if ($isPageBreak(start)) {
      const selection = $createNodeSelection();
      selection.add(start.getKey());
      $setSelection(selection);
    }

    return true;
  }

  return !backward && $isPageTitleNode(target);
}

export function ServiceName({ text }: { text: string }) {
  return <p className={serviceLine}>{text || "Service name"}</p>;
}
