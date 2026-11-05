import { FIELD_WIDTHS } from "../model/field-settings";
import { SettingsGroup, Switch, Pick, Value } from "../canvas/settings-controls";
import {
  InputStatus,
  InputHints,
  RepeatAnswer,
  InputEnd,
  type FieldControlsProps,
} from "./field-controls";
import { OptionValues } from "./choice-options-controls";

export function SelectControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <InputHints m={m} a={a} />
      <Switch label='"Other" option' on="hasOtherOption" />
      <RepeatAnswer m={m} a={a} />

      <Value label="Placeholder" value="placeholder" />
      <Pick label="Field width" value="width" options={FIELD_WIDTHS} fallback="long" />
      <OptionValues m={m} a={a} />
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}
