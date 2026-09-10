import { openSelect, chooseOption } from "../../test/select";
import type { Mock } from "vitest";
/**
 * @vitest-environment jsdom
 *
 * Regression (#487): the "Required" checkbox must reflect and control the
 * *effective* required state (registry base merged with the override), and
 * unchecking a base-required field must write an explicit `value: false` so the
 * merge can override the base — otherwise the field is always required.
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getCatalog } from "@govtech-bb/form-builder";
import type { RecipeDraft, RecipeFieldDraft } from "@govtech-bb/form-builder";
import { primitiveUISchema } from "@govtech-bb/form-types";
import { FieldEditPanel, humanize } from "./field-edit-panel";

const catalog = getCatalog();

function makeDraft(field: RecipeFieldDraft): RecipeDraft {
  return {
    formId: "form-001",
    title: "Test Form",
    steps: [
      { stepId: "step-1", title: "Step 1", fields: [field], behaviours: [] },
    ],
  };
}

function makeField(ref: string): RecipeFieldDraft {
  return { id: "f1", kind: "component", ref, overrides: {} };
}

function makeFieldWith(
  ref: string,
  overrides: RecipeFieldDraft["overrides"],
): RecipeFieldDraft {
  return { id: "f1", kind: "component", ref, overrides };
}

const requiredCheckbox = () =>
  screen.getByRole("checkbox", { name: /^required$/i });

it("uses open for visibility and discards canceled edits when reopened", async () => {
  const user = userEvent.setup();
  const field = makeField("components/last-name");
  const props = {
    field,
    catalog,
    draft: makeDraft(field),
    stepId: "step-1",
    dispatch: vi.fn(),
    onClose: vi.fn(),
  };
  const view = render(<FieldEditPanel {...props} open={false} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  view.rerender(<FieldEditPanel {...props} open />);
  await screen.findByRole("dialog");
  await user.click(requiredCheckbox());
  expect(requiredCheckbox()).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(props.dispatch).not.toHaveBeenCalled();

  view.rerender(<FieldEditPanel {...props} open={false} />);
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { hidden: true }),
    ).not.toBeInTheDocument(),
  );
  view.rerender(<FieldEditPanel {...props} open />);
  await screen.findByRole("dialog");
  expect(requiredCheckbox()).toBeChecked();
});

it("checks Required for a field that is required in the registry", async () => {
  const field = makeField("components/last-name"); // base required: { value: true }
  render(
    <FieldEditPanel
      open
      field={field}
      catalog={catalog}
      draft={makeDraft(field)}
      stepId="step-1"
      dispatch={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(requiredCheckbox()).toBeChecked();
});

it("writes required:{value:false} when un-requiring a base-required field", async () => {
  const dispatch = vi.fn();
  const field = makeField("components/last-name");
  render(
    <FieldEditPanel
      open
      field={field}
      catalog={catalog}
      draft={makeDraft(field)}
      stepId="step-1"
      dispatch={dispatch}
      onClose={vi.fn()}
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

it("leaves an optional field unchecked and adds no override when untouched", async () => {
  const field = makeField("components/middle-name"); // registry: no required rule
  render(
    <FieldEditPanel
      open
      field={field}
      catalog={catalog}
      draft={makeDraft(field)}
      stepId="step-1"
      dispatch={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(requiredCheckbox()).not.toBeChecked();
});

it("writes required:{value:true} when requiring an optional field", async () => {
  const dispatch = vi.fn();
  const field = makeField("components/middle-name");
  render(
    <FieldEditPanel
      open
      field={field}
      catalog={catalog}
      draft={makeDraft(field)}
      stepId="step-1"
      dispatch={dispatch}
      onClose={vi.fn()}
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
// rendered by introspecting `primitiveUISchema`. `width` falls back to the
// base primitive's registry `ui` value when declared, else the global `long`
// (#789); choosing the fallback clears the key, mirroring the boolean
// "back-to-default ⇒ undefined" behaviour. `ui` collapses to `undefined` when
// it holds no set keys.

const widthSelect = () =>
  screen.getByRole("combobox", { name: /field width/i });
const hideLabelCheckbox = () =>
  screen.getByRole("checkbox", { name: /hide label/i });

function renderPanel(field: RecipeFieldDraft, dispatch = vi.fn()) {
  render(
    <FieldEditPanel
      open
      field={field}
      catalog={catalog}
      draft={makeDraft(field)}
      stepId="step-1"
      dispatch={dispatch}
      onClose={vi.fn()}
    />,
  );
  return dispatch;
}

const lastOverrides = (dispatch: Mock) =>
  dispatch.mock.calls.at(-1)![0].overrides;

it.each(["short", "medium"] as const)(
  "dispatches ui.width=%s when the width select is changed",
  async (width) => {
    const dispatch = renderPanel(makeField("components/generic-text"));
    await chooseOption(widthSelect(), humanize(width));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(lastOverrides(dispatch)).toEqual({ ui: { width } });
  },
);

it("collapses ui to undefined when width is set back to the long default", async () => {
  const dispatch = renderPanel(
    makeFieldWith("components/generic-text", { ui: { width: "short" } }),
  );
  expect(widthSelect()).toHaveTextContent("Short");
  await chooseOption(widthSelect(), "Long");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(lastOverrides(dispatch).ui).toBeUndefined();
});

it("collapses ui to undefined when hideLabel is unchecked as the last set key (#522 regression)", async () => {
  const dispatch = renderPanel(
    makeFieldWith("components/generic-text", { ui: { hideLabel: true } }),
  );
  expect(hideLabelCheckbox()).toBeChecked();
  await userEvent.click(hideLabelCheckbox());
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(lastOverrides(dispatch).ui).toBeUndefined();
});

it("preserves hideLabel when width is set alongside it", async () => {
  const dispatch = renderPanel(
    makeFieldWith("components/generic-text", { ui: { hideLabel: true } }),
  );
  await chooseOption(widthSelect(), "Short");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(lastOverrides(dispatch).ui).toEqual({
    hideLabel: true,
    width: "short",
  });
});

// --- Registry ui defaults (#789) ------------------------------------------
// A component can declare its own `ui` defaults in the registry (National ID
// hard-codes `width: "short"`). The panel's fallback must be that registry
// value, not the global `long` — otherwise selecting "Long" collapses to
// undefined, the registry `short` wins on resolution, and "Long" renders
// *narrower* than "Medium".

it("shows the registry ui.width default for an untouched component", async () => {
  renderPanel(makeField("components/national-id-number")); // registry: width "short"
  expect(widthSelect()).toHaveTextContent("Short");
});

it("persists ui.width=long when it differs from the registry default (#789)", async () => {
  const dispatch = renderPanel(makeField("components/national-id-number"));
  await chooseOption(widthSelect(), "Long");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(lastOverrides(dispatch)).toEqual({ ui: { width: "long" } });
});

it("collapses ui when width is set back to the registry default", async () => {
  const dispatch = renderPanel(
    makeFieldWith("components/national-id-number", { ui: { width: "long" } }),
  );
  expect(widthSelect()).toHaveTextContent("Long");
  await chooseOption(widthSelect(), "Short");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(lastOverrides(dispatch).ui).toBeUndefined();
});

it("defaults the width select to a value that is a real schema enum member", async () => {
  // Guards against `UI_FIELD_META.width.default` drifting from the schema: the
  // value shown when `ui.width` is unset must be a genuine enum member, or
  // re-selecting it would fail to clear the key (the collapse test above).
  renderPanel(makeField("components/generic-text"));
  const enumOptions = primitiveUISchema.shape.width.unwrap().options;
  expect(enumOptions).toContain(widthSelect().textContent?.toLowerCase());
});

it("humanizes a key name for the schema-driven fallback label", async () => {
  // A future `ui` key with no UI_FIELD_META entry falls back to this label.
  expect(humanize("width")).toBe("Width");
  expect(humanize("hideLabel")).toBe("Hide Label");
});

// --- Change a field's ref / type from the editor (#642) ------------------
// A non-block field shows its underlying registry ref and, when its htmlType
// belongs to a swap group, a picker of the generic peers it can switch to.
// Switching migrates compatible overrides and drops the rest.

const fieldTypeSelect = () =>
  screen.getByRole("combobox", { name: /field type/i });

it("shows the current registry ref for a non-block field", async () => {
  renderPanel(makeField("components/generic-text"));
  expect(screen.getByText("components/generic-text")).toBeInTheDocument();
});

it("offers the generic swap peers in the Field type picker", async () => {
  renderPanel(makeField("components/generic-text"));
  const options = Array.from(
    (await openSelect(fieldTypeSelect())).querySelectorAll('[role="option"]'),
  ).map((o) => o.textContent);
  expect(options).toEqual(
    expect.arrayContaining([
      "Text",
      "Long text",
      "Telephone",
      "Number",
      "Email",
    ]),
  );
});

it("shows a read-only ref with a no-swap note for a singleton type", async () => {
  renderPanel(makeField("components/generic-date"));
  expect(screen.getByText("components/generic-date")).toBeInTheDocument();
  expect(
    screen.getByText(/no similar types to switch to/i),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: /field type/i }),
  ).not.toBeInTheDocument();
});

it("renders no Field type picker for a block field", () => {
  // One real child exercises block rendering without the nationality options list.
  renderPanel({
    id: "b1",
    kind: "block",
    ref: "blocks/additional-information",
    overrides: {},
  });
  expect(screen.getByLabelText("Field ID Override")).toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: /field type/i }),
  ).not.toBeInTheDocument();
});

it("dispatches CHANGE_FIELD_REF migrating compatible overrides on save", async () => {
  const dispatch = renderPanel(
    makeFieldWith("components/generic-text", {
      label: "My Label",
      validations: { required: { value: true }, pattern: { value: "[a-z]+" } },
    }),
  );

  await chooseOption(fieldTypeSelect(), "Long text");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "CHANGE_FIELD_REF",
      ref: "components/generic-textarea",
      // label + required kept; pattern (unsupported by textarea) dropped;
      // the default fieldId is pinned so references survive the swap.
      overrides: {
        fieldId: "generic-text",
        label: "My Label",
        validations: { required: { value: true } },
      },
    }),
  );
});

it("pins the current default fieldId on swap so references survive (no explicit override)", async () => {
  // generic-text resolves its default fieldId to "generic-text". Swapping type
  // would otherwise re-resolve it to "generic-textarea", dangling any reference.
  const dispatch = renderPanel(makeField("components/generic-text"));
  await chooseOption(fieldTypeSelect(), "Long text");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "CHANGE_FIELD_REF",
      ref: "components/generic-textarea",
      overrides: expect.objectContaining({ fieldId: "generic-text" }),
    }),
  );
});

it("leaves an explicit fieldId override untouched on swap", async () => {
  const dispatch = renderPanel(
    makeFieldWith("components/generic-text", { fieldId: "my-custom-id" }),
  );
  await chooseOption(fieldTypeSelect(), "Long text");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      overrides: expect.objectContaining({ fieldId: "my-custom-id" }),
    }),
  );
});

it("still dispatches UPDATE_FIELD_OVERRIDES when the ref is unchanged", async () => {
  const dispatch = renderPanel(makeField("components/generic-text"));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ type: "UPDATE_FIELD_OVERRIDES" }),
  );
});

// --- Inherited base validation rules (#618) ------------------------------
// The panel must thread the base primitive's validations into the validation
// editor so a component's declared rules (e.g. National ID's `pattern`) are
// visible and overridable — not silently enforced only at runtime.

const NATIONAL_ID_PATTERN_ERROR =
  "Enter a valid National ID number (for example, 850101-0001)";

it("surfaces a base component validation rule as an inherited, read-only row", async () => {
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

// --- Custom Required error message (#1022) -------------------------------
// #618 moved `required` off the ValidationRulesEditor (to kill a double
// control) and onto the dedicated checkbox — but the checkbox only ever wrote
// the boolean, leaving no UI path to set `required.error`. This input restores
// it: visible only when the field is *effectively* required, owned by the same
// single control as the checkbox. The override must carry both keys together
// (`{ value: true, error }`) because validations merge shallow at the rule
// level (`shallowMergeDefined`) — a bare `{ error }` would drop `value`.

const requiredErrorInput = () =>
  screen.queryByLabelText(/required error message/i);

it("hides the Required error message input when the field is not required", async () => {
  renderPanel(makeField("components/middle-name")); // registry: no required rule
  expect(requiredErrorInput()).not.toBeInTheDocument();
});

it("shows the Required error message input with the inherited base error as placeholder", async () => {
  // last-name declares a custom required error in the registry. With no
  // override of its own, the input is empty but hints the inherited message.
  renderPanel(makeField("components/last-name"));
  const input = requiredErrorInput();
  expect(input).toBeInTheDocument();
  expect(input).toHaveAttribute("placeholder", "Last name is required");
  expect(input).toHaveValue("");
});

it("populates the input with an existing custom Required error", async () => {
  renderPanel(
    makeFieldWith("components/middle-name", {
      validations: {
        required: { value: true, error: "Please tell us your middle name" },
      },
    }),
  );
  expect(requiredErrorInput()).toHaveValue("Please tell us your middle name");
});

it("writes required:{ value: true, error } when a message is typed", async () => {
  const dispatch = renderPanel(makeField("components/middle-name"));

  await userEvent.click(requiredCheckbox()); // make it effectively required
  await userEvent.type(requiredErrorInput()!, "Middle name is required");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(lastOverrides(dispatch).validations).toEqual({
    required: { value: true, error: "Middle name is required" },
  });
});

it("keeps required:{ value: true } when the message is emptied on an override-required (base-optional) field", async () => {
  const dispatch = renderPanel(
    makeFieldWith("components/middle-name", {
      validations: {
        required: { value: true, error: "Middle name is required" },
      },
    }),
  );

  await userEvent.clear(requiredErrorInput()!);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  // Base doesn't require the field — dropping the rule would un-require it, so
  // the override must persist as a bare `{ value: true }`.
  expect(lastOverrides(dispatch).validations).toEqual({
    required: { value: true },
  });
});

it("clears the override to restore inheritance when the message is emptied on a base-required field", async () => {
  const dispatch = renderPanel(
    makeFieldWith("components/last-name", {
      validations: { required: { value: true, error: "Surname is required" } },
    }),
  );

  await userEvent.clear(requiredErrorInput()!);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  // Base already requires the field, so dropping the override restores
  // inheritance rather than persisting a redundant `{ value: true }`.
  expect(lastOverrides(dispatch).validations).toBeUndefined();
});
