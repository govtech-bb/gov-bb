// @vitest-environment jsdom
import { expect } from "vitest";
import type { ComponentType } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "./dev.assistant";

vi.mock("../components/services/service-state", () => ({
  useServiceIndex: () => ({ entries: [] }),
}));

// The demo streams and prepares on real timers; a loaded CI runner needs the
// headroom (#3404).

it("lets a visitor review a sample edit, auto-apply a warning, and expand the preview", async () => {
  localStorage.clear();
  vi.stubEnv("NODE_ENV", "development");
  const Demo = Route.options.component as ComponentType;
  const user = userEvent.setup();
  const view = render(<Demo />);
  try {
    await user.click(screen.getByRole("button", { name: "Simplify the page" }));
    const composer = await screen.findByRole("textbox", {
      name: "Message the assistant",
    });
    await waitFor(() =>
      expect(composer).toHaveValue("Make this page easier to understand"),
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    const approve = await screen.findByRole(
      "button",
      {
        name: "Apply to draft",
      },
      { timeout: 10000 },
    );
    await waitFor(() => expect(approve).not.toBeDisabled(), { timeout: 10000 });
    expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue(
      "Apply for a library card",
    );
    await user.click(approve);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue(
        "Get a library card",
      ),
    );
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Edit behavior: Ask" }),
        ).not.toBeDisabled(),
      { timeout: 10000 },
    );
    await user.click(
      screen.getByRole("button", { name: "Edit behavior: Ask" }),
    );
    await user.click(
      await screen.findByRole("menuitemradio", { name: /Automatically edit/ }),
    );
    await user.click(screen.getByRole("button", { name: "Try a warning" }));
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(
      () =>
        expect(
          (
            screen.getByRole("textbox", {
              name: "Page content",
            }) as HTMLTextAreaElement
          ).value,
        ).toContain("[Confirm the opening hours]"),
      { timeout: 10000 },
    );
    expect(screen.getByText("2 changes applied")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand assistant" }));
    expect(
      screen.getByRole("combobox", { name: "Conversation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Preview and changes" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Open preview" }));
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTitle("Service journey preview")).toHaveAttribute(
      "src",
      expect.stringContaining("preview-start-page"),
    );
  } finally {
    view.unmount();
    vi.unstubAllEnvs();
  }
}, 30000);

it("answers the scripted questions and retries a failed task example", async () => {
  localStorage.clear();
  vi.stubEnv("NODE_ENV", "development");
  const Demo = Route.options.component as ComponentType;
  const user = userEvent.setup();
  const view = render(<Demo />);
  try {
    await user.click(screen.getByRole("button", { name: "Ask me questions" }));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Message the assistant" }),
      ).toHaveValue("Ask me questions about this page"),
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    const choice = await screen.findByRole("radio", {
      name: "First-time library visitors",
    });
    await waitFor(() => expect(choice).not.toBeDisabled());
    await user.click(choice);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("checkbox", { name: "Plain language" }));
    await user.click(screen.getByRole("checkbox", { name: "What to bring" }));
    await user.click(screen.getByRole("button", { name: "Send answers" }));
    await screen.findByText(/I’ll use your answers to help improve this page/);
    expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue(
      "Apply for a library card",
    );
    expect(
      screen.queryByRole("button", { name: "Apply to draft" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Component examples"));
    await user.click(screen.getByRole("button", { name: "Run tasks" }));
    const failed = await screen.findByRole(
      "button",
      { name: /Check sample details.*Failed/ },
      { timeout: 10000 },
    );
    await user.click(failed);
    await user.click(
      screen.getByRole("button", { name: "Retry check sample details" }),
    );
    await screen.findByText(
      "The retry completed successfully.",
      {},
      { timeout: 10000 },
    );
  } finally {
    view.unmount();
    vi.unstubAllEnvs();
  }
}, 30000);
