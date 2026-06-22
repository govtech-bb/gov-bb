import React, { JSX } from "react";
import { FieldRenderContext } from "./render-context";

/**
 * Render a single control, or a repeating field-array (Add another / Remove)
 * when the field carries a `fieldArray` behaviour. `renderControl` produces one
 * instance from a value + change handler; `withRequired` mirrors the original
 * behaviour where the repeating-array path omits requiredProps so a half-filled
 * repeat isn't flagged.
 *
 * Shared verbatim by the text-like (text/number/tel/email) and textarea field
 * renderers, which differ only in the control they hand back.
 */
export function renderRepeatableOrSingle(
  ctx: FieldRenderContext,
  renderControl: (
    value: string,
    onChange: (next: string) => void,
    withRequired: boolean,
  ) => JSX.Element,
): JSX.Element {
  const { field, fieldArray, commitChange, f } = ctx;

  if (!fieldArray) {
    const value = f.state.value as string | undefined;
    return renderControl(value ?? "", (next) => commitChange(next), true);
  }

  // Immutable updates: TanStack's store dedupes by reference, so a
  // mutated-in-place array passed back to handleChange can be
  // dropped as "unchanged". Always commit a fresh array.
  const addAnotherField = (values: string[]) => {
    commitChange([...values, ""]);
  };

  const removeField = (values: string[]) => {
    commitChange(values.slice(0, -1));
  };

  const updateField = (values: string[], index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    commitChange(next);
  };

  const values = (f.state.value as string[] | undefined) ?? [
    (field.defaultValue as string) ?? "",
  ];
  const min = fieldArray.min;
  const max = fieldArray.max;

  const fieldCount =
    values && values.length > 0 ? Math.min(values.length, max) : min;

  return (
    <>
      {Array.from({ length: fieldCount }).map((_, i) => (
        <React.Fragment key={`${field.id}-${i}`}>
          {renderControl(
            values && values.length > 0 ? values[i] : "",
            (next) => updateField(values, i, next),
            false,
          )}
          {i === fieldCount - 1 && i != 0 ? (
            <button
              type="button"
              className="govbb-btn--destructive-link"
              onClick={() => removeField(values)}
            >
              Remove{" "}
              <span className="govbb-visually-hidden">{field.label}</span>
            </button>
          ) : null}
        </React.Fragment>
      ))}
      {fieldCount < max ? (
        <button
          type="button"
          className="govbb-btn--link"
          onClick={() => addAnotherField(values)}
        >
          Add Another{" "}
          <span className="govbb-visually-hidden">{field.label}</span>
        </button>
      ) : null}
    </>
  );
}
