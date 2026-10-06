import { expect, test } from "vitest";
import { $getRoot, $getSelection, $isRangeSelection, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { registerEditorHistory } from "../../src/editor/core/history";
import { executeAction, type EditorAction } from "../../src/editor/core/actions";
import { defineFormEditor } from "../../src/forms/definition";
import {
  defineFormRegistryEntry,
  type FormRegistryFragment,
} from "../../src/forms/registry/definition";
import { question, content, rule } from "../../src/forms/registry/builders";
import { prepareRegistryEntry, $instantiateRegistryEntry } from "../../src/forms/editor/registry";
import { $insertBlocks } from "../../src/forms/editor/insertion";
import { govbbFormEditor, govbbFormModules } from "../../src/presets/govbb-form";
import {
  addressCountryEntry,
  govbbFormRegistryEntries,
} from "../../src/presets/form-registry/entries";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { nativeHost, nativeOutput } from "../helpers/native-form";

const entry = (blocks: FormRegistryFragment["blocks"]) =>
  defineFormRegistryEntry({
    scope: "fragment",
    key: "test/fragment",
    version: 1,
    title: "Fragment",
    description: "Test",
    blocks,
  });

const basic = () => question({ id: "answer", key: "answer", kind: "text", label: "Answer" });

const insert = (
  editor: ReturnType<typeof nativeHost>,
  value: FormRegistryFragment,
  definition = govbbFormEditor,
) => {
  const prepared = prepareRegistryEntry(value, definition);
  editor.update(
    () => $insertBlocks($instantiateRegistryEntry(prepared), $getRoot().getLastChild()),
    { discrete: true },
  );

  return prepared;
};

test("all 22 built-ins prepare detached independent native fragments without editor envelope nodes", () => {
  for (const value of govbbFormRegistryEntries) {
    const before = JSON.stringify(value.blocks),
      first = prepareRegistryEntry(value, govbbFormEditor),
      second = prepareRegistryEntry(value, govbbFormEditor);

    expect(first.nodes.length).toBeGreaterThan(0);
    expect(
      first.nodes.some((node) => node.type === "form-title" || node.type === "page-title"),
    ).toBe(false);
    expect(first.identities.some((id) => second.identities.includes(id))).toBe(false);
    expect(JSON.stringify(value.blocks)).toBe(before);
    expect(Object.isFrozen(first.nodes)).toBe(true);
  }
});

test("two address groups have independent references and submitted keys through undo, redo and Markdown reload", () => {
  const editor = nativeHost(),
    stop = registerEditorHistory(editor);

  try {
    const baseline = editor.getEditorState().toJSON();

    const first = insert(editor, addressCountryEntry),
      one = editor.getEditorState().toJSON();

    const second = insert(editor, addressCountryEntry),
      two = editor.getEditorState().toJSON();

    expect(first.identities.some((id) => second.identities.includes(id))).toBe(false);

    const output = nativeOutput(editor),
      countries = output.blocks.filter(
        (block) => block.type === "question" && block.key.startsWith("country"),
      );

    expect(countries.map((country) => country.type === "question" && country.key)).toEqual([
      "country",
      "country_2",
    ]);
    const rules = output.blocks.filter((block) => block.type === "logic");
    countries.forEach((country, index) => {
      if (country.type !== "question") return;
      const option = country.options!.find((option) => option.value === "barbados")!;
      expect(rules[index]!.rules[0]!.when).toEqual({
        op: "selected",
        question: country.id,
        option: option.id,
      });
      const original = addressCountryEntry.blocks.find((block) => block.id === "country");

      if (original?.type !== "question") throw Error("Missing registry country question");
      expect(country.options!.map((option) => option.value)).toEqual(
        original.options!.map((option) => option.value),
      );
    });
    editor.update(() => editor.dispatchCommand(UNDO_COMMAND, undefined), { discrete: true });
    expect(editor.getEditorState().toJSON()).toEqual(one);
    editor.update(() => editor.dispatchCommand(UNDO_COMMAND, undefined), { discrete: true });
    expect(editor.getEditorState().toJSON()).toEqual(baseline);
    editor.update(() => editor.dispatchCommand(REDO_COMMAND, undefined), { discrete: true });
    editor.update(() => editor.dispatchCommand(REDO_COMMAND, undefined), { discrete: true });
    expect(editor.getEditorState().toJSON()).toEqual(two);

    const source = lexicalToMarkdown(two, govbbFormEditor),
      parsed = markdownToLexical(source, govbbFormEditor);

    expect(parsed.state).toBeDefined();
    const restored = createHeadlessEditor(govbbFormEditor, parsed.state!);

    try {
      expect(nativeOutput(restored)).toEqual(output);
    } finally {
      restored.dispose();
    }

    editor.update(
      () => expect(() => $instantiateRegistryEntry(first)).toThrow("prepare a new fragment"),
      { discrete: true },
    );
  } finally {
    stop();
    editor.dispose();
  }
});

test("failed preparation leaves slash trigger, selection, document and redo intact", () => {
  let value = entry([basic()]);
  let definition = govbbFormEditor;

  const action: EditorAction = {
    id: "test-registry",
    title: "Registry",
    group: "Test",
    $prepare: ({ target }) => {
      const nodes = $instantiateRegistryEntry(prepareRegistryEntry(value, definition), target);

      return () => {
        $insertBlocks(nodes, target);
      };
    },
  };

  definition = defineFormEditor({
    modules: [...govbbFormModules, { key: "test-action", actions: [action] }],
  });

  const editor = nativeHost(definition),
    stop = registerEditorHistory(editor);

  const cursor = () =>
    editor.read(() => {
      const s = $getSelection();

      return $isRangeSelection(s)
        ? [s.anchor.key, s.anchor.offset, s.focus.key, s.focus.offset]
        : null;
    });

  try {
    const targetKey = editor.read(() => $getRoot().getLastChild()!.getKey());
    expect(executeAction(editor, definition, action.id, { targetKey }).executed).toBe(true);
    const inserted = editor.getEditorState().toJSON();
    editor.update(() => editor.dispatchCommand(UNDO_COMMAND, undefined), { discrete: true });

    const before = editor.getEditorState().toJSON(),
      selection = cursor();

    for (const invalid of [
      entry([
        basic(),
        content({ id: "outside", kind: "paragraph", content: [{ answer: "outside" }] }),
      ]),
      entry([
        basic(),
        rule({
          id: "rule",
          rules: [{ id: "jump", when: true, actions: [{ type: "goTo", target: "outside-page" }] }],
        }),
      ]),
      entry([question({ ...basic(), config: { width: "invalid" } })]),
    ]) {
      value = invalid;
      let removed = false;

      const result = executeAction(editor, definition, action.id, { targetKey }, () => {
        removed = true;
        $getRoot().getLastChild()!.remove();
      });

      expect(result.executed).toBe(false);
      expect(result.error).toBeTruthy();
      expect(removed).toBe(false);
      expect(editor.getEditorState().toJSON()).toEqual(before);
      expect(cursor()).toEqual(selection);
    }

    editor.update(() => editor.dispatchCommand(REDO_COMMAND, undefined), { discrete: true });
    expect(editor.getEditorState().toJSON()).toEqual(inserted);
  } finally {
    stop();
    editor.dispose();
  }
});

test("prepared fragments cannot be forged, reused or moved to a different configured owner", () => {
  const prepared = prepareRegistryEntry(entry([basic()]), govbbFormEditor),
    editor = nativeHost();

  const otherDefinition = defineFormEditor({ modules: govbbFormModules }),
    other = nativeHost(otherDefinition);

  try {
    other.update(
      () => expect(() => $instantiateRegistryEntry(prepared)).toThrow("prepared editor definition"),
      { discrete: true },
    );
    editor.update(
      () =>
        expect(() => $instantiateRegistryEntry({ ...prepared })).toThrow("prepared registry copy"),
      { discrete: true },
    );
    editor.update(
      () => $insertBlocks($instantiateRegistryEntry(prepared), $getRoot().getLastChild()),
      { discrete: true },
    );
    const before = editor.getEditorState().toJSON();
    editor.update(
      () => expect(() => $instantiateRegistryEntry(prepared)).toThrow("prepare a new fragment"),
      { discrete: true },
    );
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    other.dispose();
    editor.dispose();
  }
});
