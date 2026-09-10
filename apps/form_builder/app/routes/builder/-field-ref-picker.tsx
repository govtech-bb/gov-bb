import { Select } from "../../components/ui/select";
import type { FieldRef } from "./-recipe-refs";

interface FieldRefPickerProps {
  label?: string;
  value: string;
  fieldRefs: FieldRef[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function FieldRefPicker({
  label,
  value,
  fieldRefs,
  onChange,
  disabled = false,
}: FieldRefPickerProps) {
  return (
    <Select
      label={label}
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (nextValue === null) return;
        onChange(nextValue);
      }}
      items={[
        { value: "", label: "— select field —" },
        ...fieldRefs.map((f) => ({
          value: f.fieldId,
          label: f.displayName,
        })),
      ]}
    />
  );
}
