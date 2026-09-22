import type { ReactNode } from "react";

/**
 * The form primitives every config block editor is built from. Deliberately
 * few: if a config block needs a widget that is not here, that is a signal
 * the block's shape is wrong, not that the toolkit is thin.
 */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="ed-field">
      <span className="ed-field-label">{label}</span>
      {hint ? <span className="ed-field-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="ed-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        className="ed-input ed-textarea"
        value={value}
        rows={2}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="ed-input ed-input-narrow"
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select
        className="ed-input"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="ed-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {hint ? <span className="ed-field-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

/** A comma-separated list of field keys, the shape config blocks keep wanting. */
export function KeyListField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="ed-input"
        value={value.join(", ")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
          )
        }
      />
    </Field>
  );
}

/** Add / remove / reorder for facets, columns and sort options. */
export function Repeatable<T>({
  legend,
  items,
  onChange,
  create,
  renderItem,
  itemLabel,
}: {
  legend: string;
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  itemLabel: (item: T, index: number) => string;
}) {
  const replace = (index: number, next: T) =>
    onChange(items.map((item, i) => (i === index ? next : item)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <fieldset className="ed-repeatable">
      <legend>{legend}</legend>
      {items.length === 0 ? (
        <p className="ed-empty">None yet.</p>
      ) : (
        <ol className="ed-repeatable-list">
          {items.map((item, index) => (
            <li key={index} className="ed-repeatable-item">
              <div className="ed-repeatable-head">
                <strong>{itemLabel(item, index)}</strong>
                <span className="ed-repeatable-actions">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="ed-danger"
                    onClick={() =>
                      onChange(items.filter((_, i) => i !== index))
                    }
                    aria-label="Remove"
                  >
                    Remove
                  </button>
                </span>
              </div>
              {renderItem(item, (next) => replace(index, next), index)}
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="ed-add"
        onClick={() => onChange([...items, create()])}
      >
        Add {legend.toLowerCase().replace(/s$/, "")}
      </button>
    </fieldset>
  );
}
