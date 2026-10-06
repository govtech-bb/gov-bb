import {
  jsonSettings,
  settingsArray,
  settingsObject,
  settingText,
} from "../helpers/serialized-test-data";
import { expect, test } from "vitest";
import { $createParagraphNode, $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { executeAction, $availableActions } from "../../src/editor/core/actions";
import { defineFormEditor } from "../../src/forms/definition";
import { defineFormRegistry, defineFormRegistryEntry } from "../../src/forms/registry/definition";
import { FormRegistryModule } from "../../src/forms/editor/registry-module";
import {
  prepareRegistryEntry,
  $instantiateRegistryEntry,
  createRegistryForm,
} from "../../src/forms/editor/registry";
import { $insertBlocks } from "../../src/forms/editor/insertion";
import { question, content, option, rule } from "../../src/forms/registry/builders";
import { validateFormDefinition } from "../../src/forms/schema";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { govbbFormEditor, govbbFormModules } from "../../src/presets/govbb-form";
import { demoForm, demoFormEntry } from "../../src/presets/form-registry/demo";
import { emptyNativeForm, nativeHost, nativeOutput } from "../helpers/native-form";

const fragment = (
  blocks: Parameters<typeof prepareRegistryEntry>[0]["blocks"],
  externalReferences?: string[],
) =>
  defineFormRegistryEntry({
    scope: "fragment",
    key: "native/test",
    version: 1,
    title: "Native test",
    description: "Native copy",
    blocks,
    ...(externalReferences && { externalReferences }),
  });

const choice = (id: string) =>
  question({
    id,
    key: id,
    kind: "choice",
    label: id,
    config: { selection: "single", presentation: "radio" },
    options: [
      option({ id: "yes", label: "Yes", value: false }),
      option({ id: "no", label: "No", value: true }),
    ],
  });

test("option identities are scoped by question, and literal false, strings, keys and explicit scopes survive copying", () => {
  const entry = fragment([
    choice("one"),
    choice("two"),
    rule({
      id: "rule",
      rules: [
        {
          id: "when",
          when: { op: "selected", question: "two", option: "yes", scope: "form" },
          actions: [
            { type: "setVisible", targets: [{ question: "one", option: "yes" }], value: false },
          ],
        },
      ],
    }),
  ]);

  const copied = prepareRegistryEntry(entry, govbbFormEditor).blocks;

  const one = copied[0]!,
    two = copied[1]!,
    logic = copied[2]!;

  expect(one.type).toBe("question");
  expect(two.type).toBe("question");
  expect(logic.type).toBe("logic");

  if (one.type !== "question" || two.type !== "question" || logic.type !== "logic") return;
  expect(one.options![0]!.id).not.toBe(two.options![0]!.id);
  expect(one.options!.map((option) => option.value)).toEqual([false, true]);
  expect(logic.rules[0]!.when).toEqual({
    op: "selected",
    question: two.id,
    option: two.options![0]!.id,
    scope: "form",
  });
  expect(logic.rules[0]!.actions[0]).toEqual({
    type: "setVisible",
    targets: [{ question: one.id, option: one.options![0]!.id }],
    value: false,
  });
  const deleted = structuredClone(entry);
  const deletedQuestion = deleted.blocks[1];

  if (deletedQuestion?.type !== "question") throw Error("Expected copied question");
  deletedQuestion.options!.shift();
  expect(() => prepareRegistryEntry(deleted, govbbFormEditor)).toThrow("Unknown option");
});

test("structured hint and list-item identities remap without changing rich literal text", () => {
  const entry = fragment([
    question({
      id: "answer",
      key: "answer",
      kind: "text",
      label: "answer",
      hint: [{ id: "help", type: "content", kind: "paragraph", content: "answer" }],
    }),
    content({
      id: "list",
      kind: "list",
      config: { ordered: false, items: [{ id: "same", content: "help" }] },
    }),
    rule({
      id: "logic",
      rules: [
        {
          id: "show",
          when: true,
          actions: [
            { type: "setVisible", targets: ["help", { list: "list", item: "same" }], value: true },
          ],
        },
      ],
    }),
  ]);

  const prepared = prepareRegistryEntry(entry, govbbFormEditor);

  const q = prepared.blocks[0]!,
    list = prepared.blocks[1]!,
    logic = prepared.blocks[2]!;

  if (q.type !== "question" || list.type !== "content" || logic.type !== "logic")
    throw Error("Bad copy");

  const hint = settingsObject(settingsArray(jsonSettings({ hint: q.hint }).hint)[0]);
  const items = settingsArray(jsonSettings(list.config).items).map(settingsObject);

  expect(hint.content).toBe("answer");
  expect(logic.rules[0]!.actions[0]).toEqual({
    type: "setVisible",
    targets: [settingText(hint.id), { list: list.id, item: settingText(items[0]!.id) }],
    value: true,
  });
});

test("an explicitly bound external reference stays external and is rechecked against the destination", () => {
  const destination = {
    ...structuredClone(emptyNativeForm),
    blocks: [
      ...emptyNativeForm.blocks,
      question({ id: "outside", key: "outside", kind: "text", label: "Existing" }),
    ],
  };

  const entry = fragment(
    [
      content({
        id: "summary",
        kind: "paragraph",
        content: ["Existing: ", { answer: "outside", scope: "form" }],
      }),
    ],
    ["outside"],
  );

  const editor = nativeHost(govbbFormEditor, destination);

  try {
    const prepared = prepareRegistryEntry(entry, govbbFormEditor);
    editor.update(
      () => $insertBlocks($instantiateRegistryEntry(prepared), $getRoot().getLastChild()),
      { discrete: true },
    );
    expect(nativeOutput(editor).blocks.at(-1)).toMatchObject({
      content: ["Existing: ", { answer: "outside", scope: "form" }],
    });
    const missing = nativeHost();

    try {
      missing.update(
        () =>
          expect(() =>
            $instantiateRegistryEntry(prepareRegistryEntry(entry, govbbFormEditor)),
          ).toThrow("no longer exists"),
        { discrete: true },
      );
    } finally {
      missing.dispose();
    }
  } finally {
    editor.dispose();
  }

  expect(() => prepareRegistryEntry(fragment(entry.blocks), govbbFormEditor)).toThrow(
    "Unknown answer reference",
  );
});

test("page entries insert at page boundaries and permit matching submitted keys in separate repeat scopes", () => {
  const page = defineFormRegistryEntry({
    scope: "page",
    key: "repeat-page",
    version: 1,
    title: "Members",
    description: "Repeated members",
    blocks: [
      {
        id: "members",
        type: "page",
        role: "questions",
        title: "Members",
        repeat: { key: "members", min: 1, max: 3, addLabel: "Add member" },
      },
      question({ id: "name", key: "name", kind: "text", label: "Name" }),
      content({ id: "echo", kind: "paragraph", content: [{ answer: "name", scope: "current" }] }),
    ],
  });

  const definition = defineFormEditor({
    modules: [
      ...govbbFormModules,
      FormRegistryModule(defineFormRegistry([page]), { key: "page-examples" }),
    ],
  });

  const editor = nativeHost(definition);

  try {
    for (let index = 0; index < 2; index++) {
      const targetKey = editor.read(() => $getRoot().getLastChild()!.getKey());
      expect(executeAction(editor, definition, page.key, { targetKey }).executed).toBe(true);
      editor.update(() => $getRoot().append($createParagraphNode()), { discrete: true });
    }

    const output = nativeOutput(editor, definition);
    expect(
      output.blocks.filter((block) => block.type === "question").map((block) => block.key),
    ).toEqual(["name", "name"]);
    expect(
      output.blocks
        .filter((block) => block.type === "page" && block.repeat)
        .map((block) => (block.type === "page" ? block.repeat?.key : undefined)),
    ).toEqual(["members", "members_2"]);
    editor.read(() => {
      const targetKey = $getRoot()
        .getChildren()
        .find((node) => node.getType() === "question")!
        .getKey();

      expect(
        $availableActions(editor, definition, { targetKey }).some(
          (action) => action.id === page.key,
        ),
      ).toBe(false);
    });
  } finally {
    editor.dispose();
  }
});

test("native complete-form registry creation remaps identities while ordinary JSON import preserves them", () => {
  const first = createRegistryForm(demoFormEntry, govbbFormEditor),
    second = createRegistryForm(demoFormEntry, govbbFormEditor);

  expect(first.id).not.toBe(demoForm.id);
  expect(first.id).not.toBe(second.id);
  expect(first.blocks.some((block) => second.blocks.some((other) => other.id === block.id))).toBe(
    false,
  );
  expect(validateFormDefinition(first, govbbFormEditor.nativeCapabilities).status).toBe("ready");
  expect(govbbFormEditor.actions.some((action) => action.id === demoFormEntry.key)).toBe(false);
  const loaded = formSchemaToLexical(demoForm, govbbFormEditor);
  expect(loaded.status).toBe("ready");

  if (loaded.status !== "ready") return;
  const editor = createHeadlessEditor(govbbFormEditor, loaded.state);

  try {
    expect(nativeOutput(editor)).toEqual(demoForm);
  } finally {
    editor.dispose();
  }
});

test("multiple copies created in one editor update allocate keys from pending live insertions", () => {
  const editor = nativeHost(),
    entry = fragment([question({ id: "name", key: "name", kind: "text", label: "Name" })]);

  try {
    editor.update(
      () => {
        $getRoot().append(
          ...$instantiateRegistryEntry(prepareRegistryEntry(entry, govbbFormEditor)),
        );
        $getRoot().append(
          ...$instantiateRegistryEntry(prepareRegistryEntry(entry, govbbFormEditor)),
        );
      },
      { discrete: true },
    );
    expect(
      nativeOutput(editor)
        .blocks.filter((block) => block.type === "question")
        .map((block) => block.key),
    ).toEqual(["name", "name_2"]);
  } finally {
    editor.dispose();
  }
});

test("a configured handler that drops its native question is rejected before any insertion", () => {
  const field = govbbFormEditor.fields.find((field) => field.kind === "text")!;

  const definition = defineFormEditor({
    modules: govbbFormModules
      .filter((module) => !module.registry)
      .map((module) => ({
        ...module,
        fields: module.fields?.map((candidate) =>
          candidate.kind === "text"
            ? { ...field, native: { ...field.native!, import: () => [] } }
            : candidate,
        ),
      })),
  });

  const entry = fragment([question({ id: "name", key: "name", kind: "text", label: "Name" })]);
  expect(() => prepareRegistryEntry(entry, definition)).toThrow(
    "cannot preserve this native definition",
  );
});

test("native fragment validation does not reserve its internal semantic page identity", () => {
  const entry = fragment([
    question({ id: "registry-envelope", key: "name", kind: "text", label: "Name" }),
  ]);

  expect(prepareRegistryEntry(entry, govbbFormEditor).blocks).toHaveLength(1);
});
