import { ArrowDown, ArrowLineUp, ArrowUp, Copy, Trash } from "@phosphor-icons/react";
import { $getNodeByKey, type NodeKey } from "lexical";
import { shortcut } from "../../editor/react/shortcut";
import { Menu } from "../../ui/menu";
import { $isPageBreak } from "../editor/nodes";
import { $canMovePage, $pageQuestionCount } from "../editor/structure";

/** What a form page's menu needs: the questions that go with it, and where it can move. */
export type PageMenuModel = { questions: number; up: boolean; down: boolean };

/** A page's menu, when the block is a page break; null for any other block. */
export function $describePage(key: NodeKey): PageMenuModel | null {
  const node = $getNodeByKey(key);

  return $isPageBreak(node)
    ? {
        questions: $pageQuestionCount(node),
        up: $canMovePage(node, false),
        down: $canMovePage(node, true),
      }
    : null;
}

export type PageMenuActions = {
  onMove: (down: boolean) => void;
  onDuplicate: () => void;
  onMerge: () => void;
  onDelete: () => void;
};

/** "Delete page and 4 questions": the delete names what goes with the page. */
export const deletePageLabel = (questions: number) =>
  questions ? `Delete page and ${questions} question${questions === 1 ? "" : "s"}` : "Delete page";

/**
 * A form page's menu, from its grip: every action takes the whole page, folded or not, and none of them its questions'
 * settings. Page 1 starts with the form title, so it has no grip and never moves.
 */
export function PageMenu({
  model,
  actions: a,
  finalFocus,
}: {
  model: PageMenuModel;
  actions: PageMenuActions;
  finalFocus?: () => boolean;
}) {
  return (
    <Menu.Content
      aria-label="Page actions"
      side="left"
      sideOffset={4}
      finalFocus={finalFocus}
      className="w-75"
    >
      <Menu.Group>
        <Menu.Item icon={<ArrowUp />} disabled={!model.up} onClick={() => a.onMove(false)}>
          Move up
        </Menu.Item>
        <Menu.Item icon={<ArrowDown />} disabled={!model.down} onClick={() => a.onMove(true)}>
          Move down
        </Menu.Item>
        <Menu.Item icon={<Copy />} detail={shortcut(["mod", "d"])} onClick={a.onDuplicate}>
          Duplicate
        </Menu.Item>
        <Menu.Item icon={<ArrowLineUp />} onClick={a.onMerge}>
          Merge with previous page
        </Menu.Item>
      </Menu.Group>
      <Menu.Group>
        <Menu.Item variant="danger" icon={<Trash />} onClick={a.onDelete}>
          {deletePageLabel(model.questions)}
        </Menu.Item>
      </Menu.Group>
    </Menu.Content>
  );
}
