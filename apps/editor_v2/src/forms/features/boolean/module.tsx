import { createElement } from "react";
import { ToggleLeft } from "@phosphor-icons/react";
import { defineField } from "../../field";
import { nativeField } from "../../native";
import { fieldModule } from "../../editor/field-module";
import { $createDrawnInput } from "../../editor/field-nodes";
import { $static, el } from "../../../editor/react/block-dom";
import { SettingsGroup, Switch } from "../../react/settings-controls";
import { InputStatus, InputHints, InputEnd, type FieldControlsProps } from "../shared/controls";

export const booleanField = defineField({
  kind: "boolean",
  label: "Yes or no",
  untitled: "Unlabelled yes or no question",
  icon: createElement(ToggleLeft),
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "boolean", defaultValue: "text" } },
  native: nativeField("boolean", { kind: "boolean", valueType: "boolean" }),
  settings: { read: (raw) => ({ required: raw.required === true }), defaults: { required: true } },
  capabilities: {
    hideLabel: true,
    repeat: true,
    formula: true,
    comparisons: ["IS", "IS_NOT", "IS_EMPTY", "IS_NOT_EMPTY"],
  },
  draw: () => {
    const box = $static("div", "flex gap-6", { "data-drawn": "" });

    for (const label of ["Yes", "No"]) {
      const row = el("span", "flex items-center gap-2");
      row.append(
        el("span", "size-6 rounded-full border-2 border-ink"),
        document.createTextNode(label),
      );
      box.append(row);
    }

    return box;
  },
});

function BooleanControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <InputHints m={m} a={a} />
      <Switch label="Default answer" on="hasDefaultAnswer" />
      <Switch label="Default is yes" on="defaultAnswer" />
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}

function BooleanPreview() {
  return (
    <div className="flex gap-6">
      <span>○ Yes</span>
      <span>○ No</span>
    </div>
  );
}

export const BooleanModule = () =>
  fieldModule({
    field: booleanField,
    insertion: {
      id: "INPUT_BOOLEAN",
      order: 14,
      keywords: "boolean, yes, no, declaration",
      create: () => [$createDrawnInput("boolean", booleanField.defaults)],
      question: { description: "Ask for a yes or no answer.", label: "Do you have a passport?" },
      answer: { description: "A yes or no answer under an existing question." },
    },
    Controls: BooleanControls,
    Preview: BooleanPreview,
  });
