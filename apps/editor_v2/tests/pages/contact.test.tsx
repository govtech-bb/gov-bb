/** @vitest-environment jsdom */
import { describe, expect, test, vi } from "vitest";
import { act } from "react";
import { $getRoot } from "lexical";
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
  test("shows the record's current details, linking only safe addresses", async () => {
    await mount(`${CONTACT.replace("phone,email,hours", "phone,email,website,hours")}\n`, {
      read: async () => CONTACTS,
    });
    const block = pageControl(".page-contacts");
    expect(block.textContent).toContain("Telephone(246) 535-0021");
    expect(block.textContent).toContain("Opening hours8:30am to 4:30pm");
    expect([...block.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "tel:2465350021",
      "mailto:drugservice@health.gov.bb",
      // A script address is read as a site name, never run
      "https://javascript:alert(1)",
    ]);
    expect(block.querySelector('a[href^="javascript"]')).toBeNull();
  });

  test("warns when the record has gone", async () => {
    await mount(`${CONTACT.replace("barbados-drug-service", "closed-office")}\n`, {
      read: async () => CONTACTS,
    });
    expect(pageControl(".page-contact-warning[role=alert]").textContent).toContain(
      "There's no contact record “closed-office” in Contacts",
    );
  });

  test("warns when the collection has gone", async () => {
    await mount(`${CONTACT}\n`, { read: async () => null });
    expect(pageControl(".page-contact-warning").textContent).toContain(
      "no contact record “barbados-drug-service”",
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

    const open = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Open the record to change it",
    );

    await act(async () => open!.click());
    expect(openRecord).toHaveBeenCalledWith("contacts", "barbados-drug-service");
  });
});
