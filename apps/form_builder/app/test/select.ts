import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

export async function openSelect(trigger: HTMLElement) {
  if (trigger.getAttribute("aria-expanded") !== "true") {
    if (screen.queryByRole("listbox")) {
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
      );
    }
    await userEvent.click(trigger);
  }
  return screen.findByRole("listbox");
}

export async function chooseOption(
  trigger: HTMLElement,
  name: string | RegExp,
) {
  const listbox = await openSelect(trigger);
  await userEvent.click(within(listbox).getByRole("option", { name }));
  await waitFor(() =>
    expect(trigger).toHaveAttribute("aria-expanded", "false"),
  );
}
