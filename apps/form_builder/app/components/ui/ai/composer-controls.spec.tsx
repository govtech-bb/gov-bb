// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { PromptBar } from "./prompt-bar";
import { SelectionActions } from "./selection-actions";

describe("assistant composer controls", () => {
  it("keeps Auto visible while busy and enforces Ask for a read-only composer", () => {
    const props = {
      value: "",
      onChange: vi.fn(),
      permission: "auto" as const,
      onPermissionChange: vi.fn(),
      kind: "form" as const,
      busy: true,
      pending: false,
      onClearSelection: vi.fn(),
      onSend: vi.fn(),
      onStop: vi.fn(),
      onAttach: vi.fn(),
      onAttachmentError: vi.fn(),
    };
    const view = render(<PromptBar {...props} />);
    expect(
      screen.getByRole("button", { name: "Edit behavior: Auto" }),
    ).toBeDisabled();
    view.rerender(<PromptBar {...props} readOnly />);
    expect(
      screen.getByRole("button", { name: "Edit behavior: Ask" }),
    ).toBeDisabled();
  });

  it("reveals extra selection actions, preserves selected text while typing, and dismisses on Escape", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    function Editor({ value }: { value: string }) {
      const target = useRef<HTMLDivElement>(null);
      return (
        <div ref={target}>
          <textarea aria-label="Body" defaultValue={value} />
          <SelectionActions target={target} value={value} onAction={action} />
        </div>
      );
    }
    const view = render(<Editor value="Clear selected words here." />);
    const body = screen.getByLabelText("Body") as HTMLTextAreaElement;
    const select = () => {
      body.focus();
      body.setSelectionRange(6, 20);
      fireEvent.select(body);
    };
    select();
    expect(
      screen.queryByRole("button", { name: "Shorten" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more actions" }));
    expect(
      screen.getByRole("button", { name: "Show fewer actions" }),
    ).toHaveAttribute("aria-expanded", "true");
    await user.type(
      screen.getByLabelText("Describe edits to selected text"),
      "Make this clearer",
    );
    await user.click(
      screen.getByRole("button", { name: "Use edit instruction" }),
    );
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: "selected words",
        prompt: "Make this clearer",
      }),
    );
    expect(body.value).toBe("Clear selected words here.");
    select();
    await user.click(screen.getByRole("button", { name: "Show more actions" }));
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("button", { name: "Improve" }),
    ).not.toBeInTheDocument();
    select();
    view.rerender(<Editor value="The draft has changed." />);
    expect(
      screen.queryByRole("button", { name: "Improve" }),
    ).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
  });
});
