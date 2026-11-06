import type { BaseUIEvent } from "@base-ui/react/types";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DotsSixVertical } from "@phosphor-icons/react";
import { COMMAND_PRIORITY_LOW, KEY_DOWN_COMMAND, type NodeKey } from "lexical";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Menu } from "../../ui/menu";
import { Tip } from "../../ui/tooltip";
import {
  RailButton,
  railGrip,
  useBlockDrag,
  useRailTarget,
  type DragRules,
  type Line,
  type TargetRules,
} from "./block-rail";

// The block rail's controls, shared by the page and form editors: the block menu its grip opens, ⌘/ opening it on the
// caret's block, and a drag that goes nowhere opening it too. Each editor brings its rules, its menu's contents and
// what closing the menu does with the focus.

/**
 * The block a menu is open on, the node in it the pointer was on (for settings that belong to part of it), and whether
 * ⌘/ opened it.
 */
export type BlockMenuTarget = { key: NodeKey; context: NodeKey | null; byKeyboard: boolean };

/**
 * The rail's target (see useRailTarget), a block's drag (see useBlockDrag) and its block menu, for an editor's block
 * controls to lay out with BlockMenuRoot and BlockGrip.
 */
export function useBlockControls<At extends { line: Line }>(
  anchor: HTMLElement,
  {
    target: targetRules,
    drag: dragRules,
    held = false,
    onMenuOpen,
    onMenuClose,
  }: {
    target: Omit<TargetRules, "held">;
    drag: Omit<DragRules<At>, "onEnd" | "onNudge">;
    /** Holds the rail on its block while something of the editor's own is open on it, such as an insert menu. */
    held?: boolean;
    /** When the menu opens, from the grip or ⌘/, so the editor can close what else it had open and plan the focus. */
    onMenuOpen?: (menu: BlockMenuTarget) => void;
    /** When the menu closes, and how (Base UI's reason), so the editor can put the focus back. */
    onMenuClose?: (reason?: string) => void;
  },
) {
  const [editor] = useLexicalComposerContext();
  const [menu, setMenu] = useState<BlockMenuTarget | null>(null);
  // ⌘/ pinned the rail on the caret's block: closing the menu lets the pointer and caret lead it again
  const pinned = useRef(false);
  const { target, pin, release } = useRailTarget(anchor, { ...targetRules, held: held || !!menu });

  const openMenu = (
    key: NodeKey,
    context: NodeKey | null = null,
    { byKeyboard = false, pin: pinRail = byKeyboard }: { byKeyboard?: boolean; pin?: boolean } = {},
  ) => {
    if (!editor.isEditable()) return;

    if (pinRail) pin(key);
    pinned.current = pinRail;
    const next = { key, context, byKeyboard };
    setMenu(next);
    onMenuOpen?.(next);
  };

  const closeMenu = (reason?: string) => {
    setMenu(null);
    onMenuClose?.(reason);

    if (!pinned.current) return;
    pinned.current = false;
    release();
  };

  const drag = useBlockDrag(anchor, {
    ...dragRules,
    onEnd: release,
    // A press on the grip that slipped into a drag opens the menu, as the click would have
    onNudge: (key) => openMenu(key, target?.key === key ? target.context : null),
  });

  const latest = useRef({ rules: targetRules, openMenu, closeMenu });

  useEffect(() => {
    latest.current = { rules: targetRules, openMenu, closeMenu };
  });

  // ⌘/ opens the menu of the caret's block, where the rail can stand beside it
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            !editor.isEditable() ||
            !(event.metaKey || event.ctrlKey) ||
            event.altKey ||
            event.key !== "/"
          )
            return false;
          const key = latest.current.rules.$caretBlock();

          if (!key || !latest.current.rules.$place(key)) return false;
          event.preventDefault();
          latest.current.openMenu(key, null, { byKeyboard: true });

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  // The editor turning read-only closes the menu and lets the rail go
  useEffect(
    () =>
      editor.registerEditableListener((editable) => {
        if (editable) return;
        setMenu(null);
        pinned.current = false;
        release();
      }),
    [editor, release],
  );

  // The same functions every render, so an editor's own effects and commands can hold them
  const openLatestMenu = useCallback(
    (key: NodeKey, context: NodeKey | null = null, options: { pin?: boolean } = {}) =>
      latest.current.openMenu(key, context, options),
    [],
  );

  const closeLatestMenu = useCallback((reason?: string) => latest.current.closeMenu(reason), []);

  return {
    target,
    /** The block the menu is open on, or null while it's closed. */
    menu,
    /**
     * Opens a block's menu, on the node in it that settings belong to. With `pin`, the rail stands beside the block
     * until the menu closes, for a block that opens its own menu, such as one that still needs setting up.
     */
    openMenu: openLatestMenu,
    /** Closes the menu, and says how (Base UI's reason). */
    closeMenu: closeLatestMenu,
    drag,
  };
}

/** The block controls an editor lays out: see useBlockControls. */
export type BlockControls = ReturnType<typeof useBlockControls>;

/** The block menu's root: its grip (BlockGrip) is the trigger, and its contents are the editor's. */
export function BlockMenuRoot({
  controls,
  children,
}: {
  controls: BlockControls;
  children: ReactNode;
}) {
  const { menu, target } = controls;

  return (
    <Menu.Root
      open={!!menu}
      onOpenChange={(open, { reason }) => {
        if (!open) controls.closeMenu(reason);
        else if (!menu && target) controls.openMenu(target.key, target.context);
      }}
    >
      {children}
    </Menu.Root>
  );
}

/** The rail's grip: drag it to move the block, or click it, or press ⌘/, for the block's menu. */
export function BlockGrip({
  controls,
  label,
  tip,
  side,
}: {
  controls: BlockControls;
  /** Names what it opens, the block's menu; its tip says it also drags. */
  label: string;
  tip: ReactNode;
  side?: ComponentProps<typeof Tip>["side"];
}) {
  const { target, menu, drag } = controls;

  if (!target) return null;

  return (
    <Tip hint side={side} content={tip}>
      <Menu.Trigger
        render={
          <RailButton
            aria-label={label}
            draggable
            className={railGrip}
            onDragStart={(event) => {
              if (menu) controls.closeMenu();
              drag.start(event, target.key);
            }}
            // Base UI opens a menu on mousedown, which would swallow the drag: it opens on click instead
            onMouseDown={(event: BaseUIEvent<MouseEvent<HTMLButtonElement>>) =>
              event.preventBaseUIHandler()
            }
            onClick={() =>
              menu
                ? controls.closeMenu("trigger-press")
                : controls.openMenu(target.key, target.context)
            }
          >
            <DotsSixVertical />
          </RailButton>
        }
      />
    </Tip>
  );
}
