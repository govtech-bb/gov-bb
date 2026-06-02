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
import { primitiveUISchema } from "@govtech-bb/form-types";
import { FieldEditPanel, humanize } from "./-field-edit-panel";

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

function makeFieldWith(ref: string, overrides: RecipeFieldDraft["overrides"]): RecipeFieldDraft {
  return { id: "f1", kind: "component", ref, overrides };
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

// --- Schema-driven `ui` properties editor (#533) -------------------------
// The width control (enum) and the hide-label control (boolean) are both
// rendered by introspecting `primitiveUISchema`. `width` defaults to `long`
// (unset); choosing `long` clears the key, mirroring the boolean "unchecked ⇒
// undefined" behaviour. `ui` collapses to `undefined` when it holds no set keys.

const widthSelect = () =>
  screen.getByRole("combobox", { name: /field width/i });
const hideLabelCheckbox = () =>
  screen.getByRole("checkbox", { name: /hide label/i });

function renderPanel(field: RecipeFieldDraft, dispatch = jest.fn()) {
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
  return dispatch;
}

const lastOverrides = (dispatch: jest.Mock) =>
  dispatch.mock.calls.at(-1)![0].overrides;

it.each(["short", "medium"] as const)(
  "dispatches ui.width=%s when the width select is changed",
  async (width) => {
    const dispatch = renderPanel(makeField("components/text"));
    await userEvent.selectOptions(widthSelect(), width);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(lastOverrides(dispatch)).toEqual({ ui: { width } });
  },
);

it("collapses ui to undefined when width is set back to the long default", async () => {
  const dispatch = renderPanel(makeFieldWith("components/text", { ui: { width: "short" } }));
  expect(widthSelect()).toHaveValue("short");
  await userEvent.selectOptions(widthSelect(), "long");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(lastOverrides(dispatch).ui).toBeUndefined();
});

it("collapses ui to undefined when hideLabel is unchecked as the last set key (#522 regression)", async () => {
  const dispatch = renderPanel(makeFieldWith("components/text", { ui: { hideLabel: true } }));
  expect(hideLabelCheckbox()).toBeChecked();
  await userEvent.click(hideLabelCheckbox());
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(lastOverrides(dispatch).ui).toBeUndefined();
});

it("preserves hideLabel when width is set alongside it", async () => {
  const dispatch = renderPanel(makeFieldWith("components/text", { ui: { hideLabel: true } }));
  await userEvent.selectOptions(widthSelect(), "short");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(lastOverrides(dispatch).ui).toEqual({ hideLabel: true, width: "short" });
});

it("defaults the width select to a value that is a real schema enum member", () => {
  // Guards against `UI_FIELD_META.width.default` drifting from the schema: the
  // value shown when `ui.width` is unset must be a genuine enum member, or
  // re-selecting it would fail to clear the key (the collapse test above).
  renderPanel(makeField("components/text"));
  const enumOptions = primitiveUISchema.shape.width.unwrap().options;
  expect(enumOptions).toContain((widthSelect() as HTMLSelectElement).value);
});

it("humanizes a key name for the schema-driven fallback label", () => {
  // A future `ui` key with no UI_FIELD_META entry falls back to this label.
  expect(humanize("width")).toBe("Width");
  expect(humanize("hideLabel")).toBe("Hide Label");
});

// --- Inherited base validation rules (#618) ------------------------------
// The panel must thread the base primitive's validations into the validation
// editor so a component's declared rules (e.g. National ID's `pattern`) are
// visible and overridable — not silently enforced only at runtime.

const NATIONAL_ID_PATTERN_ERROR =
  "Enter a valid ID number (for example, 850101-0001)";

it("surfaces a base component validation rule as an inherited, read-only row", () => {
  // National ID number declares a `pattern` rule in the registry. Freshly added
  // (no overrides), it must still appear — inherited from the component.
  renderPanel(makeField("components/national-id-number"));

  expect(screen.getByText(/inherited from component/i)).toBeInTheDocument();
  expect(screen.getByText(NATIONAL_ID_PATTERN_ERROR)).toBeInTheDocument();
});

it("writes the base value into overrides when an inherited rule is overridden", async () => {
  const dispatch = renderPanel(makeField("components/national-id-number"));

  await userEvent.click(screen.getByRole("button", { name: /override/i }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(lastOverrides(dispatch).validations).toEqual({
    pattern: {
      value: "^\\d{6}-\\d{4}$",
      error: NATIONAL_ID_PATTERN_ERROR,
    },
  });
});
