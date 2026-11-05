/** @vitest-environment jsdom */
import { describe, expect, test } from "vitest";
import { act } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $isElementNode, $isParagraphNode, type LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { $availableActions, executeAction } from "../../src/editor/core/actions";
import { EditorComposer } from "../../src/editor/react/composer";
import { PageEditor } from "../../src/pages/editor";
import { $isPageFactNode } from "../../src/pages/modules/fact";
import {
  PageCollectionsProvider,
  type CollectionRecords,
  type PageCollections,
} from "../../src/pages/page-collections";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { renderInPage } from "../helpers/page-editor";

const FACT =
  ':fact[the Drug Service]{collection="contacts" record="barbados-drug-service" field="phone"}';

const page = (body: string) => `---\ntitle: Get a drug licence\n---\n\n${body}\n`;

const CONTACTS: CollectionRecords = {
  collection: {
    key: "contacts",
    title: "Contacts",
    record_key: "key",
    schema: {
      fields: [
        { key: "key", label: "Key" },
        { key: "name", label: "Name" },
        { key: "phone", label: "Telephone" },
        { key: "email", label: "Email" },
      ],
    },
  },
  records: [
    {
      record_key: "barbados-drug-service",
      data: {
        key: "barbados-drug-service",
        name: "Barbados Drug Service",
        phone: "(246) 535-0021",
        email: "drugservice@health.gov.bb",
      },
    },
  ],
};

function visual(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode !== "visual") throw new Error(prepared.diagnostics[0]?.message);

  return prepared.state;
}

describe("a fact's Markdown", () => {
  test("opens as a fact in its sentence and saves back exactly", () => {
    const source = page(`Call ${FACT} if you have questions.`);
    const state = visual(source);
    const editor = createHeadlessEditor(govbbPageEditor, state);

    expect(
      editor.getEditorState().read(() =>
        $getRoot()
          .getChildren()
          .find($isParagraphNode)
          ?.getChildren()
          .map((node) => node.getType()),
      ),
    ).toEqual(["text", "page-fact", "text"]);
    expect(govbbPageCodec.encode(state)).toBe(source);
  });

  test.each([
    ["a list item", `- Call ${FACT}`],
    ["a heading", `## Call ${FACT}`],
    ["a notice", `:::notice\nCall ${FACT}\n:::`],
    ["a table cell", `| Office | Phone |\n| - | - |\n| Drug Service | ${FACT} |`],
  ])("keeps a fact in %s", (_, body) => {
    const saved = govbbPageCodec.encode(visual(page(body)));

    expect(saved).toContain(FACT);
    expect(govbbPageCodec.encode(visual(saved))).toBe(saved);
  });

  test("keeps its attributes as written until the page is edited, then writes them in order", () => {
    const source = page('Call :fact{field="phone" record="x" collection="contacts"}. Thanks.');
    const editor = createHeadlessEditor(govbbPageEditor, visual(source));

    expect(govbbPageCodec.encode(visual(source))).toBe(source);
    editor.update(
      () => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === ". Thanks.");

        text!.setTextContent(". Thank you.");
      },
      { discrete: true },
    );
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toContain(
      ':fact{collection="contacts" record="x" field="phone"}. Thank you.',
    );
  });

  test("writes a fact still to be chosen with its record and field bare", () => {
    const editor = createHeadlessEditor(govbbPageEditor, visual(page("Call us.")));
    const targetKey = editor.getEditorState().read(() => $getRoot().getLastChild()!.getKey());

    editor.update(() => $getRoot().getLastChild()!.selectEnd(), { discrete: true });
    expect(executeAction(editor, govbbPageEditor, "page-fact", { targetKey }).executed).toBe(true);
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toContain(
      'Call us.:fact{collection="contacts" record field}',
    );
  });

  test("leaves a fact in a button's label to Markdown source editing", () => {
    const prepared = govbbPageCodec.prepare(
      page('::action[Call :fact{collection="contacts" record="x" field="phone"}]{href="/x"}'),
    );

    expect(prepared.mode).toBe("source");
  });
});

describe("inserting a fact", () => {
  test("is offered from / at a caret in text, but not from the insert menu or in a link's text", () => {
    const editor = createHeadlessEditor(
      govbbPageEditor,
      visual(page("Call us. See [the office](/office).")),
    );

    const offered = (text: string, mode?: string) => {
      let found = false;

      editor.update(
        () => {
          const node = $getRoot()
            .getAllTextNodes()
            .find((item) => item.getTextContent() === text)!;

          node.select(1, 1);
          found = $availableActions(editor, govbbPageEditor, {
            targetKey: node.getTopLevelElementOrThrow().getKey(),
            typed: "/fact",
            mode,
          }).some((action) => action.id === "page-fact");
        },
        { discrete: true },
      );

      return found;
    };

    expect(offered("Call us. See ")).toBe(true);
    expect(offered("Call us. See ", "below")).toBe(false);
    expect(offered("the office")).toBe(false);
  });
});

let editor: LexicalEditor;

function Capture() {
  [editor] = useLexicalComposerContext();

  return null;
}

async function mount(source: string, collections: PageCollections) {
  await renderInPage(
    <PageCollectionsProvider collections={collections}>
      <EditorComposer definition={govbbPageEditor} initialState={visual(source)}>
        <Capture />
        <PageEditor />
      </EditorComposer>
    </PageCollectionsProvider>,
  );
  // The collection's read settles
  await act(async () => {});
}

const chip = () => document.querySelector<HTMLButtonElement>('[aria-label$="Change the fact."]')!;

const picker = () => document.querySelector<HTMLElement>('[aria-label="Fact from a collection"]');

describe("a fact in the editor", () => {
  test("shows the record's current value, named by its detail and record", async () => {
    await mount(page(`Call ${FACT} today.`), { read: async () => CONTACTS });

    expect(chip().textContent).toBe("(246) 535-0021");
    expect(chip().getAttribute("aria-label")).toBe(
      "Telephone of Barbados Drug Service, from Contacts Change the fact.",
    );
  });

  test("warns, and shows its fallback, when the record has gone", async () => {
    await mount(page(`Call ${FACT.replace("barbados-drug-service", "closed-office")}.`), {
      read: async () => CONTACTS,
    });

    expect(chip().textContent).toBe("the Drug Service");
    expect(chip().className).toContain("bg-red-10");
    expect(chip().getAttribute("aria-label")).toContain(
      "There's no record “closed-office” in Contacts. The page shows “the Drug Service” instead.",
    );
  });

  test("opens its picker once inserted, to choose the record and detail", async () => {
    await mount(page("Call us."), { read: async () => CONTACTS });
    const targetKey = editor.getEditorState().read(() => $getRoot().getLastChild()!.getKey());

    await act(async () => {
      editor.update(() => $getRoot().getLastChild()!.selectEnd(), { discrete: true });
      executeAction(editor, govbbPageEditor, "page-fact", { targetKey });
    });
    await act(async () => {});

    expect(chip().textContent).toBe("Choose a fact");
    expect(picker()).not.toBeNull();
  });

  test("changes its detail from the picker", async () => {
    await mount(page(`Call ${FACT} today.`), { read: async () => CONTACTS });
    await act(async () => chip().click());

    const detail = [...picker()!.querySelectorAll("select")].find((select) =>
      [...select.options].some((option) => option.value === "email"),
    )!;

    await act(async () => {
      detail.value = "email";
      detail.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(chip().textContent).toBe("drugservice@health.gov.bb");
    expect(
      editor.getEditorState().read(
        () =>
          $getRoot()
            .getChildren()
            .flatMap((node) => ($isElementNode(node) ? node.getChildren() : []))
            .find($isPageFactNode)
            ?.getSettings().field,
      ),
    ).toBe("email");
  });
});
