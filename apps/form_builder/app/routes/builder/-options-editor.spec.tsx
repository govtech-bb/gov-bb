/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Option } from "@govtech-bb/form-types";
import { OptionsEditor } from "./-options-editor";

const defaults: Option[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

it("renders default options when not overridden", () => {
  render(
    <OptionsEditor
      value={[]}
      defaultValue={defaults}
      isOverridden={false}
      onChange={() => {}}
    />,
  );
  expect(screen.getByDisplayValue("Yes")).toBeInTheDocument();
  expect(screen.getByDisplayValue("yes")).toBeInTheDocument();
  expect(screen.getByDisplayValue("No")).toBeInTheDocument();
  expect(screen.getByDisplayValue("no")).toBeInTheDocument();
});

it("hides Reset button when not overridden", () => {
  render(
    <OptionsEditor
      value={[]}
      defaultValue={defaults}
      isOverridden={false}
      onChange={() => {}}
    />,
  );
  expect(
    screen.queryByRole("button", { name: /reset to defaults/i }),
  ).not.toBeInTheDocument();
});

it("shows Reset button when overridden", () => {
  render(
    <OptionsEditor
      value={defaults}
      defaultValue={defaults}
      isOverridden={true}
      onChange={() => {}}
    />,
  );
  expect(
    screen.getByRole("button", { name: /reset to defaults/i }),
  ).toBeInTheDocument();
});

it("emits the defaults plus a blank row when Add option is clicked while not overridden", async () => {
  const onChange = vi.fn();
  render(
    <OptionsEditor
      value={[]}
      defaultValue={defaults}
      isOverridden={false}
      onChange={onChange}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /add option/i }));
  expect(onChange).toHaveBeenLastCalledWith([
    ...defaults,
    { label: "", value: "" },
  ]);
});

it("emits the array with an updated label when a label input changes", async () => {
  const onChange = vi.fn();
  render(
    <OptionsEditor
      value={defaults}
      defaultValue={defaults}
      isOverridden={true}
      onChange={onChange}
    />,
  );
  const yesLabel = screen.getByDisplayValue("Yes");
  await userEvent.type(yesLabel, "!");
  expect(onChange).toHaveBeenLastCalledWith([
    { label: "Yes!", value: "yes" },
    { label: "No", value: "no" },
  ]);
});

it("emits the array with an updated value when a value input changes", async () => {
  const onChange = vi.fn();
  render(
    <OptionsEditor
      value={defaults}
      defaultValue={defaults}
      isOverridden={true}
      onChange={onChange}
    />,
  );
  const yesValue = screen.getByDisplayValue("yes");
  await userEvent.type(yesValue, "_");
  expect(onChange).toHaveBeenLastCalledWith([
    { label: "Yes", value: "yes_" },
    { label: "No", value: "no" },
  ]);
});

it("emits the array without the removed row when a delete button is clicked", async () => {
  const onChange = vi.fn();
  render(
    <OptionsEditor
      value={defaults}
      defaultValue={defaults}
      isOverridden={true}
      onChange={onChange}
    />,
  );
  const removeButtons = screen.getAllByRole("button", { name: /remove option/i });
  await userEvent.click(removeButtons[0]);
  expect(onChange).toHaveBeenLastCalledWith([{ label: "No", value: "no" }]);
});

it("moves a row down when the down button is clicked", async () => {
  const onChange = vi.fn();
  render(
    <OptionsEditor
      value={defaults}
      defaultValue={defaults}
      isOverridden={true}
      onChange={onChange}
    />,
  );
  const downButtons = screen.getAllByRole("button", { name: /move option down/i });
  await userEvent.click(downButtons[0]);
  expect(onChange).toHaveBeenLastCalledWith([
    { label: "No", value: "no" },
    { label: "Yes", value: "yes" },
  ]);
});

it("moves a row up when the up button is clicked", async () => {
  const onChange = vi.fn();
  render(
    <OptionsEditor
      value={defaults}
      defaultValue={defaults}
      isOverridden={true}
      onChange={onChange}
    />,
  );
  const upButtons = screen.getAllByRole("button", { name: /move option up/i });
  // index 1 (second row) — first row's up button is disabled
  await userEvent.click(upButtons[1]);
  expect(onChange).toHaveBeenLastCalledWith([
    { label: "No", value: "no" },
    { label: "Yes", value: "yes" },
  ]);
});

it("disables the up button on the first row and the down button on the last row", () => {
  render(
    <OptionsEditor
      value={defaults}
      defaultValue={defaults}
      isOverridden={true}
      onChange={() => {}}
    />,
  );
  const upButtons = screen.getAllByRole("button", { name: /move option up/i });
  const downButtons = screen.getAllByRole("button", { name: /move option down/i });
  expect(upButtons[0]).toBeDisabled();
  expect(downButtons[downButtons.length - 1]).toBeDisabled();
});

it("emits the array with a row's disabled flag toggled on", async () => {
  const onChange = vi.fn();
  render(
    <OptionsEditor
      value={defaults}
      defaultValue={defaults}
      isOverridden={true}
      onChange={onChange}
    />,
  );
  const disabledCheckboxes = screen.getAllByRole("checkbox", { name: /disabled/i });
  await userEvent.click(disabledCheckboxes[0]);
  expect(onChange).toHaveBeenLastCalledWith([
    { label: "Yes", value: "yes", disabled: true },
    { label: "No", value: "no" },
  ]);
});

it("clears the disabled flag when an already-disabled row's checkbox is unchecked", async () => {
  const onChange = vi.fn();
  render(
    <OptionsEditor
      value={[
        { label: "Yes", value: "yes", disabled: true },
        { label: "No", value: "no" },
      ]}
      defaultValue={defaults}
      isOverridden={true}
      onChange={onChange}
    />,
  );
  const disabledCheckboxes = screen.getAllByRole("checkbox", { name: /disabled/i });
  await userEvent.click(disabledCheckboxes[0]);
  expect(onChange).toHaveBeenLastCalledWith([
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
  ]);
});

it("emits undefined when Reset to defaults is clicked", async () => {
  const onChange = vi.fn();
  render(
    <OptionsEditor
      value={[{ label: "Custom", value: "custom" }]}
      defaultValue={defaults}
      isOverridden={true}
      onChange={onChange}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: /reset to defaults/i }),
  );
  expect(onChange).toHaveBeenLastCalledWith(undefined);
});
