/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type ElementNode,
  type LexicalEditor,
  type NodeKey,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Editor } from "../../src/editor/react/editor";
import {
  BlockGrip,
  BlockMenuRoot,
  useBlockControls,
  type BlockControls,
} from "../../src/editor/react/block-controls";
import { contentEditor } from "../../src/presets/content";
import { Menu } from "../../src/ui/menu";

let host: HTMLDivElement;

let anchor: HTMLDivElement;

let root: Root;

let editor: LexicalEditor;

let controls: BlockControls;

// Blocks the rail can't stand beside, as a form's title
const unplaced = new Set<NodeKey>();

const onMenuOpen = vi.fn();

const onMenuClose = vi.fn();

function Controls() {
  [editor] = useLexicalComposerContext();

  controls = useBlockControls(anchor, {
    target: {
      $blockAt: () => undefined,
      $caretBlock: () => {
        const selection = $getSelection();

        return $isRangeSelection(selection)
          ? selection.anchor.getNode().getTopLevelElementOrThrow().getKey()
          : null;
      },
      $place: (key) => (unplaced.has(key) ? null : { top: 0, left: 0 }),
    },
    drag: { type: "application/x-test-block", $at: () => null, $drop: () => {} },
    onMenuOpen,
    onMenuClose,
  });

  return (
    <BlockMenuRoot controls={controls}>
      <span data-rail={controls.target?.key ?? ""} data-menu={controls.menu?.key ?? ""} />
      <BlockGrip controls={controls} label="Block options" tip="Drag to move" />
      <Menu.Content aria-label="Block options">
        <Menu.Item>Duplicate</Menu.Item>
      </Menu.Content>
    </BlockMenuRoot>
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  unplaced.clear();
  onMenuOpen.mockClear();
  onMenuClose.mockClear();
  host = document.createElement("div");
  anchor = document.createElement("div");
  document.body.append(host, anchor);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  anchor.remove();
  vi.unstubAllGlobals();
});

/** Two lines of text, First and Second, with the rail's controls beside them. */
async function renderControls() {
  await act(async () =>
    root.render(
      <Editor definition={contentEditor} label="Content">
        <Controls />
      </Editor>,
    ),
  );
  const keys = { first: "", second: "" };

  await act(async () => {
    editor.update(
      () => {
        const [first, second] = ["First", "Second"].map((text) =>
          $createParagraphNode().append($createTextNode(text)),
        );

        $getRoot().clear().append(first!, second!);
        keys.first = first!.getKey();
        keys.second = second!.getKey();
      },
      { discrete: true },
    );
  });

  return keys;
}

const caretIn = (key: NodeKey) =>
  act(async () => {
    editor.update(() => $getNodeByKey<ElementNode>(key)!.selectEnd(), { discrete: true });
  });

async function pressMenuKey() {
  const event = new KeyboardEvent("keydown", {
    key: "/",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });

  await act(async () => {
    host.querySelector('[aria-label="Content"]')!.dispatchEvent(event);
  });

  return event;
}

const grip = () => document.querySelector<HTMLButtonElement>('[aria-label="Block options"]')!;

/** The block the rail is on, and the one the menu is open on ("" for none). */
function shown() {
  const { rail, menu } = document.querySelector<HTMLElement>("[data-rail]")!.dataset;

  return { rail, menu };
}

test("⌘/ opens the menu of the caret's block, and the rail stays with it until the menu closes", async () => {
  const { first, second } = await renderControls();

  await caretIn(second);
  const shortcut = await pressMenuKey();

  expect(shortcut.defaultPrevented).toBe(true);
  expect(shown()).toEqual({ rail: second, menu: second });
  expect(onMenuOpen).toHaveBeenLastCalledWith({ key: second, context: null, byKeyboard: true });

  await caretIn(first);
  expect(shown().rail).toBe(second);

  await act(async () => grip().click());
  expect(shown()).toEqual({ rail: first, menu: "" });
  expect(onMenuClose).toHaveBeenLastCalledWith("trigger-press");
});

test("⌘/ leaves a block the rail can't stand beside alone", async () => {
  const { second } = await renderControls();

  unplaced.add(second);
  await caretIn(second);
  const shortcut = await pressMenuKey();

  expect(shortcut.defaultPrevented).toBe(false);
  expect(shown().menu).toBe("");
  expect(onMenuOpen).not.toHaveBeenCalled();
});

test("the grip opens the menu of the rail's block, and closes it again", async () => {
  const { first } = await renderControls();

  await caretIn(first);
  await act(async () => grip().click());

  expect(shown().menu).toBe(first);
  expect(grip().getAttribute("aria-expanded")).toBe("true");
  expect(onMenuOpen).toHaveBeenLastCalledWith({ key: first, context: null, byKeyboard: false });

  await act(async () => grip().click());
  expect(shown().menu).toBe("");
  expect(grip().getAttribute("aria-expanded")).toBe("false");
});

test("the menu closes as the editor turns read-only", async () => {
  const { second } = await renderControls();

  await caretIn(second);
  await pressMenuKey();
  expect(shown().menu).toBe(second);

  await act(async () => editor.setEditable(false));
  expect(shown().menu).toBe("");
});

test("a block that opens its own menu, pinned, keeps the rail beside it until the menu closes", async () => {
  const { first, second } = await renderControls();

  await caretIn(first);
  await act(async () => controls.openMenu(second, null, { pin: true }));

  expect(shown()).toEqual({ rail: second, menu: second });
  expect(onMenuOpen).toHaveBeenLastCalledWith({ key: second, context: null, byKeyboard: false });

  await act(async () => grip().click());
  expect(shown()).toEqual({ rail: first, menu: "" });
});
