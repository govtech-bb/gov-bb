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
import { timeIncrementError, DEFAULT_TIME_INCREMENT } from "../shared/increments";

export function TimeControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <TimeIncrement />
      <InputHints m={m} a={a} />
      {m.header && (
        <Switch label="Default answer" on="hasDefaultAnswer" value="defaultAnswer" type="text" />
      )}

      <RepeatAnswer m={m} a={a} />
      {m.header && (
        <Pick label="Field width" value="width" options={FIELD_WIDTHS} fallback="short" />
      )}
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}

function TimeIncrement() {
  const { settings, set } = useStore();
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  const text = draft ?? (settings.step === undefined ? "" : String(settings.step));
  const value = text.trim() ? Number(text) : undefined;
  const error = timeIncrementError(value);

  const update = (next: string) => {
    setDraft(next);
    const value = next.trim() ? Number(next) : undefined;

    if (!timeIncrementError(value)) set({ step: value });
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
        Time increment
      </label>
      <select
        aria-label="Time increment preset"
        value={
          settings.step === undefined
            ? ""
            : [60, 300, 900, 1800, 3600].includes(Number(settings.step))
              ? String(settings.step)
              : "custom"
        }
        onChange={(event) => {
          if (event.target.value !== "custom") update(event.target.value);
        }}
        className="mb-1.5 h-8 w-full rounded-sm bg-white px-2 text-14 shadow-input"
      >
        <option value="">Default · {DEFAULT_TIME_INCREMENT / 60} minutes</option>
        {[1, 5, 15, 30, 60].map((minutes) => (
          <option key={minutes} value={minutes * 60}>
            {minutes} {minutes === 1 ? "minute" : "minutes"}
          </option>
        ))}
        <option value="custom">Custom seconds</option>
      </select>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="Default · 1800 seconds"
        aria-invalid={!!error}
        aria-describedby={error ? id + "-error" : undefined}
        onChange={(event) => update(event.target.value)}
        className="h-8 w-full rounded-sm bg-white px-2 text-14 shadow-input outline-none focus:shadow-input-focus"
      />
      <p className="pt-1 text-12 text-muted">
        Custom increment in seconds. Clear to use the default.
      </p>
      {error && (
        <p id={id + "-error"} className="pt-1 text-12 text-error">
          {error}
        </p>
      )}
    </div>
  );
}
