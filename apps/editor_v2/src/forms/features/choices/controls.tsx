import { SubmenuRow, SsbField } from "../../react/settings-controls";
import type { FieldControlsProps } from "../shared/controls";
import { optionValueError, parseOptionValue } from "../../editor/native-field-controls";

export function OptionValues({ m, a }: FieldControlsProps) {
  return (
    <SubmenuRow label="Option values" text={m.optionValues.length} className="w-75">
      <div className="min-h-0 overflow-y-auto py-1.5">
        {m.optionValues.map((value) => (
          <SsbField
            key={value.key}
            label={value.label}
            value={String(value.value)}
            pinned={value.pinned}
            resetOnClear={!value.native}
            onChange={(next) =>
              a.onOptionValue(
                value.key,
                next === undefined ? undefined : parseOptionValue(next, value.value),
              )
            }
            validate={(next) => {
              const error = optionValueError(next, value.value);

              if (error) return error;
              const parsed = parseOptionValue(next, value.value);

              return m.optionValues.some(
                (other) => other.key !== value.key && other.value === parsed,
              )
                ? "Another option already uses this value"
                : null;
            }}
            muted
          />
        ))}
      </div>
    </SubmenuRow>
  );
}
