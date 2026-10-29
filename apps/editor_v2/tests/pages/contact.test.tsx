/** @vitest-environment jsdom */
import { describe, expect, test, vi } from "vitest";
import { act } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, type LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { $availableActions, executeAction, rankActions } from "../../src/editor/core/actions";
import { EditorComposer } from "../../src/editor/react/composer";
import { PageEditor } from "../../src/pages/editor";
import {
  $isPageContactNode,
  PageCollectionsProvider,
  type CollectionRecords,
  type PageCollections,
} from "../../src/pages/modules/contact";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { hoverPageMenu, pageControl, renderInPage } from "../helpers/page-editor";

const CONTACT =
  '::contact{collection="contacts" record="barbados-drug-service" fields="phone,email,hours"}';

const PAGE = `---\ntitle: Get a drug licence\n---\n\n## Get help\n\nCall the Drug Service if you have questions.\n\n${CONTACT}\n`;

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
        { key: "website", label: "Website" },
        { key: "hours", label: "Opening hours" },
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
        website: "javascript:alert(1)",
        hours: "8:30am to 4:30pm",
      },
    },
    {
      record_key: "nis-severance-payment-department",
      data: { key: "nis-severance-payment-department", name: "NIS Severance", phone: "431-7400" },
    },
  ],
};

function visual(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode !== "visual") throw new Error(prepared.diagnostics[0]?.message);

  return prepared.state;
}

describe("the contact block's Markdown", () => {
  test("opens as a contact block and saves back exactly", () => {
    const state = visual(PAGE);
    expect(state.root.children.map((node) => node.type)).toContain("page-contact");
    expect(govbbPageCodec.encode(state)).toBe(PAGE);
  });

  test("keeps the block exactly when another part of the page changes, and reopens the same", () => {
    const editor = createHeadlessEditor(govbbPageEditor, visual(PAGE));
    editor.update(
      () => {
        const heading = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "Get help");

        heading!.setTextContent("Contact us");
      },
      { discrete: true },
    );
    const saved = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(saved).toBe(PAGE.replace("## Get help", "## Contact us"));
    expect(govbbPageCodec.encode(visual(saved))).toBe(saved);
  });

  test("saves a changed record and fields in the decided form", () => {
    const editor = createHeadlessEditor(govbbPageEditor, visual(PAGE));
    editor.update(
      () => {
        const block = $getRoot().getChildren().find($isPageContactNode);
        block!.setSettings({ record: "nis-severance-payment-department", fields: ["phone"] });
      },
      { discrete: true },
    );
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toContain(
      '::contact{collection="contacts" record="nis-severance-payment-department" fields="phone"}',
    );
  });

  test.each([
    ['::contact{collection="contacts" record="x" fields="phone" onclick="y"}'],
    ['::contact{record="x" fields="phone"}'],
    ['::contact[Label]{collection="contacts" record="x" fields="phone"}'],
    ['::contact{collection="contacts" record="x" fields="phone, email"}'],
    ['::contact{collection="contacts" record="x" fields="phone,,email"}'],
    ['::contact{record="x" collection="contacts" fields="phone"}'],
  ])("leaves a contact block it can't keep exactly to source editing: %s", (source) => {
    expect(govbbPageCodec.prepare(`${source}\n`).mode).toBe("source");
  });
});

describe("inserting Contact details", () => {
  test("from a list item's / menu, goes after the list rather than into the item", () => {
    const editor = createHeadlessEditor(govbbPageEditor, visual("- One\n- Two\n"));

    const targetKey = editor.getEditorState().read(() =>
      $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent() === "Two")!
        .getParent()!
        .getKey(),
    );

    expect(
      executeAction(editor, govbbPageEditor, "page-contact", { targetKey, typed: "/" }).executed,
    ).toBe(true);
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(
      '- One\n- Two\n\n::contact{collection="contacts" record fields="phone,email,hours"}\n',
    );
  });

  test("is offered by the / menu", () => {
    const editor = createHeadlessEditor(govbbPageEditor, visual("Intro\n"));

    const offered = editor.getEditorState().read(() => {
      const line = $getRoot().getLastChild()!;

      return rankActions(
        "contact",
        $availableActions(editor, govbbPageEditor, { targetKey: line.getKey(), typed: "/contact" }),
      ).map((action) => action.title);
    });

    expect(offered[0]).toBe("Contact details");
  });

  test("adds a block for a record to choose, with writing going on below it", () => {
    const editor = createHeadlessEditor(govbbPageEditor, visual("Intro\n"));
    const targetKey = editor.getEditorState().read(() => $getRoot().getLastChild()!.getKey());
    expect(
      executeAction(editor, govbbPageEditor, "page-contact", { targetKey, mode: "below" }).executed,
    ).toBe(true);
    // An empty attribute is written bare, and reads back as empty
    const saved = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(saved).toBe(
      'Intro\n\n::contact{collection="contacts" record fields="phone,email,hours"}\n',
    );
    expect(govbbPageCodec.encode(visual(saved))).toBe(saved);
  });
});

async function mount(source: string, collections: PageCollections) {
  await renderInPage(
    <PageCollectionsProvider collections={collections}>
      <EditorComposer definition={govbbPageEditor} initialState={visual(source)}>
        <PageEditor />
      </EditorComposer>
    </PageCollectionsProvider>,
  );
  // The record's read settles
  await act(async () => {});
}

describe("the contact block in the editor", () => {
  test("shows the record's current details, with no links to leave the editor by", async () => {
    await mount(`${CONTACT.replace("phone,email,hours", "phone,email,website,hours")}\n`, {
      read: async () => CONTACTS,
    });
    const block = pageControl(".page-contacts");
    expect(block.getAttribute("role")).toBe("group");
    expect(block.textContent).toContain("Telephone(246) 535-0021");
    expect(block.textContent).toContain("Opening hours8:30am to 4:30pm");
    // The site links the phone, email and website. In the editor a press on a tile stays on the page being edited
    expect(block.querySelector("a")).toBeNull();
  });

  test("warns when the record has gone", async () => {
    await mount(`${CONTACT.replace("barbados-drug-service", "closed-office")}\n`, {
      read: async () => CONTACTS,
    });
    expect(pageControl(".page-contact-warning[role=alert]").textContent).toContain(
      "There's no contact record “closed-office” in Contacts",
    );
  });

  test("with no details chosen, asks for them calmly rather than warning", async () => {
    await mount(`${CONTACT.replace("phone,email,hours", "")}\n`, { read: async () => CONTACTS });
    const block = pageControl(".page-contact-block");

    expect(block.textContent).toContain("Choose the details this block shows.");
    expect(block.querySelector("[role=alert]")).toBeNull();
    expect([...block.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Choose details",
    ]);
  });

  test("warns when the collection has gone", async () => {
    await mount(`${CONTACT}\n`, { read: async () => null });
    expect(pageControl(".page-contact-warning").textContent).toContain(
      "no contact record “barbados-drug-service”",
    );
  });

  test("a block inserted for a record to choose opens Block options on the record, and offers them again", async () => {
    Element.prototype.scrollIntoView = () => {};

    let editor!: LexicalEditor;

    function Capture() {
      [editor] = useLexicalComposerContext();

      return null;
    }

    await renderInPage(
      <PageCollectionsProvider collections={{ read: async () => CONTACTS }}>
        <EditorComposer definition={govbbPageEditor} initialState={visual("Intro\n")}>
          <PageEditor />
          <Capture />
        </EditorComposer>
      </PageCollectionsProvider>,
    );
    const targetKey = editor.getEditorState().read(() => $getRoot().getLastChild()!.getKey());
    await act(async () => {
      executeAction(editor, govbbPageEditor, "page-contact", { targetKey, mode: "below" });
    });

    // Choosing a record is the one thing it still needs, so that's where the focus goes
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(pageControl(".page-component-settings select")),
    );

    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await vi.waitFor(() => expect(document.querySelector(".page-component-settings")).toBeNull());

    // Closed without one, the block itself offers the choice
    const choose = [...pageControl(".page-contact-block").querySelectorAll("button")].find(
      (button) => button.textContent === "Choose a record",
    )!;

    await act(async () => choose.click());
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(pageControl(".page-component-settings select")),
    );
  });

  test("Block options pick the record and details, and open the record to change it", async () => {
    Element.prototype.scrollIntoView = () => {};

    const openRecord = vi.fn();
    await mount(`${CONTACT}\n`, { read: async () => CONTACTS, openRecord });
    await hoverPageMenu(pageControl(".page-contact-block"));
    await act(async () => {});

    const select = pageControl<HTMLSelectElement>(".page-component-settings select");
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Choose a record",
      "Barbados Drug Service",
      "NIS Severance",
    ]);

    // Each choice applies as it's made: there's nothing to apply, and closing the menu can't drop one
    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent === "Apply settings",
      ),
    ).toBe(false);
    await act(async () => {
      select.value = "nis-severance-payment-department";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {});
    expect(pageControl(".page-contact-block").textContent).toContain("431-7400");
    await act(async () => {
      select.value = "barbados-drug-service";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const open = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Open the record to change it",
    );

    await act(async () => open!.click());
    expect(openRecord).toHaveBeenCalledWith("contacts", "barbados-drug-service");
  });
});
