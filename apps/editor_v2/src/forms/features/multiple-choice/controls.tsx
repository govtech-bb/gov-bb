import { SettingsGroup, Switch } from "../../react/settings-controls";
import {
  InputStatus,
  InputHints,
  RepeatAnswer,
  InputEnd,
  type FieldControlsProps,
} from "../shared/controls";
import { OptionValues } from "../choices/controls";

export function MultipleChoiceControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <InputHints m={m} a={a} />
      <Switch label='"Other" option' on="hasOtherOption" />
      <RepeatAnswer m={m} a={a} />

      <OptionValues m={m} a={a} />
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}
