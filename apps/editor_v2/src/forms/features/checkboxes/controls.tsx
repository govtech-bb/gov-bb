import { SettingsGroup, Switch } from "../../react/settings-controls";
import {
  InputStatus,
  InputHints,
  RepeatAnswer,
  InputEnd,
  type FieldControlsProps,
} from "../shared/controls";
import { OptionValues } from "../choices/controls";

export function CheckboxesControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <InputHints m={m} a={a} />
      <Switch label='"Other" option' on="hasOtherOption" />
      <RepeatAnswer m={m} a={a} />
      <Switch label="Min choices" on="hasMinChoices" value="minChoices" type="number" />
      <Switch label="Max choices" on="hasMaxChoices" value="maxChoices" type="number" />

      <OptionValues m={m} a={a} />
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}
