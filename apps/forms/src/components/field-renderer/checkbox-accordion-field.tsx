import { JSX, useState } from "react";
import { Checkbox, Fieldset, FormGroup, Hint } from "@govtech-bb/react";
import type { OptionGroup } from "@govtech-bb/form-types";
import ErrorMessage from "../error-message";
import { FieldRenderContext } from "./render-context";

/**
 * A collapsible multi-select. Each category is a checkbox that expands to
 * reveal its item checkboxes (matching the prototype): ticking the category
 * opens it; the items appear in a blue-bordered inset. A `higherRisk` category
 * carries a "Higher-risk" badge on its label. Item selections accumulate into a
 * single flat string[] across all groups — collapsing a category never clears
 * what was ticked inside it, and a category that already has a selection opens
 * expanded so restored answers are visible.
 */
function AccordionCategory({
  group,
  selected,
  invalid,
  onToggleItem,
}: {
  group: OptionGroup;
  selected: string[];
  invalid?: boolean;
  onToggleItem: (value: string) => void;
}): JSX.Element {
  const hasSelection = group.options.some((o) => selected.includes(o.value));
  const [open, setOpen] = useState(hasSelection);
  const label = (
    <>
      {group.label}
      {group.higherRisk && (
        <span className="govbb-tag govbb-tag--higher-risk">Higher-risk</span>
      )}
    </>
  );

  // A category holding exactly ONE item has nothing worth expanding: the
  // expander would cost two ticks (open the category, then tick its lone item)
  // to say one thing. Render it as a plain checkbox carrying the GROUP's label
  // and bound straight to that item's value. This is what makes a lone "Other
  // food" escape hatch at the foot of the list behave like a single choice.
  if (group.options.length === 1) {
    const option = group.options[0];
    return (
      <Checkbox
        label={label}
        value={option.value}
        checked={selected.includes(option.value)}
        aria-invalid={invalid}
        onChange={() => onToggleItem(option.value)}
      />
    );
  }

  return (
    <Checkbox
      label={label}
      checked={open}
      aria-expanded={open}
      aria-invalid={invalid}
      onChange={() => setOpen((o) => !o)}
      conditional={
        open && (
          <FormGroup>
            {group.options.map((option) => (
              <Checkbox
                key={option.value}
                label={option.label}
                value={option.value}
                checked={selected.includes(option.value)}
                aria-invalid={invalid}
                onChange={() => onToggleItem(option.value)}
              />
            ))}
          </FormGroup>
        )
      }
    />
  );
}

export function renderCheckboxAccordionField(
  ctx: FieldRenderContext,
): JSX.Element {
  const {
    field,
    f,
    hintId,
    errorId,
    errorMessage,
    describedBy,
    invalid,
    labelClass,
    labelSuffix,
    commitChange,
  } = ctx;

  const selected: string[] = (f.state.value as string[] | undefined) ?? [];

  const toggle = (item: string) => {
    const next = selected.includes(item)
      ? selected.filter((v) => v !== item)
      : [...selected, item];
    commitChange(next);
  };

  return (
    <Fieldset
      id={field.id}
      disabled={field.disabled}
      aria-describedby={describedBy}
    >
      <legend className={labelClass("govbb-fieldset__legend")}>
        {field.label}
        {labelSuffix}
      </legend>
      {field.hint && <Hint id={hintId}>{field.hint}</Hint>}
      <ErrorMessage id={errorId} message={errorMessage} />
      {field.groups?.map((group) => (
        <AccordionCategory
          key={group.label}
          group={group}
          selected={selected}
          invalid={invalid}
          onToggleItem={toggle}
        />
      ))}
    </Fieldset>
  );
}
