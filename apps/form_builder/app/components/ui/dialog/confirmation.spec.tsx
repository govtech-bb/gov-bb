// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { ConfirmationProvider, useConfirmation } from "./confirmation";
import { Button } from "../button";

it("keeps the draft on cancel or Escape, restores focus, and removes it only after confirmation", async () => {
  function Draft() {
    const confirm = useConfirmation();
    const [removed, setRemoved] = useState(false);
    return (
      <>
        <span>{removed ? "Draft removed" : "Saved draft"}</span>
        <Button
          onClick={async () => {
            if (
              await confirm({
                title: "Remove draft?",
                description: "Your saved draft will be removed.",
                confirmLabel: "Remove",
                destructive: true,
              })
            )
              setRemoved(true);
          }}
        >
          Remove draft
        </Button>
      </>
    );
  }
  const user = userEvent.setup();
  render(
    <ConfirmationProvider>
      <Draft />
    </ConfirmationProvider>,
  );
  const trigger = screen.getByRole("button", { name: "Remove draft" });
  await user.click(trigger);
  const dialog = await screen.findByRole("alertdialog", {
    name: "Remove draft?",
  });
  expect(dialog).toHaveAccessibleDescription(
    "Your saved draft will be removed.",
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByText("Saved draft")).toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  await screen.findByRole("alertdialog");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByText("Saved draft")).toBeInTheDocument();
  await user.click(trigger);
  await user.click(await screen.findByRole("button", { name: "Remove" }));
  expect(await screen.findByText("Draft removed")).toBeInTheDocument();
});
