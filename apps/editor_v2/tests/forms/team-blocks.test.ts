import { expect, test } from "vitest";
import { $createTextNode, $getRoot } from "lexical";
import { $registryBlocks as $govbbField } from "../../src/forms/editor/registry-module";
import { $isInput, $isQuestionNode, $updateSettings } from "../../src/forms/editor/nodes";
import { COMPONENTS } from "../../src/presets/form-registry/components";
import { FORMATS } from "../../src/forms/core/formats";
import {
  nativeQuestions,
  nativeRegistryEditor,
  nativeRegistryForm,
  reloadNativeRegistryEditor,
} from "../helpers/native-registry-editor";

test("customizing a team field changes one editable native copy and survives Markdown", () => {
  const original = structuredClone(COMPONENTS["components/national-id-number"]!);
  const form = nativeRegistryEditor();

  try {
    form.update(
      () => {
        const first = $govbbField("GOVBB_NATIONAL_ID");
        $getRoot().append(...first);
        $getRoot().append(...$govbbField("GOVBB_NATIONAL_ID"));
        first.find($isQuestionNode)!.clear().append($createTextNode("Membership number"));
        $updateSettings(first.find($isInput)!, {
          required: false,
          width: "long",
          pattern: "^[A-Z]{2}[0-9]{6}$",
          mask: "AA999999",
        });
      },
      { discrete: true },
    );
    const loaded = reloadNativeRegistryEditor(form);

    try {
      const [first, second] = nativeQuestions(nativeRegistryForm(loaded));
      expect(first).toMatchObject({
        key: "national-id-number",
        label: "Membership number",
        required: { value: false },
        config: { width: "long", mask: "AA999999" },
      });
      expect(first!.validation).toContainEqual(
        expect.objectContaining({ type: "pattern", pattern: "^[A-Z]{2}[0-9]{6}$" }),
      );
      expect(second).toMatchObject({
        key: "national-id-number_2",
        required: { value: true },
        config: { width: "medium", mask: "999999-9999" },
      });
      expect(second!.validation).toContainEqual(
        expect.objectContaining({ type: "pattern", pattern: FORMATS.nationalId.pattern }),
      );
      expect(COMPONENTS["components/national-id-number"]).toEqual(original);
    } finally {
      loaded.dispose();
    }
  } finally {
    form.dispose();
  }
});

test("removing a copied format survives Markdown without changing the registry definition", () => {
  const form = nativeRegistryEditor();

  try {
    form.update(
      () => {
        const blocks = $govbbField("GOVBB_NATIONAL_ID");
        $getRoot().append(...blocks);
        $updateSettings(blocks.find($isInput)!, { pattern: undefined, mask: undefined });
      },
      { discrete: true },
    );
    const loaded = reloadNativeRegistryEditor(form);

    try {
      const [question] = nativeQuestions(nativeRegistryForm(loaded));
      expect(question!.key).toBe("national-id-number");
      expect(question!.required?.value).toBe(true);
      expect(question!.validation?.some((rule) => rule.type === "pattern")).toBe(false);
      expect(question!.config).toEqual({ width: "medium" });
      expect(COMPONENTS["components/national-id-number"]!.config).toMatchObject({
        mask: "999999-9999",
      });
      expect(COMPONENTS["components/national-id-number"]!.validation).toContainEqual(
        expect.objectContaining({ type: "pattern", pattern: FORMATS.nationalId.pattern }),
      );
    } finally {
      loaded.dispose();
    }
  } finally {
    form.dispose();
  }
});
