import type { ResolvedFieldId } from "@govtech-bb/form-builder";

interface ValuePathPickerProps {
  value: string;
  fields: ResolvedFieldId[];
  onChange: (value: string) => void;
  id?: string;
  /**
   * Selectable paths that aren't form fields — e.g. the reserved
   * `contactDetails.email` recipient. Rendered as `label (value)`, mirroring
   * the `display (path)` format of field options.
   */
  extraOptions?: { value: string; label: string }[];
}

/**
 * A `<select>` over the form's resolved fields, emitting a `stepId.fieldId`
 * dot-path the runtime resolves against submission `values`. Distinct from
 * FieldRefPicker, which selects a registry *ref* — a different value space.
 *
 * An existing value that matches no current field (e.g. a path hand-authored in
 * the recipe JSON, or one whose field was renamed) is kept as a selectable
 * option so opening the picker never silently discards it.
 */
export function ValuePathPicker({
  value,
  fields,
  onChange,
  id,
  extraOptions = [],
}: ValuePathPickerProps) {
  const paths = fields.map((f) => `${f.stepId}.${f.fieldId}`);
  // Drop any extra option that collides with a real field path, so a step
  // literally named `contactDetails` with an `email` field can't render the
  // same value twice. (Reserved-namespace collision; the runtime shadows it.)
  const extras = extraOptions.filter((o) => !paths.includes(o.value));
  const extraValues = extras.map((o) => o.value);
  // The `(current)` fallback only fires when the value isn't already a field
  // path nor an extra option, so a seeded `contactDetails.email` renders once.
  const showCurrent =
    value !== "" && !paths.includes(value) && !extraValues.includes(value);

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— select field —</option>
      {fields.map((f) => {
        const path = `${f.stepId}.${f.fieldId}`;
        return (
          <option
            key={`${f.editorFieldId}:${f.childFieldId ?? f.fieldId}`}
            value={path}
          >
            {f.display} ({path})
          </option>
        );
      })}
      {extras.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label} ({o.value})
        </option>
      ))}
      {showCurrent && <option value={value}>{value} (current)</option>}
    </select>
  );
}
