/**
 * The editor's form controls, from the GOV.BB design system.
 *
 * These were hand-rolled inputs with `ed-*` classes. They are now
 * `@govtech-bb/react` components — the same Input, Select, Checkbox and
 * TextArea the live site uses — so the tool a content designer spends the
 * day in looks like the estate it publishes to, and a change to the design
 * system reaches the editor without anyone re-styling it.
 *
 * `Label` and `Hint` come from the same place, so the label/hint/control
 * relationship and its `aria-describedby` wiring are the design system's
 * problem rather than something re-invented here.
 *
 * What stays hand-rolled: the block control strip, the slash menu and the
 * block popover. The design system has no component for any of them, and a
 * GOV.BB-looking imitation would be worse than owning them openly.
 */

import {
  Button,
  Checkbox,
  Hint,
  Input,
  Label,
  NumberInput,
  Fieldset,
  Select,
  TextArea,
} from "@govtech-bb/react";
import { useId, type ReactNode } from "react";

/** Label, optional hint and a control, wired together. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="ed-field">
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint ? <Hint id={`${htmlFor}-hint`}>{hint}</Hint> : null}
      {children}
    </div>
  );
}

const describedBy = (id: string, hint?: string) =>
  hint ? { "aria-describedby": `${id}-hint` } : {};

export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
  /** A stable handle for the behavioural suite; see e2e/README.md. */
  testId?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Input
        id={id}
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        {...describedBy(id, hint)}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <TextArea
        id={id}
        data-testid={testId}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...describedBy(id, hint)}
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
  testId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  min?: number;
  max?: number;
  testId?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <NumberInput
        id={id}
        data-testid={testId}
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        {...describedBy(id, hint)}
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
  testId,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hint?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        {...describedBy(id, hint)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <Checkbox
      id={id}
      data-testid={testId}
      label={label}
      description={hint}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

/** A comma-separated list of field keys, the shape config blocks keep wanting. */
export function KeyListField({
  label,
  value,
  onChange,
  hint,
  testId,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Input
        id={id}
        data-testid={testId}
        value={value.join(", ")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0),
          )
        }
        {...describedBy(id, hint)}
      />
    </Field>
  );
}

/**
 * Add / remove / reorder for facets, columns and sort options.
 *
 * The design system has an "Add another" pattern but no component that
 * reorders, so the controls are the design system's Buttons inside a
 * hand-rolled list rather than an imitation of a component that does not
 * exist.
 */
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
    <Fieldset legend={legend} className="ed-repeatable">
      {items.length === 0 ? (
        <p className="ed-empty">None yet.</p>
      ) : (
        <ol className="ed-repeatable-list">
          {items.map((item, index) => (
            <li key={index} className="ed-repeatable-item">
              <div className="ed-repeatable-head">
                <strong>{itemLabel(item, index)}</strong>
                <span className="ed-repeatable-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      onChange(items.filter((_, i) => i !== index))
                    }
                    aria-label="Remove"
                  >
                    Remove
                  </Button>
                </span>
              </div>
              {renderItem(item, (next) => replace(index, next), index)}
            </li>
          ))}
        </ol>
      )}
      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange([...items, create()])}
      >
        Add {legend.toLowerCase().replace(/s$/, "")}
      </Button>
    </Fieldset>
  );
}
