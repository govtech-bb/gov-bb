/**
 * @jest-environment jsdom
 *
 * #519: the conditional Target Field picker is gated on and scoped to the
 * selected Target Step, keyed by resolved field id.
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Behaviour } from "@govtech-bb/form-types";
import { BehavioursEditor } from "./-behaviours-editor";
import type { FieldRef, StepRef } from "./-recipe-refs";

const STEP_REFS: StepRef[] = [
  { stepId: "step-1", title: "Step One" },
  { stepId: "step-2", title: "Step Two" },
];

const FIELD_REFS: FieldRef[] = [
  { stepId: "step-1", fieldId: "first-name", displayName: "First Name" },
  { stepId: "step-1", fieldId: "last-name", displayName: "Last Name" },
  { stepId: "step-2", fieldId: "email", displayName: "Email" },
];

function targetFieldSelect() {
  // The Target Field picker is the only select whose placeholder is "select field".
  return screen
    .getAllByRole("combobox")
    .find((el) =>
      within(el).queryByRole("option", { name: /select field/i }),
    ) as HTMLSelectElement;
}

function targetStepSelect() {
  return screen
    .getAllByRole("combobox")
    .find((el) =>
      within(el).queryByRole("option", { name: /select step/i }),
    ) as HTMLSelectElement;
}

function renderStepBehaviour(behaviours: Behaviour[], onChange = jest.fn()) {
  render(
    <BehavioursEditor
      scope="step"
      behaviours={behaviours}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  return onChange;
}

it("disables the Target Field picker until a Target Step is chosen", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  expect(targetFieldSelect()).toBeDisabled();
});

it("enables the Target Field picker once a Target Step is set", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  expect(targetFieldSelect()).toBeEnabled();
});

it("limits Target Field options to fields in the selected Target Step", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  const options = within(targetFieldSelect())
    .getAllByRole("option")
    .map((o) => o.textContent);
  expect(options).toEqual(["— select field —", "First Name", "Last Name"]);
});

it("uses the resolved field id as the option value", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  const firstName = within(targetFieldSelect()).getByRole("option", {
    name: "First Name",
  }) as HTMLOptionElement;
  expect(firstName.value).toBe("first-name");
});

it("clears an incompatible Target Field when the Target Step changes", async () => {
  const onChange = renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "first-name", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  await userEvent.selectOptions(targetStepSelect(), "step-2");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetStepId: "step-2", targetFieldId: "" }),
  ]);
});

it("keeps the Target Field when the new step still contains it", async () => {
  // A field id that exists in both steps must survive the step change.
  const refs: FieldRef[] = [
    { stepId: "step-1", fieldId: "shared", displayName: "Shared" },
    { stepId: "step-2", fieldId: "shared", displayName: "Shared" },
  ];
  const onChange = jest.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[
        { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "shared", operator: "equal", value: "" } as unknown as Behaviour,
      ]}
      fieldRefs={refs}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  await userEvent.selectOptions(targetStepSelect(), "step-2");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetStepId: "step-2", targetFieldId: "shared" }),
  ]);
});

it("renders distinct options for two fields in a step that resolve to the same id", () => {
  // Open question in the plan: two same-type components in one step resolve to
  // the same fieldId. The picker must still render both without a duplicate
  // React key crashing the render (keys are stepId:fieldId:index).
  const refs: FieldRef[] = [
    { stepId: "step-1", fieldId: "text", displayName: "Text" },
    { stepId: "step-1", fieldId: "text", displayName: "Text" },
  ];
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[
        { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
      ]}
      fieldRefs={refs}
      stepRefs={STEP_REFS}
      onChange={jest.fn()}
    />,
  );
  // Placeholder + two duplicate-id options, all rendered (no key collision).
  expect(within(targetFieldSelect()).getAllByRole("option")).toHaveLength(3);
});

it("defaults a new fieldConditionalOn's Target Step to currentStepId", async () => {
  const onChange = jest.fn();
  render(
    <BehavioursEditor
      scope="field"
      behaviours={[]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
      currentStepId="step-2"
    />,
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox"),
    "fieldConditionalOn",
  );
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ type: "fieldConditionalOn", targetStepId: "step-2" }),
  ]);
});
