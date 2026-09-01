/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BodyEditor } from "./-body-editor";

describe("BodyEditor", () => {
  it("does not emit or normalize content on mount or tab changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BodyEditor
        id="body"
        ariaLabel="Page body"
        value={"## Heading\n\nA paragraph."}
        onChange={onChange}
        profile={{ kind: "landing-page", startLinkType: "form" }}
      />,
    );

    await act(async () => undefined);
    expect(onChange).not.toHaveBeenCalled();
    const markdownTab = screen.getByRole("tab", { name: "Markdown" });
    await user.click(markdownTab);
    expect(screen.getByRole("textbox", { name: "Page body" })).toHaveValue(
      "## Heading\n\nA paragraph.",
    );
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Visual" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps unsupported specialist content safely in Markdown mode", () => {
    render(
      <BodyEditor
        id="body"
        ariaLabel="Page body"
        value={"<muted>Specialist source</muted>"}
        onChange={vi.fn()}
        profile={{ kind: "landing-page", startLinkType: "none" }}
      />,
    );

    expect(screen.getByRole("tab", { name: "Visual" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Markdown" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByText(/Markdown mode is required for this content/i),
    ).toBeInTheDocument();
  });

  it("offers landing components and serializes an inserted notice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BodyEditor
        id="body"
        ariaLabel="Page body"
        value=""
        onChange={onChange}
        profile={{ kind: "landing-page", startLinkType: "form" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Insert" }));
    expect(screen.getByRole("menuitem", { name: /Notice/i })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: /Action group/i }),
    ).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    await user.click(screen.getByRole("menuitem", { name: /Notice/i }));

    expect(
      await screen.findByRole("region", { name: "notice component" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        ":::notice\nAdd important information.\n:::",
      ),
    );
  });

  it("does not expose landing components in form content", () => {
    render(
      <BodyEditor
        id="step-body"
        ariaLabel="Step content"
        value=""
        onChange={vi.fn()}
        profile={{ kind: "form-content" }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Insert" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Start button/i }),
    ).not.toBeInTheDocument();
  });
});
