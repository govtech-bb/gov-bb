import { FIELD_WIDTHS } from "../../core/field-settings";
import { SettingsGroup, Switch, Pick } from "../../react/settings-controls";
import {
  InputStatus,
  InputHints,
  RepeatAnswer,
  InputEnd,
  type FieldControlsProps,
} from "../shared/controls";

export function PhoneControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <InputHints m={m} a={a} />
      {m.header && (
        <Switch label="Default answer" on="hasDefaultAnswer" value="defaultAnswer" type="text" />
      )}

      <RepeatAnswer m={m} a={a} />
      {m.header && (
        <Pick label="Field width" value="width" options={FIELD_WIDTHS} fallback="long" />
      )}
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}
