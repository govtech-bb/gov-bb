import { expect, test } from "vitest";
import { $getRoot } from "lexical";
import { executeAction, matchesAction } from "../../src/editor/core/actions";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { govbbFormRegistryEntries } from "../../src/presets/form-registry/entries";
import { registryPreviewQuestions } from "../../src/presets/form-registry/preview";
import { remapNativeForm, type AnyFormBlock } from "../../src/forms/schema";
import { registryDocument } from "../../src/forms/registry/validation";
import { nativeHost, nativeOutput } from "../helpers/native-form";
import baseline from "../fixtures/forms/registry-entry-baseline.json";

function identities(blocks: readonly AnyFormBlock[]) {
  const blockMap = new Map<string, string>(),
    options = new Map<string, Map<string, string>>();

  blocks.forEach((block, index) => {
    blockMap.set(block.id, `block-${index}`);

    if (block.type === "question")
      options.set(
        block.id,
        new Map(block.options?.map((option, index) => [option.id, `option-${index}`])),
      );
  });

  return { blocks: blockMap, options };
}

for (const entry of govbbFormRegistryEntries)
  test(`${entry.title}: native insertion and configured preview use the same copied defaults`, () => {
    const editor = nativeHost();

    try {
      expect(
        executeAction(editor, govbbFormEditor, entry.key, {
          targetKey: editor.read(() => $getRoot().getLastChild()!.getKey()),
        }).executed,
      ).toBe(true);

      const actual = nativeOutput(editor),
        inserted = actual.blocks.filter((block) => block.type !== "page"),
        blocks = inserted.slice(0, entry.blocks.length);

      for (const extra of inserted.slice(entry.blocks.length))
        expect(extra).toMatchObject({ type: "content", kind: "paragraph", content: "" });
      const expected = registryDocument(entry);
      expected.blocks = structuredClone([...entry.blocks]);
      expect(remapNativeForm({ ...actual, blocks }, identities(blocks)).blocks).toEqual(
        remapNativeForm(expected, identities(expected.blocks)).blocks,
      );
      const previews = registryPreviewQuestions(entry, govbbFormEditor);
      expect(previews.map((preview) => preview.label)).toEqual(
        entry.blocks
          .filter((block) => block.type === "question")
          .map((block) => String(block.label)),
      );
      expect(
        previews.every((preview) =>
          govbbFormEditor.fields.some((field) => field.kind === preview.kind),
        ),
      ).toBe(true);
    } finally {
      editor.dispose();
    }
  });

test("all 22 catalog IDs retain their order and search aliases; complete forms stay outside fragment actions", () => {
  const actions = govbbFormEditor.actions.filter((action) => action.group === "Form registry");
  expect(actions.map((action) => action.id)).toEqual(baseline);

  for (const action of actions)
    for (const query of ["Team blocks", "GovBB fields", "Form registry"])
      expect(matchesAction(action, query)).toBe(true);
});
