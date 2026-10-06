import { expect, test } from "vitest";
import { $createTextNode, $getRoot } from "lexical";
import { $duplicateQuestion } from "../../src/forms/editor/structure/blocks";
import { $registryBlocks as $govbbField } from "../../src/forms/editor/registry-module";
import {
  $createQuestionNode,
  $isQuestionNode,
  $setSettings,
  $turnInto,
} from "../../src/forms/editor/nodes";
import { $createOptionNode, $isOptionNode } from "../../src/forms/editor/answer-nodes";
import { $native } from "../../src/forms/editor/native-state";
import { COMPONENTS } from "../../src/presets/form-registry/components";
import {
  nativeQuestions,
  nativeRegistryEditor,
  nativeRegistryForm,
  reloadNativeRegistryEditor,
} from "../helpers/native-registry-editor";

const congoLabel = "Democratic Republic of the Congo";

test("team copies retain submitted values and keys when labels or registry definitions change", () => {
  const editor = nativeRegistryEditor();

  const preset = COMPONENTS["components/country"]!,
    original = structuredClone(preset);

  try {
    editor.update(() => $getRoot().append(...$govbbField("GOVBB_COUNTRY")), { discrete: true });
    preset.options = preset.options!.map((option) => ({
      ...option,
      value: `changed-${option.value}`,
    }));
    preset.label = "Changed country";
    editor.update(
      () => {
        const country = $getRoot().getChildren().find($isQuestionNode)!;
        country.clear().append($createTextNode("Where do you live?"));

        const congo = $getRoot()
          .getChildren()
          .filter($isOptionNode)
          .find((node) => node.getTextContent() === congoLabel)!;

        congo.clear().append($createTextNode("Congo (DRC)"));
        $duplicateQuestion(country);
      },
      { discrete: true },
    );
    const before = nativeQuestions(nativeRegistryForm(editor));
    expect(before.map((question) => question.key)).toEqual(["country", "country-2"]);
    expect(
      before.map(
        (question) => question.options?.find((option) => option.label === "Congo (DRC)")?.value,
      ),
    ).toEqual(["dr-congo", "dr-congo"]);
    const loaded = reloadNativeRegistryEditor(editor);

    try {
      expect(nativeQuestions(nativeRegistryForm(loaded))).toEqual(before);
    } finally {
      loaded.dispose();
    }
  } finally {
    Object.assign(preset, original);
    editor.dispose();
  }
});

test("inserting an address shortcut creates ordinary editable native conditional logic", () => {
  const editor = nativeRegistryEditor();

  try {
    editor.update(() => $getRoot().append(...$govbbField("GOVBB_ADDRESS_COUNTRY")), {
      discrete: true,
    });

    const schema = nativeRegistryForm(editor),
      questions = nativeQuestions(schema),
      country = questions.find((question) => question.key === "country")!;

    const parish = questions.find((question) => question.key === "parish")!,
      postcode = questions.find((question) => question.key === "postcode")!;

    const logic = schema.blocks.filter((block) => block.type === "logic");
    expect(logic).toHaveLength(1);
    expect(logic[0]!.rules[0]).toMatchObject({
      when: {
        op: "selected",
        question: country.id,
        option: country.options!.find((option) => option.value === "barbados")!.id,
      },
      actions: [{ type: "setVisible", targets: [parish.id, postcode.id], value: true }],
    });
    expect(parish.visible).toBe(false);
    expect(postcode.visible).toBe(false);
    editor.update(
      () => {
        const node = $getRoot()
          .getChildren()
          .find((node) => $native(node).question?.id === postcode.id)!;

        $setSettings(node, { required: true });
      },
      { discrete: true },
    );
    expect(
      nativeQuestions(nativeRegistryForm(editor)).find((question) => question.id === postcode.id)!
        .required?.value,
    ).toBe(true);
  } finally {
    editor.dispose();
  }
});

test("copied Team option values survive choice-type changes and Markdown", () => {
  let editor = nativeRegistryEditor();

  try {
    editor.update(() => $getRoot().append(...$govbbField("GOVBB_COUNTRY")), { discrete: true });
    const original = nativeQuestions(nativeRegistryForm(editor))[0]!;

    for (const [kind, selection, presentation] of [
      ["multiple-choice", "single", "radio"],
      ["checkboxes", "multiple", "checkboxes"],
      ["dropdown", "single", "dropdown"],
    ] as const) {
      editor.update(() => $turnInto($getRoot().getChildren().find($isOptionNode)!, kind), {
        discrete: true,
      });
      const changed = nativeQuestions(nativeRegistryForm(editor))[0]!;
      expect(changed).toMatchObject({
        id: original.id,
        kind: "choice",
        key: "country",
        config: { selection, presentation },
      });
      expect(changed.options).toEqual(original.options);
      const loaded = reloadNativeRegistryEditor(editor);
      editor.dispose();
      editor = loaded;
      expect(nativeQuestions(nativeRegistryForm(editor))[0]).toEqual(changed);
    }
  } finally {
    editor.dispose();
  }
});

test("authored option values survive conversion and generic labels cannot rewrite stable values", () => {
  const editor = nativeRegistryEditor();

  try {
    editor.update(
      () => {
        $getRoot().append(
          ...$govbbField("GOVBB_COUNTRY"),
          $createQuestionNode().append($createTextNode("Another question")),
          $createOptionNode("multiple-choice").append($createTextNode("First answer")),
        );
      },
      { discrete: true },
    );

    const original = nativeQuestions(nativeRegistryForm(editor)),
      genericValue = original[1]!.options![0]!.value;

    for (const kind of ["multiple-choice", "checkboxes", "dropdown"] as const) {
      editor.update(
        () => {
          const congo = $getRoot()
            .getChildren()
            .filter($isOptionNode)
            .find((node) => node.getTextContent() === congoLabel)!;

          const generic = $getRoot()
            .getChildren()
            .find((node) => $native(node).owner === original[1]!.id && $isOptionNode(node))!;

          $turnInto(congo, kind);
          $setSettings(congo, { optionValue: "my-congo-value" });
          $turnInto(generic, kind);

          if ($isOptionNode(generic)) generic.clear().append($createTextNode(`Answer for ${kind}`));
        },
        { discrete: true },
      );
      const changed = nativeQuestions(nativeRegistryForm(editor));
      expect(changed[0]!.options!.find((option) => option.label === congoLabel)!.value).toBe(
        "my-congo-value",
      );
      expect(changed[1]!.options![0]!.value).toBe(genericValue);
      expect(changed[1]!.options![0]!.label).toBe(`Answer for ${kind}`);
    }
  } finally {
    editor.dispose();
  }
});
