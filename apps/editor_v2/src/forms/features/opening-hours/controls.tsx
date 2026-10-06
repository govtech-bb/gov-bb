import { SettingsGroup } from "../../react/settings-controls";
import { InputStatus, InputHints, InputEnd, type FieldControlsProps } from "../shared/controls";

export function OpeningHoursControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <InputHints m={m} a={a} />
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}
