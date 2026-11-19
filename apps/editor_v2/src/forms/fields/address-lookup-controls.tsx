import { FIELD_WIDTHS } from "../model/field-settings";
import { SettingsGroup, Switch, Pick } from "../canvas/settings-controls";
import {
  InputStatus,
  InputHints,
  RepeatAnswer,
  InputEnd,
  type FieldControlsProps,
} from "./field-controls";

export function AddressLookupControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <InputHints m={m} a={a} />
      <Switch label="Default answer" on="hasDefaultAnswer" value="defaultAnswer" type="text" />
      <Switch label="Min characters" on="hasMinCharacters" value="minCharacters" type="number" />
      <Switch label="Max characters" on="hasMaxCharacters" value="maxCharacters" type="number" />
      <RepeatAnswer m={m} a={a} />
      <Pick label="Field width" value="width" options={FIELD_WIDTHS} fallback="long" />
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}
