import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";
import { isText, type Collection } from "../../api/client";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Field, FieldGroup } from "../../ui/field";
import { Input } from "../../ui/input";
import type { RecordValue } from "./records";

type FieldType = Collection["schema"]["fields"][number]["type"];

type RecordFieldProps = {
  type: FieldType;
  /** What the field is called, without "(optional)": it names a list's items. */
  name: string;
  /** What the field's label says. */
  label: string;
  hint?: string;
  error?: string;
  value: RecordValue | undefined;
  readOnly: boolean;
  onChange: (value: RecordValue) => void;
};

/**
 * A record field's control, as suits its type (#3782): a text box for text, a slug or an email address, a number box,
 * a date box, a tick box for yes or no, and a list editor. Every one works by keyboard alone.
 */
export function RecordField({
  type,
  name,
  label,
  hint,
  error,
  value,
  readOnly,
  onChange,
}: RecordFieldProps) {
  if (type === "boolean")
    return (
      <BooleanField
        label={name}
        hint={hint}
        error={error}
        checked={value === true}
        readOnly={readOnly}
        onChange={onChange}
      />
    );

  if (type === "list")
    return (
      <ListField
        name={name}
        label={label}
        hint={hint}
        error={error}
        items={Array.isArray(value) ? value : []}
        readOnly={readOnly}
        onChange={onChange}
      />
    );

  return (
    <Field label={label} hint={hint} error={error}>
      <Input
        value={isText(value) ? value : ""}
        readOnly={readOnly}
        // A date box takes the date as YYYY-MM-DD, as api_v2 keeps it. A number is a text box with a number keypad,
        // so a value it can't read, such as 1,000, stays for api_v2's refusal to explain rather than vanishing
        type={type === "date" ? "date" : undefined}
        inputMode={type === "email" ? "email" : type === "number" ? "decimal" : undefined}
        spellCheck={type === "text" ? undefined : false}
        autoCapitalize={type === "text" ? undefined : "off"}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function BooleanField({
  label,
  hint,
  error,
  checked,
  readOnly,
  onChange,
}: {
  label: string;
  hint?: string;
  error?: string;
  checked: boolean;
  readOnly: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Checkbox
        label={label}
        checked={checked}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? id : undefined}
        onCheckedChange={(next) => onChange(next)}
      />
      {(hint || error) && (
        <p id={id} className={error ? "text-14 text-error" : "text-14 text-muted"}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/**
 * A list of short text values: each item a text box, with buttons to move it up or down or remove it, and Add item.
 * After each, the focus goes where the next press is likely to be, and a screen reader hears what moved.
 */
function ListField({
  name,
  label,
  hint,
  error,
  items,
  readOnly,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  items: readonly string[];
  readOnly: boolean;
  onChange: (items: string[]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [said, setSaid] = useState("");
  const noteId = useId();

  const focus = (selector: string) =>
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(selector)?.focus());

  const move = (index: number, by: -1 | 1) => {
    const next = [...items];
    const to = index + by;

    [next[index], next[to]] = [next[to]!, next[index]!];
    onChange(next);
    // The moved item's same button, unless the item is now at that end, when it is the other one
    const atEnd = by < 0 ? to === 0 : to === next.length - 1;

    focus(`[data-item="${to}"] [data-part="${by < 0 !== atEnd ? "up" : "down"}"]`);
    setSaid(`Item moved to position ${to + 1} of ${next.length}.`);
  };

  const remove = (index: number) => {
    const next = items.filter((_, at) => at !== index);

    onChange(next);
    focus(
      next.length === 0
        ? '[data-part="add"]'
        : `[data-item="${Math.min(index, next.length - 1)}"] [data-part="input"]`,
    );
    setSaid(`Item ${index + 1} removed. ${next.length} left.`);
  };

  const add = () => {
    onChange([...items, ""]);
    focus(`[data-item="${items.length}"] [data-part="input"]`);
    setSaid("");
  };

  const described = error || hint ? noteId : undefined;

  return (
    <div ref={root}>
      <FieldGroup label={label}>
        {(hint || error) && (
          <p id={noteId} className={error ? "text-14 text-error" : "text-14 text-muted"}>
            {error ?? hint}
          </p>
        )}
        {items.length === 0 ? (
          <p className="text-14 text-muted">No items.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((item, index) => (
              <li
                // Items have no identity of their own: a text box keeps its place, and its value moves through it
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                data-item={index}
                className="flex min-w-0 items-center gap-1"
              >
                <Input
                  data-part="input"
                  className="min-w-0 flex-1"
                  aria-label={`${name}, item ${index + 1} of ${items.length}`}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={described}
                  value={item}
                  readOnly={readOnly}
                  onChange={(event) =>
                    onChange(items.map((old, at) => (at === index ? event.target.value : old)))
                  }
                />
                {!readOnly && (
                  <>
                    <Button
                      data-part="up"
                      icon={<ArrowUp />}
                      aria-label={`Move item ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <Button
                      data-part="down"
                      icon={<ArrowDown />}
                      aria-label={`Move item ${index + 1} down`}
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <Button
                      data-part="remove"
                      icon={<Trash />}
                      aria-label={`Remove item ${index + 1}`}
                      onClick={() => remove(index)}
                    />
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
        {!readOnly && (
          <Button
            data-part="add"
            className="self-start"
            variant="secondary"
            icon={<Plus />}
            aria-label={`Add item to ${name}`}
            onClick={add}
          >
            Add item
          </Button>
        )}
        <span aria-live="polite" className="sr-only">
          {said}
        </span>
      </FieldGroup>
    </div>
  );
}
