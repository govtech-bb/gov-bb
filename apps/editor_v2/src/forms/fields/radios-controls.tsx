import { SettingsGroup, Switch } from "../canvas/settings-controls";
import {
  InputStatus,
  InputHints,
  RepeatAnswer,
  InputEnd,
  type FieldControlsProps,
} from "./field-controls";
import { OptionValues } from "./choice-options-controls";

export function RadiosControls({ m, a }: FieldControlsProps) {
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
