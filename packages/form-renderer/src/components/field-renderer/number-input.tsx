import React from "react";

/**
 * Design-system number input. A native `type="number"` field with the browser
 * spinners suppressed (`.govbb-number-input`) plus custom up/down steppers that
 * match the gov bb design system. The stepper arrows are drawn entirely in CSS,
 * so the buttons carry no visible content. Increment/decrement step the
 * controlled value by 1; a blank/non-numeric value is treated as 0.
 */
export function NumberInput({
  value,
  onChange,
  invalid,
  inputProps,
}: {
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const step = (delta: number) => {
    const current = Number(value);
    const base = value !== "" && Number.isFinite(current) ? current : 0;
    onChange(String(base + delta));
  };

  return (
    <div className="govbb-number-input-wrapper">
      <input
        {...inputProps}
        type="number"
        inputMode="numeric"
        className="govbb-number-input"
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="govbb-number-input__steppers">
        <button
          type="button"
          tabIndex={-1}
          className="govbb-number-input__step"
          aria-label="Increment"
          aria-controls={inputProps.id}
          disabled={inputProps.disabled}
          onClick={() => step(1)}
        />
        <div className="govbb-number-input__divider" />
        <button
          type="button"
          tabIndex={-1}
          className="govbb-number-input__step govbb-number-input__step--down"
          aria-label="Decrement"
          aria-controls={inputProps.id}
          disabled={inputProps.disabled}
          onClick={() => step(-1)}
        />
      </div>
    </div>
  );
}
