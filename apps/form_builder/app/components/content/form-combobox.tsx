import { useMemo } from "react";
import { Combobox } from "../ui/combobox";
import type { BuilderFormSummary } from "../../types/index";

interface FormComboboxProps {
  forms: BuilderFormSummary[];
  value: string;
  onChange: (formId: string) => void;
}

export function FormCombobox({ forms, value, onChange }: FormComboboxProps) {
  const options = useMemo(
    () => [
      { value: "", label: "No linked form", meta: "" },
      ...forms.map((form) => ({
        value: form.formId,
        label: form.title || form.formId,
        meta: `${form.formId}${form.isPublished ? "" : " · draft"}`,
      })),
    ],
    [forms],
  );
  const selected =
    options.find((option) => option.value === value) ?? options[0];
  return (
    <Combobox
      label="Form to link"
      items={options}
      value={selected}
      onValueChange={(option) => onChange(option?.value ?? "")}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      filter={(option, query) =>
        option.value === "" ||
        `${option.label} ${option.meta}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      }
    >
      <Combobox.TriggerValue className="w-full" />
      <Combobox.Content align="start">
        <Combobox.Input aria-label="Search forms" placeholder="Search forms…" />
        <Combobox.List>
          {(option: (typeof options)[number]) => (
            <Combobox.Item key={option.value} value={option}>
              <span className="block">{option.label}</span>
              {option.meta && (
                <span className="block text-xs text-ui-subtle">
                  {option.meta}
                </span>
              )}
            </Combobox.Item>
          )}
        </Combobox.List>
        <Combobox.Empty>No matching forms</Combobox.Empty>
      </Combobox.Content>
    </Combobox>
  );
}
