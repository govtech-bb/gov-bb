/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyValueEditor } from "./-key-value-editor";

it("renders a row per existing entry", () => {
  render(
    <KeyValueEditor value={{ sheetId: "abc", tab: "Sheet1" }} onChange={() => {}} />,
  );
  expect(screen.getByDisplayValue("sheetId")).toBeInTheDocument();
  expect(screen.getByDisplayValue("abc")).toBeInTheDocument();
  expect(screen.getByDisplayValue("tab")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Sheet1")).toBeInTheDocument();
});

it("emits the updated record when a value changes", async () => {
  const onChange = vi.fn();
  render(<KeyValueEditor value={{ sheetId: "abc" }} onChange={onChange} />);
  const valueInput = screen.getByDisplayValue("abc");
  await userEvent.clear(valueInput);
  await userEvent.type(valueInput, "xyz");
  expect(onChange).toHaveBeenLastCalledWith({ sheetId: "xyz" });
});

it("adds a new key/value row", async () => {
  const onChange = vi.fn();
  render(<KeyValueEditor value={{}} onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: /add/i }));
  const keyInput = screen.getByPlaceholderText(/key/i);
  const valueInput = screen.getByPlaceholderText(/value/i);
  await userEvent.type(keyInput, "newKey");
  await userEvent.type(valueInput, "newVal");
  expect(onChange).toHaveBeenLastCalledWith({ newKey: "newVal" });
});

it("removes a row and emits the remaining record", async () => {
  const onChange = vi.fn();
  render(<KeyValueEditor value={{ a: "1", b: "2" }} onChange={onChange} />);
  const removeButtons = screen.getAllByRole("button", { name: /remove/i });
  await userEvent.click(removeButtons[0]);
  expect(onChange).toHaveBeenLastCalledWith({ b: "2" });
});

it("skips rows with a blank key when assembling the record", async () => {
  const onChange = vi.fn();
  render(<KeyValueEditor value={{ a: "1" }} onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: /add/i }));
  // a blank row exists but contributes nothing until it gets a key
  const valueInputs = screen.getAllByPlaceholderText(/value/i);
  await userEvent.type(valueInputs[valueInputs.length - 1], "orphan");
  expect(onChange).toHaveBeenLastCalledWith({ a: "1" });
});
