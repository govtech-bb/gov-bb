/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OptionGroup } from "@govtech-bb/form-types";
import { OptionGroupsEditor } from "./option-groups-editor";

const groups: OptionGroup[] = [
  {
    label: "Meat and poultry",
    higherRisk: true,
    options: [
      { label: "Chicken", value: "chicken" },
      { label: "Lamb", value: "lamb" },
    ],
  },
  {
    label: "Drinks",
    options: [{ label: "Juice", value: "juice" }],
  },
];

const categoryLabels = () =>
  screen
    .getAllByLabelText("Category label")
    .map((el) => (el as HTMLInputElement).value);
const higherRiskBoxes = () =>
  screen.getAllByRole("checkbox", { name: /higher-risk/i });
const category = (label: string) => {
  const row = screen.getByDisplayValue(label).closest("fieldset");
  if (!row) throw new Error(`no category row for "${label}"`);
  return within(row);
};

function renderEditor(
  value: OptionGroup[],
  isOverridden: boolean,
  onChange = vi.fn(),
) {
  render(
    <OptionGroupsEditor
      value={value}
      defaultValue={[]}
      isOverridden={isOverridden}
      onChange={onChange}
    />,
  );
  return onChange;
}

it("renders one row per category with its label, Higher-risk flag and options", () => {
  renderEditor(groups, true);
  expect(categoryLabels()).toEqual(["Meat and poultry", "Drinks"]);
  expect(higherRiskBoxes()[0]).toBeChecked();
  expect(higherRiskBoxes()[1]).not.toBeChecked();
  const values = (row: ReturnType<typeof category>, label: string) =>
    row.getAllByLabelText(label).map((el) => (el as HTMLInputElement).value);
  expect(values(category("Meat and poultry"), "Option label")).toEqual([
    "Chicken",
    "Lamb",
  ]);
  expect(values(category("Drinks"), "Option value")).toEqual(["juice"]);
});

it("adds an empty category", async () => {
  const onChange = renderEditor(groups, true);
  await userEvent.click(screen.getByRole("button", { name: "Add category" }));
  expect(onChange).toHaveBeenLastCalledWith([
    ...groups,
    { label: "", options: [] },
  ]);
});

it("renames a category", async () => {
  const onChange = renderEditor(groups, true);
  await userEvent.type(screen.getByDisplayValue("Drinks"), "!");
  expect(onChange).toHaveBeenLastCalledWith([
    groups[0],
    { ...groups[1], label: "Drinks!" },
  ]);
});

it("sets and clears Higher-risk, dropping the key rather than writing false", async () => {
  const onChange = renderEditor(groups, true);
  await userEvent.click(higherRiskBoxes()[1]);
  expect(onChange).toHaveBeenLastCalledWith([
    groups[0],
    { ...groups[1], higherRisk: true },
  ]);
  await userEvent.click(higherRiskBoxes()[0]);
  expect(onChange).toHaveBeenLastCalledWith([
    { label: "Meat and poultry", options: groups[0].options },
    groups[1],
  ]);
});

it("reorders categories with the move buttons and removes one", async () => {
  const onChange = renderEditor(groups, true);
  await userEvent.click(
    category("Drinks").getByRole("button", { name: "Move category up" }),
  );
  expect(onChange).toHaveBeenLastCalledWith([groups[1], groups[0]]);
  expect(
    category("Meat and poultry").getByRole("button", {
      name: "Move category up",
    }),
  ).toBeDisabled();
  await userEvent.click(
    category("Drinks").getByRole("button", { name: "Remove category" }),
  );
  expect(onChange).toHaveBeenLastCalledWith([groups[0]]);
});

it("edits a category's options through the nested options editor", async () => {
  const onChange = renderEditor(groups, true);
  await userEvent.click(
    category("Drinks").getByRole("button", { name: "Add option" }),
  );
  expect(onChange).toHaveBeenLastCalledWith([
    groups[0],
    { ...groups[1], options: [...groups[1].options, { label: "", value: "" }] },
  ]);
  // The nested editor edits this category's list; it never offers a reset.
  expect(
    category("Drinks").queryByRole("button", { name: /reset to defaults/i }),
  ).not.toBeInTheDocument();
});

it("offers Reset to defaults only when overridden, and it drops the override", async () => {
  const onChange = renderEditor(groups, true);
  await userEvent.click(
    screen.getByRole("button", { name: /reset to defaults/i }),
  );
  expect(onChange).toHaveBeenLastCalledWith(undefined);
});

it("shows the base categories and no Reset when not overridden", () => {
  render(
    <OptionGroupsEditor
      value={[]}
      defaultValue={groups}
      isOverridden={false}
      onChange={vi.fn()}
    />,
  );
  expect(categoryLabels()).toEqual(["Meat and poultry", "Drinks"]);
  expect(
    screen.queryByRole("button", { name: /reset to defaults/i }),
  ).not.toBeInTheDocument();
});
