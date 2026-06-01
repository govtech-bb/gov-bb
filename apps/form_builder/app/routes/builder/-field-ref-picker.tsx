import type { FieldRef } from "./-recipe-refs";

interface FieldRefPickerProps {
  value: string;
  fieldRefs: FieldRef[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function FieldRefPicker({
  value,
  fieldRefs,
  onChange,
  disabled = false,
}: FieldRefPickerProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— select field —</option>
      {/* Two same-type fields in one step resolve to the same fieldId, so the
          option value alone isn't unique — index keeps the React key stable. */}
      {fieldRefs.map((f, i) => (
        <option key={`${f.stepId}:${f.fieldId}:${i}`} value={f.fieldId}>
          {f.displayName}
        </option>
      ))}
    </select>
  );
}
