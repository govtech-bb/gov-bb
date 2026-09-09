import { useEffect, useId, useRef, useState } from "react";
import {
  contentPath,
  fieldDefault,
  recordLabel,
  type ContentField,
  type ContentObject,
} from "@govtech-bb/content/smart-tool-fields";
import s from "./-styles.module.css";
import t from "./-tools.module.css";

interface FieldProps {
  errors?: Record<string, string>;
  field: ContentField;
  value: unknown;
  original: unknown;
  path: string;
  onChange(value: unknown): void;
  onRemove(path: string, original: boolean): void;
}

export function ToolField(props: FieldProps) {
  const { field, value, path, onChange } = props;
  const id = useId();
  if (field.type === "array") return <ArrayEditor {...props} />;
  const isGroup = field.type === "object" || field.type === "hours";
  if (isGroup && field.optional) {
    const known = value !== null && value !== undefined;
    return (
      <fieldset className={t.group}>
        <legend>{field.label}</legend>
        <label className={t.check}>
          <input
            type="checkbox"
            checked={known}
            disabled={field.readonly}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? fieldDefault({ ...field, optional: false })
                  : null,
              )
            }
          />
          {field.label} known
        </label>
        {known ? (
          <ToolField {...props} field={{ ...field, optional: false }} />
        ) : (
          <p className={t.hint}>Not confirmed.</p>
        )}
      </fieldset>
    );
  }
  if (field.type === "object") {
    const data = (value ?? {}) as ContentObject;
    return (
      <fieldset className={t.group}>
        <legend>{field.label}</legend>
        {Object.entries(field.fields ?? {}).map(([key, child]) => (
          <ToolField
            key={key}
            field={child}
            value={data[key]}
            errors={props.errors}
            original={(props.original as ContentObject | undefined)?.[key]}
            path={contentPath(path, key)}
            onChange={(next) => onChange({ ...data, [key]: next })}
            onRemove={props.onRemove}
          />
        ))}
      </fieldset>
    );
  }
  if (field.type === "hours") return <HoursEditor {...props} />;
  if (field.type === "boolean")
    return (
      <label className={t.check}>
        <input
          type="checkbox"
          checked={value === true}
          disabled={field.readonly}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    );
  const error = props.errors?.[path];
  const scale = field.format === "percentage" ? 100 : 1;
  const common = {
    id,
    name: path,
    disabled: field.readonly,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby":
      [field.hint && `${id}-hint`, error && `${id}-error`]
        .filter(Boolean)
        .join(" ") || undefined,
  };
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {field.label}
        {field.optional ? " (optional)" : ""}
      </label>
      {field.type === "select" ? (
        <select
          {...common}
          className={s.select}
          value={String(value ?? "")}
          onChange={(event) =>
            onChange(
              field.options?.find(
                (option) => String(option) === event.target.value,
              ),
            )
          }
        >
          <option value="" disabled>
            Choose an option
          </option>
          {field.options?.map((option) => (
            <option key={option} value={String(option)}>
              {option}
            </option>
          ))}
        </select>
      ) : field.multiline ? (
        <textarea
          {...common}
          className={s.textarea}
          rows={4}
          value={String(value ?? "")}
          required={!field.optional}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...common}
          className={s.input}
          type={
            field.type === "number"
              ? "number"
              : field.format === "date"
                ? "date"
                : field.format === "email"
                  ? "email"
                  : "text"
          }
          value={
            typeof value === "number"
              ? value * scale
              : typeof value === "string"
                ? value
                : ""
          }
          required={!field.optional}
          min={field.min === undefined ? undefined : field.min * scale}
          max={field.max === undefined ? undefined : field.max * scale}
          step={
            field.type === "number" ? (field.integer ? 1 : "any") : undefined
          }
          onChange={(event) =>
            onChange(
              field.type === "number"
                ? event.target.value === ""
                  ? null
                  : Number(event.target.value) / scale
                : event.target.value,
            )
          }
        />
      )}
      {error && (
        <p id={`${id}-error`} className={t.fieldError}>
          {error}
        </p>
      )}
      {field.hint && (
        <p className={t.hint} id={`${id}-hint`}>
          {field.hint}
        </p>
      )}
    </div>
  );
}

function HoursEditor({ field, value, path, errors, onChange }: FieldProps) {
  const id = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const messages = Object.entries(errors ?? {})
    .filter(([key]) => key === path || key.startsWith(`${path}/`))
    .map(([, message]) => message);
  const ranges = (Array.isArray(value) ? value : []) as {
    opens: string;
    closes: string;
  }[];
  const update = (index: number, key: "opens" | "closes", next: string) =>
    onChange(
      ranges.map((range, i) =>
        i === index ? { ...range, [key]: next } : range,
      ),
    );
  return (
    <fieldset
      className={t.group}
      aria-describedby={messages.length ? `${id}-error` : undefined}
    >
      <legend>{field.label}</legend>
      {messages.length > 0 && (
        <p id={`${id}-error`} className={t.fieldError}>
          {[...new Set(messages)].join(" ")}
        </p>
      )}
      {!ranges.length && <p className={t.hint}>Closed.</p>}
      {ranges.map((range, index) => (
        <div className={t.hours} key={index}>
          <label>
            Opens
            <input
              className={s.input}
              type="time"
              name={`${path}/${index}/opens`}
              aria-invalid={messages.length ? true : undefined}
              required
              value={range.opens}
              onChange={(event) => update(index, "opens", event.target.value)}
            />
          </label>
          <label>
            Closes
            <input
              className={s.input}
              type="time"
              name={`${path}/${index}/closes`}
              aria-invalid={messages.length ? true : undefined}
              required
              disabled={range.closes === "24:00"}
              value={range.closes === "24:00" ? "" : range.closes}
              onChange={(event) => update(index, "closes", event.target.value)}
            />
          </label>
          <label className={t.check}>
            <input
              type="checkbox"
              checked={range.closes === "24:00"}
              onChange={(event) =>
                update(index, "closes", event.target.checked ? "24:00" : "")
              }
            />
            Closes at midnight
          </label>
          <button
            className={s.secondaryBtn}
            type="button"
            onClick={() => {
              onChange(ranges.filter((_, i) => i !== index));
              addRef.current?.focus();
            }}
          >
            Remove period {index + 1}
          </button>
        </div>
      ))}
      <button
        ref={addRef}
        className={s.secondaryBtn}
        type="button"
        onClick={() => {
          onChange([...ranges, { opens: "", closes: "" }]);
          setTimeout(
            () =>
              document
                .getElementsByName(`${path}/${ranges.length}/opens`)[0]
                ?.focus(),
            0,
          );
        }}
      >
        Add opening period
      </button>
    </fieldset>
  );
}

function ArrayEditor({
  field,
  value,
  original,
  path,
  errors,
  onChange,
  onRemove,
}: FieldProps) {
  const values = Array.isArray(value) ? value : [];
  const originals = Array.isArray(original) ? original : [];
  const key = field.identity;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{
    index: number;
    instance: string;
  } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const getKey = (record: unknown, index: number) =>
    String(key ? (record as ContentObject)?.[key] : index);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!key) return;
    const invalid = Object.keys(errors ?? {}).find((error) =>
      error.startsWith(`${path}/`),
    );
    if (invalid) {
      const id = invalid
        .slice(path.length + 1)
        .split("/")[0]
        .replaceAll("~1", "/")
        .replaceAll("~0", "~");
      const index = (Array.isArray(value) ? value : []).findIndex(
        (record) => String(record[key]) === id,
      );
      if (index >= 0)
        setSelected((current) =>
          current?.index === index
            ? current
            : { index, instance: crypto.randomUUID() },
        );
    }
  }, [errors, key, path, value]);
  const activeIndex = key ? (selected?.index ?? -1) : -1;
  function add() {
    const next = fieldDefault(field.item!) as ContentObject;
    if (key === "id" || key === "slug") next[key] = crypto.randomUUID();
    if (key && field.item?.fields?.[key]?.type === "number")
      next[key] =
        Math.max(
          new Date().getFullYear(),
          ...values.map((row) => Number(row[key]) || 0),
        ) + 1;
    onChange([...values, next]);
    if (key)
      setSelected({ index: values.length, instance: crypto.randomUUID() });
    setTimeout(
      () =>
        editorRef.current
          ?.querySelector<HTMLElement>("input:not(:disabled),textarea,select")
          ?.focus(),
      0,
    );
  }
  function remove(index: number) {
    const record = values[index];
    const recordKey = getKey(record, index);
    const existed = key
      ? originals.some((row) => row[key] === (record as ContentObject)[key])
      : false;
    onRemove(contentPath(path, recordKey), existed);
    onChange(values.filter((_, i) => i !== index));
    setSelected(null);
    setRemoving(null);
    (searchRef.current ?? addRef.current)?.focus();
  }
  function move(index: number, delta: number) {
    const next = [...values];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
    if (key)
      setSelected((current) =>
        current ? { ...current, index: index + delta } : null,
      );
  }
  function edit(index: number) {
    const row = values[index];
    const recordKey = getKey(row, index);
    const before = key
      ? originals.find(
          (candidate) => candidate[key] === (row as ContentObject)[key],
        )
      : originals[index];
    const item = field.item!;
    const itemField =
      key && before && item.fields
        ? {
            ...item,
            fields: {
              ...item.fields,
              [key]: { ...item.fields[key], readonly: true },
            },
          }
        : item;
    return (
      <div
        key={key ? selected?.instance : recordKey}
        ref={editorRef}
        className={t.record}
      >
        <ToolField
          errors={errors}
          field={itemField}
          value={row}
          original={before}
          path={contentPath(path, recordKey)}
          onRemove={onRemove}
          onChange={(next) => {
            onChange(values.map((entry, i) => (i === index ? next : entry)));
          }}
        />
        {!field.fixed && (
          <div className={t.actions}>
            <button
              className={s.secondaryBtn}
              type="button"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              Move up
            </button>
            <button
              className={s.secondaryBtn}
              type="button"
              disabled={index === values.length - 1}
              onClick={() => move(index, 1)}
            >
              Move down
            </button>
            <button
              className={s.secondaryBtn}
              type="button"
              onClick={() => setRemoving(recordKey)}
            >
              Remove {item.label.toLowerCase()}
            </button>
          </div>
        )}
        {removing === recordKey && (
          <div className={t.removeNotice} role="alert">
            <p>
              Remove {recordLabel(row, key)}? It will be removed from the
              published tool when this change is merged.
            </p>
            <div className={t.actions}>
              <button
                className={s.primaryBtn}
                type="button"
                onClick={() => remove(index)}
              >
                Confirm removal
              </button>
              <button
                className={s.secondaryBtn}
                type="button"
                onClick={() => setRemoving(null)}
              >
                Keep record
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <fieldset className={t.group}>
      <legend>{field.label}</legend>
      {key && (
        <>
          <label className={s.label}>
            Find a record
            <input
              ref={searchRef}
              className={s.input}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <ul className={t.records}>
            {values
              .map((row, index) => ({ row, index }))
              .filter(({ row }) =>
                recordLabel(row, key)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map(({ row, index }) => (
                <li key={getKey(row, index)}>
                  <button
                    className={s.secondaryBtn}
                    type="button"
                    aria-pressed={index === activeIndex}
                    onClick={() =>
                      setSelected({ index, instance: crypto.randomUUID() })
                    }
                  >
                    {recordLabel(row, key)}
                  </button>
                </li>
              ))}
          </ul>
          {!!search &&
            !values.some((row) =>
              recordLabel(row, key)
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && (
              <p>
                No matching records.{" "}
                <button
                  type="button"
                  className={s.secondaryBtn}
                  onClick={() => setSearch("")}
                >
                  Clear search
                </button>
              </p>
            )}
        </>
      )}
      {key ? (
        activeIndex >= 0 ? (
          edit(activeIndex)
        ) : (
          <p className={t.hint}>Choose a record to edit.</p>
        )
      ) : (
        values.map((_, index) => edit(index))
      )}
      {!field.fixed && (
        <button
          ref={addRef}
          className={s.secondaryBtn}
          type="button"
          onClick={add}
        >
          Add {field.item!.label.toLowerCase()}
        </button>
      )}
    </fieldset>
  );
}
