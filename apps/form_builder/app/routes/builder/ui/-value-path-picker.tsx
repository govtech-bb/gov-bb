import type { ResolvedFieldId } from "@govtech-bb/form-builder";

interface ValuePathPickerProps {
  value: string;
  fields: ResolvedFieldId[];
  onChange: (value: string) => void;
  id?: string;
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
}: ValuePathPickerProps) {
  const paths = fields.map((f) => `${f.stepId}.${f.fieldId}`);
  const showCurrent = value !== "" && !paths.includes(value);

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
      {showCurrent && <option value={value}>{value} (current)</option>}
    </select>
  );
}
