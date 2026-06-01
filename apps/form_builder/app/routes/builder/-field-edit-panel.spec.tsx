/**
 * @jest-environment jsdom
 *
 * Regression (#487): the "Required" checkbox must reflect and control the
 * *effective* required state (registry base merged with the override), and
 * unchecking a base-required field must write an explicit `value: false` so the
 * merge can override the base — otherwise the field is always required.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getCatalog } from "@govtech-bb/form-builder";
import type { RecipeDraft, RecipeFieldDraft } from "@govtech-bb/form-builder";
import { FieldEditPanel } from "./-field-edit-panel";

const catalog = getCatalog();

function makeDraft(field: RecipeFieldDraft): RecipeDraft {
  return {
    formId: "form-001",
    title: "Test Form",
    steps: [{ stepId: "step-1", title: "Step 1", fields: [field], behaviours: [] }],
  };
}

function makeField(ref: string): RecipeFieldDraft {
  return { id: "f1", kind: "component", ref, overrides: {} };
}

const requiredCheckbox = () =>
  screen.getByRole("checkbox", { name: /^required$/i });

it("checks Required for a field that is required in the registry", () => {
  const field = makeField("components/last-name"); // base required: { value: true }
  render(
    <FieldEditPanel
      field={field}
      catalog={catalog}
      draft={makeDraft(field)}
      stepId="step-1"
      dispatch={jest.fn()}
      onClose={jest.fn()}
    />,
  );
  expect(requiredCheckbox()).toBeChecked();
});

it("writes required:{value:false} when un-requiring a base-required field", async () => {
  const dispatch = jest.fn();
  const field = makeField("components/last-name");
  render(
    <FieldEditPanel
      field={field}
      catalog={catalog}
      draft={makeDraft(field)}
      stepId="step-1"
      dispatch={dispatch}
      onClose={jest.fn()}
    />,
  );

  await userEvent.click(requiredCheckbox());
  expect(requiredCheckbox()).not.toBeChecked();

  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "UPDATE_FIELD_OVERRIDES",
      overrides: { validations: { required: { value: false } } },
    }),
  );
});

it("leaves an optional builtin field unchecked and adds no override when untouched", () => {
  const field = makeField("components/text"); // builtin: no validations
  render(
    <FieldEditPanel
      field={field}
      catalog={catalog}
      draft={makeDraft(field)}
      stepId="step-1"
      dispatch={jest.fn()}
      onClose={jest.fn()}
    />,
  );
  expect(requiredCheckbox()).not.toBeChecked();
});

it("writes required:{value:true} when requiring an optional builtin field", async () => {
  const dispatch = jest.fn();
  const field = makeField("components/text");
  render(
    <FieldEditPanel
      field={field}
      catalog={catalog}
      draft={makeDraft(field)}
      stepId="step-1"
      dispatch={dispatch}
      onClose={jest.fn()}
    />,
  );

  await userEvent.click(requiredCheckbox());
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "UPDATE_FIELD_OVERRIDES",
      overrides: { validations: { required: { value: true } } },
    }),
  );
});
