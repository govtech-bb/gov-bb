import { expect, test } from "vitest";
import { $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineField } from "../../src/forms/field";
import { defineFormEditor } from "../../src/forms/definition";
import { $createDrawnInput } from "../../src/forms/editor/field-nodes";
import { govbbFormModules } from "../../src/presets/govbb-form";
import { $blockId, $setSettings, $settings } from "../../src/editor/core/document-state";
import {
  $createFormTitleNode,
  $createQuestionNode,
  $deepCopy,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
} from "../../src/forms/editor/nodes";
import { $remapCopies } from "../../src/forms/features/mentions/editor";
import { referencesInSettings } from "../../src/forms/core/references";

test("custom field references share source enumeration and duplicate remapping without changing literal settings", () => {
  const field = defineField({
    kind: "reference-answer",
    label: "Reference",
    untitled: "Untitled reference",
    gutterOffset: 11,
    settings: {
      defaults: {},
      read: (raw) => ({ related: String(raw.related ?? ""), literal: String(raw.literal ?? "") }),
    },
    source: { storage: { type: "input", property: "kind", value: "reference-answer" } },
    capabilities: { hideLabel: true, repeat: false, formula: false, comparisons: [] },
    references: (settings, visit) => ({
      related: visit({ kind: "field", value: settings.related, path: ["related"] }),
    }),
  });

  const definition = defineFormEditor({
    modules: [...govbbFormModules, { key: "field:reference-answer", fields: [field] }],
  });

  const editor = createHeadlessEditor(definition, undefined, { prepare: false });

  try {
    editor.update(
      () => {
        const title = $createQuestionNode(),
          answer = $createDrawnInput(field.kind);

        $getRoot().append($createFormTitleNode(), title, answer);
        $ensureBlockIds($getRoot());
        $ensureQuestionFields($getRoot());
        const original = $questionKey(answer);
        $setSettings(answer, {
          related: original,
          literal: original,
          unknown: { nested: original },
        });

        const copiedTitle = $deepCopy(title),
          copiedAnswer = $deepCopy(answer);

        $getRoot().append(copiedTitle, copiedAnswer);
        $remapCopies([
          [title, copiedTitle],
          [answer, copiedAnswer],
        ]);
        expect($blockId(title)).not.toBe($blockId(copiedTitle));
        expect($questionKey(copiedAnswer)).not.toBe(original);
        expect($settings(copiedAnswer)).toMatchObject({
          related: $questionKey(copiedAnswer),
          literal: original,
          unknown: { nested: original },
        });
        expect($settings(answer).related).toBe(original);
        expect(
          referencesInSettings($settings(copiedAnswer), {
            fieldReferences: field.source.mapReferences,
          }),
        ).toEqual([{ kind: "field", value: $questionKey(copiedAnswer), path: ["related"] }]);
      },
      { discrete: true },
    );
  } finally {
    editor.dispose();
  }
});
