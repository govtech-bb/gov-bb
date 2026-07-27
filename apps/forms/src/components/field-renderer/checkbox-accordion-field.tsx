import { JSX, useState } from "react";
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
  idBase,
  fieldId,
  selected,
  onToggleItem,
}: {
  group: OptionGroup;
  idBase: string;
  fieldId: string;
  selected: string[];
  onToggleItem: (value: string) => void;
}): JSX.Element {
  const hasSelection = group.options.some((o) => selected.includes(o.value));
  const [open, setOpen] = useState(hasSelection);
  const itemsId = `${idBase}-items`;

  return (
    <div className="govbb-accordion-group">
      <div className="govbb-checkbox-item">
        <input
          type="checkbox"
          className="govbb-checkbox"
          id={idBase}
          checked={open}
          aria-expanded={open}
          aria-controls={itemsId}
          onChange={() => setOpen((o) => !o)}
        />
        <label className="govbb-checkbox-item__label" htmlFor={idBase}>
          {group.label}
          {group.higherRisk && (
            <span className="govbb-tag govbb-tag--higher-risk">
              Higher-risk
            </span>
          )}
        </label>
      </div>
      {open && (
        <div id={itemsId} className="govbb-accordion-group__content">
          {group.options.map((option) => (
            <div className="govbb-checkbox-item" key={option.value}>
              <input
                type="checkbox"
                className="govbb-checkbox"
                id={`${fieldId}-${option.value}`}
                checked={selected.includes(option.value)}
                onChange={() => onToggleItem(option.value)}
              />
              <label
                className="govbb-checkbox-item__label"
                htmlFor={`${fieldId}-${option.value}`}
              >
                {option.label}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function renderCheckboxAccordionField(
  ctx: FieldRenderContext,
): JSX.Element {
  const { field, f, hintId, errorId, errorMessage, labelClass, commitChange } =
    ctx;

  const selected: string[] = (f.state.value as string[] | undefined) ?? [];

  const toggle = (item: string) => {
    const next = selected.includes(item)
      ? selected.filter((v) => v !== item)
      : [...selected, item];
    commitChange(next);
  };

  return (
    <fieldset className="govbb-fieldset" id={field.id}>
      <legend className={labelClass("govbb-fieldset__legend")}>
        {field.label}
      </legend>
      {field.hint && (
        <p className="govbb-hint" id={hintId}>
          {field.hint}
        </p>
      )}
      <ErrorMessage id={errorId} message={errorMessage} />
      <div className="form-page__accordion">
        {field.groups?.map((group, i) => (
          <AccordionCategory
            key={group.label}
            group={group}
            idBase={`${field.id}-cat-${i}`}
            fieldId={field.id}
            selected={selected}
            onToggleItem={toggle}
          />
        ))}
      </div>
    </fieldset>
  );
}
