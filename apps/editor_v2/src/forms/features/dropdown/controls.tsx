import { FIELD_WIDTHS } from "../../core/field-settings";
import { SettingsGroup, Switch, Pick, Value } from "../../react/settings-controls";
import {
  InputStatus,
  InputHints,
  RepeatAnswer,
  InputEnd,
  type FieldControlsProps,
} from "../shared/controls";
import { OptionValues } from "../choices/controls";

export function DropdownControls({ m, a }: FieldControlsProps) {
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
