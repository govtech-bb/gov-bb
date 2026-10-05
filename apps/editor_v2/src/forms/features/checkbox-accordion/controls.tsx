import { SettingsGroup, Switch } from "../../react/settings-controls";
import { InputStatus, InputHints, InputEnd, type FieldControlsProps } from "../shared/controls";

export function CheckboxAccordionControls({ m, a }: FieldControlsProps) {
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
