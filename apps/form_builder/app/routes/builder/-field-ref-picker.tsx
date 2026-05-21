import type { FieldRef } from "./-recipe-refs";

interface FieldRefPickerProps {
  value: string;
  fieldRefs: FieldRef[];
  onChange: (value: string) => void;
}

export function FieldRefPicker({ value, fieldRefs, onChange }: FieldRefPickerProps) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— select field —</option>
      {fieldRefs.map((f) => (
        <option key={`${f.stepId}:${f.fieldRef}`} value={f.fieldRef}>
          {f.displayName}
        </option>
      ))}
    </select>
  );
}
