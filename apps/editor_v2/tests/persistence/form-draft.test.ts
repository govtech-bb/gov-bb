import { expect, test } from "vitest";
import { createHeadlessEditor } from "../../src/editor";
import { draftEditorConnection } from "../../src/host/draft-editor";
import { DraftStore } from "../../src/persistence";
import { govbbFormCodec, govbbFormEditor, govbbFormRuntime } from "../../src/presets/govbb-form";
import { readMarkdown, writeMarkdown } from "../helpers/default-form";
import { $legacyDemo } from "../helpers/legacy-demo";
import { serializedNodes } from "../helpers/serialized-test-data";

const versionOne =
  "---\nformat: govbb-form\nformatVersion: 1\ntitle: Original\n---\n\n# Page\n\n::multiple-choice[Continue?]{#continue}\n- Yes\n\n  ::text[Details]{#details}\n\n- No\n";

test("malformed legacy wording remains exact and failed form Apply leaves the canvas unchanged", () => {
  const legacy = readMarkdown(versionOne).document!;
  const first = legacy.pages[0]!.blocks[0]!;

  if (first.type !== "question") throw Error("Expected a question");
  first.settings.conditionalLabel = [
    {
      id: "row",
      field: "continue",
      operator: "equal",
      value: { option: "yes", future: "must survive" },
      text: "Changed title",
    },
  ];
  const malformed = writeMarkdown(legacy);
  const recovered = new DraftStore(malformed, govbbFormCodec);
  expect(recovered.getSnapshot()).toMatchObject({
    valid: false,
    source: malformed,
    recovery: { original: malformed },
  });

  const saved = govbbFormCodec.prepare(versionOne).source;
  const store = new DraftStore(saved, govbbFormCodec);
  const editor = createHeadlessEditor(govbbFormEditor, store.getSnapshot().state);
  const disconnect = store.connect(draftEditorConnection(editor));
  const before = editor.getEditorState().toJSON();

  try {
    store.edit(malformed);
    expect(store.apply()).toBe(false);
    expect(editor.getEditorState().toJSON()).toEqual(before);
    expect(store.getSnapshot()).toMatchObject({ source: malformed, committed: saved });
    store.discard();
    expect(store.getSnapshot()).toMatchObject({ source: saved, dirty: false });
  } finally {
    disconnect();
    editor.dispose();
  }
});

test("the explicit legacy converter retains page names without discovering browser drafts", () => {
  const legacy = govbbFormRuntime.prepare(undefined, $legacyDemo, "legacy");
  const nodes = serializedNodes(legacy);

  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]!;

    if (node.type !== "page-title") continue;
    const start = nodes[index - 1]!;

    if (start.type === "widget") {
      start.$ ??= {};
      start.$.settings ??= {};
      start.$.settings.name = node
        .children!.map((child: { text?: string }) => child.text ?? "")
        .join("");
    }

    nodes.splice(index, 1);
  }

  const bytes = JSON.stringify(legacy);
  const source = govbbFormCodec.encode(govbbFormCodec.prepareLegacy(legacy));
  expect(source).toContain("# Road closure");
  expect(JSON.stringify(legacy)).toBe(bytes);
});
