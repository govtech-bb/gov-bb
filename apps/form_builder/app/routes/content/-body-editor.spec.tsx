/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

  it.each([["notice", "Notice"] as const, ["details", "Show / hide"] as const])(
    "keeps HTML-like %s input inert while editing",
    async (_kind, choice) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const payload = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
      render(
        <BodyEditor
          id="body"
          ariaLabel="Page body"
          value=""
          onChange={onChange}
          profile={{ kind: "landing-page", startLinkType: "none" }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Insert" }));
      await user.click(
        screen.getByRole("menuitem", { name: new RegExp(choice, "i") }),
      );
      fireEvent.change(await screen.findByLabelText(/^Content/), {
        target: { value: payload },
      });

      expect(document.querySelector("img")).toBeNull();
      expect(document.querySelector("script")).toBeNull();
      await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith(
          expect.stringContaining(payload),
        ),
      );
    },
  );

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
