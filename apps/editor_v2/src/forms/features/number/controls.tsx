import { FIELD_WIDTHS } from "../../core/field-settings";
import { SettingsGroup, Switch, Pick, useStore } from "../../react/settings-controls";
import {
  InputStatus,
  InputHints,
  RepeatAnswer,
  InputEnd,
  type FieldControlsProps,
} from "../shared/controls";
import { useId, useState } from "react";
import { positiveIncrementError } from "../shared/increments";

export function NumberControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <NumberIncrement />
      <InputHints m={m} a={a} />
      {m.header && (
        <Switch label="Default answer" on="hasDefaultAnswer" value="defaultAnswer" type="number" />
      )}
      <Switch label="Min number" on="hasMinNumber" value="minNumber" type="number" />
      <Switch label="Max number" on="hasMaxNumber" value="maxNumber" type="number" />
      <RepeatAnswer m={m} a={a} />
      {m.header && (
        <Pick label="Field width" value="width" options={FIELD_WIDTHS} fallback="long" />
      )}
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}

function NumberIncrement() {
  const { settings, set } = useStore();
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  const text = draft ?? (settings.step === undefined ? "" : String(settings.step));
  const value = text.trim() ? Number(text) : undefined;
  const error = positiveIncrementError(value);

  const update = (next: string) => {
    setDraft(next);
    const value = next.trim() ? Number(next) : undefined;

    if (!positiveIncrementError(value)) set({ step: value });
  };

  return (
    <div
      className="px-3.5 py-1.5"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setDraft(null);

          return;
        }

        event.stopPropagation();
      }}
    >
      <label htmlFor={id} className="block pb-1 text-14">
        Increment
      </label>

      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="Default"
        aria-invalid={!!error}
        aria-describedby={error ? id + "-error" : undefined}
        onChange={(event) => update(event.target.value)}
        className="h-8 w-full rounded-sm bg-white px-2 text-14 shadow-input outline-none focus:shadow-input-focus"
      />

      {error && (
        <p id={id + "-error"} className="pt-1 text-12 text-error">
          {error}
        </p>
      )}
    </div>
  );
}
