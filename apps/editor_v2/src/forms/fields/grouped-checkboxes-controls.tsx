import { SettingsGroup, Switch } from "../canvas/settings-controls";
import { InputStatus, InputHints, InputEnd, type FieldControlsProps } from "./field-controls";

export function GroupedCheckboxesControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <InputHints m={m} a={a} />
      <Switch label="Min choices" on="hasMinChoices" value="minChoices" type="number" />
      <Switch label="Max choices" on="hasMaxChoices" value="maxChoices" type="number" />
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}
