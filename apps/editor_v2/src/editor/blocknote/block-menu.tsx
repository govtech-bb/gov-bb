/**
 * The block's drag-handle menu, with "Edit" above "Delete".
 *
 * BlockNote's default menu offers Delete and colour options. Colours are not
 * in this content model — a document that can set arbitrary text colour is a
 * document whose styling is content, which is the thing block editors exist
 * to stop — so the menu is replaced rather than extended, and carries just
 * the two entries that mean something here.
 */

import {
  AddBlockButton,
  DragHandleButton,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  useComponentsContext,
} from "@blocknote/react";
import type { SideMenuProps } from "@blocknote/react";

/**
 * `onEdit` takes no block: BlockNote passes the `sideMenu` renderer an empty
 * props object, so the hovered block is tracked by the editor surface
 * instead — the same hover that reveals this handle records the id. That is
 * both simpler than reaching into BlockNote's internals and less likely to
 * break under a minor release.
 */
export function BlockSideMenu({ onEdit }: { onEdit: () => void }) {
  return (
    <SideMenuController
      sideMenu={(props: SideMenuProps) => (
        <SideMenu {...props}>
          <AddBlockButton />
          <DragHandleButton
            {...props}
            dragHandleMenu={() => (
              <DragHandleMenu>
                <EditBlockItem onSelect={onEdit} />
                <RemoveBlockItem>Delete</RemoveBlockItem>
              </DragHandleMenu>
            )}
          />
        </SideMenu>
      )}
    />
  );
}

/**
 * Rendered through BlockNote's own components context so it inherits the
 * menu's styling, keyboard handling and roles rather than imitating them.
 */
function EditBlockItem({ onSelect }: { onSelect: () => void }) {
  const Components = useComponentsContext();
  if (!Components) return null;
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={onSelect}
      data-testid="block-menu-edit"
    >
      Edit
    </Components.Generic.Menu.Item>
  );
}
