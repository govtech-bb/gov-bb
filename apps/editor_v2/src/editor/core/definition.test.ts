import { expect, test } from "vitest";
import {
  ParagraphNode,
  TextNode,
  createEditor,
  type SerializedEditorState,
  type SerializedElementNode,
} from "lexical";
import { defineEditor } from "./definition";
import type { DocumentNodeDefinition, EditorModule, EditorRegistration } from "./module";
import { TextModule } from "../modules/text/module";
import type { EditorAction } from "./actions";

const paragraph: DocumentNodeDefinition = { type: "paragraph", node: ParagraphNode };

const document = (): SerializedEditorState => {
  const child: SerializedElementNode = {
    type: "paragraph",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [],
  };

  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [child],
    },
  };
};

const registration: EditorRegistration = {
  key: "save",
  phase: "document",
  register: () => () => {},
};

test("composition reports duplicate module and registration identities", () => {
  expect(() => defineEditor([{ key: "same" }, { key: "same" }])).toThrow(
    "Duplicate module key: same",
  );
  expect(() =>
    defineEditor([
      { key: "first", registrations: [registration] },
      { key: "second", registrations: [registration] },
    ]),
  ).toThrow("Duplicate registration key: save");
});

test("composition rejects missing capabilities and multiple history or document owners", () => {
  expect(() => defineEditor([{ key: "questions", requires: ["text"] }])).toThrow(
    "Module questions requires text",
  );
  expect(() =>
    defineEditor([
      { key: "first", historyOwner: "first" },
      { key: "second", historyOwner: "second" },
    ]),
  ).toThrow("Multiple history owners");
  expect(() =>
    defineEditor([
      { key: "first", $initialize: () => {} },
      { key: "second", $initialize: () => {} },
    ]),
  ).toThrow("multiple default document initializers");
  expect(
    defineEditor([
      { key: "questions", requires: ["text"] },
      { key: "text", provides: ["text"] },
    ]).moduleKeys,
  ).toEqual(["questions", "text"]);
});

test("identical shared node declarations deduplicate while conflicting owners and false type names fail", () => {
  const shared = defineEditor([
    { key: "first", nodes: [paragraph] },
    { key: "second", nodes: [paragraph] },
  ]);

  expect(shared.nodes).toHaveLength(1);
  expect(() =>
    defineEditor([
      { key: "first", nodes: [paragraph] },
      { key: "second", nodes: [{ ...paragraph }] },
    ]),
  ).toThrow("Conflicting node owner: paragraph");
  expect(() =>
    defineEditor([{ key: "false-name", nodes: [{ type: "paragraph", node: TextNode }] }]),
  ).toThrow("does not match text");
});

test("resolved definitions snapshot validators, registration arrays, theme and lifecycle callbacks", () => {
  const calls: string[] = [];

  const declaration = {
    type: "paragraph",
    node: ParagraphNode,
    validate: (): string | undefined => "Original validation",
  };

  const nodes: DocumentNodeDefinition[] = [declaration];
  const registrations = [{ ...registration }];

  const theme = {
    text: { bold: "original-bold" },
    list: { ulDepth: ["original-list"], nested: { list: "original-nested" } },
  };

  const module: EditorModule = {
    key: "original",
    nodes,
    registrations,
    theme,
    $normalizeInitial: () => {
      calls.push("original");
    },
  };

  const modules = [module];
  const definition = defineEditor(modules);
  declaration.validate = () => undefined;
  nodes.length = 0;
  registrations[0]!.register = () => {
    calls.push("changed registration");

    return () => {};
  };

  registrations.length = 0;
  theme.text.bold = "changed-bold";
  theme.list.ulDepth[0] = "changed-list";
  theme.list.nested.list = "changed-nested";
  modules.length = 0;
  expect(() => definition.validateDocument(document())).toThrow("Original validation at root/0");
  expect(definition.nodes).toHaveLength(1);
  expect(definition.registrations).toHaveLength(1);
  definition.registrations[0]!.register(createEditor())();
  definition.$normalizeInitial();
  expect(calls).toEqual(["original"]);
  expect(definition.theme.text?.bold).toBe("original-bold");
  expect(definition.theme.list?.ulDepth).toEqual(["original-list"]);
  expect(definition.theme.list?.nested?.list).toBe("original-nested");
  expect(Object.isFrozen(definition.theme.list?.nested)).toBe(true);
});

test("document validation rejects unknown nested nodes and returns a detached lossless copy", () => {
  const definition = defineEditor([TextModule()]);
  const source = document();
  const copy = definition.validateDocument(source);
  expect(copy).toEqual(source);
  expect(copy).not.toBe(source);
  copy.root.children.length = 0;
  expect(source.root.children).toHaveLength(1);
  expect(() =>
    definition.validateDocument({
      root: { type: "root", children: [{ type: "future-widget", version: 1 }] },
    }),
  ).toThrow("Unsupported node future-widget at root/0");
  expect(() =>
    definition.validateDocument({
      root: {
        type: "root",
        children: [{ type: "paragraph", children: [{ type: "future-inline" }] }],
      },
    }),
  ).toThrow("Unsupported node future-inline at root/0/0");
  expect(() => definition.validateDocument({ root: { type: "root" } })).toThrow(
    "Document root needs children",
  );
});

test("UI contribution identities are unique and action order is stable across module owners", () => {
  const action: EditorAction = {
    id: "first",
    title: "First",
    group: "Actions",
    order: 10,
    $execute: () => {},
  };

  const renderer = { key: "widget:example", render: () => null };
  const slot = { ...renderer, slot: "inspector" };
  expect(() =>
    defineEditor([
      { key: "first", actions: [action] },
      { key: "second", actions: [action] },
    ]),
  ).toThrow("Duplicate action ID: first");
  expect(() =>
    defineEditor([
      { key: "first", renderers: [renderer] },
      { key: "second", renderers: [renderer] },
    ]),
  ).toThrow("Duplicate renderer key");
  expect(() =>
    defineEditor([
      { key: "first", slots: [slot] },
      { key: "second", slots: [slot] },
    ]),
  ).toThrow("Duplicate slot contribution key");

  const definition = defineEditor([
    { key: "first", actions: [action, { ...action, id: "last", order: 30 }] },
    {
      key: "second",
      actions: [
        { ...action, id: "tied" },
        { ...action, id: "middle", order: 20 },
      ],
    },
  ]);

  expect(definition.actions.map((item) => item.id)).toEqual(["first", "tied", "middle", "last"]);
});
