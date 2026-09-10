// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormCombobox } from "./form-combobox";
import { HeaderMenu } from "./header-menu";
import { DeleteModal } from "./modals";

it("finds forms by title or ID and clears a selected link", async () => {
  function Picker() {
    const [value, setValue] = useState("");
    return (
      <FormCombobox
        forms={[
          {
            id: "one",
            formId: "passport",
            title: "Passport application",
            version: "1",
            isPublished: true,
          },
          {
            id: "two",
            formId: "birth-certificate",
            title: "Birth record",
            version: "1",
            isPublished: false,
          },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  }
  const user = userEvent.setup();
  render(<Picker />);
  const trigger = screen.getByRole("combobox", { name: "Form to link" });
  await user.click(trigger);
  await user.type(
    await screen.findByRole("combobox", { name: "Search forms" }),
    "birth-certificate",
  );
  await user.click(await screen.findByRole("option", { name: /Birth record/ }));
  expect(trigger).toHaveTextContent("Birth record");
  await user.click(trigger);
  await user.click(
    await screen.findByRole("option", { name: "No linked form" }),
  );
  expect(trigger).toHaveTextContent("No linked form");
});

it("runs a header-menu action and restores the trigger focus", async () => {
  const action = vi.fn();
  const user = userEvent.setup();
  render(<HeaderMenu items={[{ label: "Hide preview", onSelect: action }]} />);
  const trigger = screen.getByRole("button", { name: "More actions" });
  await user.click(trigger);
  await user.click(
    await screen.findByRole("menuitem", { name: "Hide preview" }),
  );
  expect(action).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("keeps an in-flight removal dialog open and allows Escape after it finishes", async () => {
  const close = vi.fn(),
    remove = vi.fn();
  const user = userEvent.setup();
  const props = {
    onClose: close,
    onDelete: remove,
    editPath: "apps/landing/content/test.md",
    error: null,
  };
  const view = render(<DeleteModal open {...props} isDeleting />);
  await screen.findByRole("dialog", { name: "Remove page" });
  await user.keyboard("{Escape}");
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
  view.rerender(<DeleteModal open {...props} isDeleting={false} />);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
