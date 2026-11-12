/** @vitest-environment jsdom */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode, $getRoot, type LexicalEditor } from "lexical";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defineEditor } from "../../core/definition";
import { TextModule } from "../../modules/text/module";
import { EditorComposer } from "../composer";
import { InsertDialog } from "./insert-dialog";

let host: HTMLDivElement;

let root: Root;

let editor: LexicalEditor;

// Whether the quiet block can go in: it can when the dialog lists it, and then it can't
let quietAllowed = true;

const definition = defineEditor([
  TextModule(),
  {
    key: "picker-test",
    actions: [
      {
        id: "quiet",
        title: "Quiet block",
        group: "Blocks",
        $available: () => quietAllowed,
        $execute: () => {},
      },
      {
        id: "loud",
        title: "Loud block",
        group: "Blocks",
        $prepare: () => {
          throw new Error("Loud blocks need a page first");
        },
      },
    ],
  },
]);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no layout: the list's highlighted row has nowhere to scroll
  Element.prototype.scrollIntoView = () => {};

  quietAllowed = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});

function Capture() {
  [editor] = useLexicalComposerContext();

  return null;
}

/** Opens the insert dialog on a new last line, and says whether it asked to close. */
async function openInsertDialog() {
  const closed = { asked: false };

  const render = (targetKey: string | null) =>
    act(async () =>
      root.render(
        <EditorComposer definition={definition}>
          <Capture />
          <InsertDialog
            request={targetKey ? { targetKey } : null}
            onClose={() => (closed.asked = true)}
          />
        </EditorComposer>,
      ),
    );

  await render(null);
  let targetKey = "";
  editor.update(
    () => (targetKey = $getRoot().append($createParagraphNode()).getLastChild()!.getKey()),
    {
      discrete: true,
    },
  );
  await render(targetKey);

  return closed;
}

async function choose(title: string) {
  const option = document.querySelector<HTMLElement>(`[role="option"][aria-label="${title}"]`);

  if (!option) throw new Error(`Missing insert option: ${title}`);
  await act(async () => option.click());
}

const alert = () => document.querySelector('[role="alert"]')?.textContent;

test("an insert that fails without saying why says the block can't go there, and the dialog stays open", async () => {
  const closed = await openInsertDialog();

  quietAllowed = false;
  await choose("Quiet block");
  expect(alert()).toBe("This block cannot be inserted here.");
  expect(closed.asked).toBe(false);
});

test("an insert that fails with a reason shows the reason, which a new search clears", async () => {
  const closed = await openInsertDialog();

  await choose("Loud block");
  expect(alert()).toBe("Loud blocks need a page first");
  expect(closed.asked).toBe(false);

  const search = document.querySelector<HTMLInputElement>('input[aria-label="Search blocks"]')!;

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "loud");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(alert()).toBeUndefined();
});

test("a block that goes in closes the dialog", async () => {
  const closed = await openInsertDialog();

  await choose("Quiet block");
  expect(alert()).toBeUndefined();
  expect(closed.asked).toBe(true);
});
