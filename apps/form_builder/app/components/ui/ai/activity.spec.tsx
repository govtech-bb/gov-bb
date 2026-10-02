// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CodeBlock } from "./code-block";
import { StreamingText } from "./streaming-text";
import { ThinkingState } from "./thinking-state";
import { ToolChips } from "./tool-chips";
import { TaskRows } from "./task-rows";

it("copies the proposed code and reports a clipboard failure without losing the code", async () => {
  const writeText = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Denied"));
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  render(<CodeBlock code="new value" before="old value" filename="title" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy title" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Copied");
  expect(writeText).toHaveBeenCalledWith("new value");
  fireEvent.click(screen.getByRole("button", { name: "Copy title" }));
  expect(
    await screen.findByText("Copy failed. Select the text to copy it."),
  ).toBeVisible();
  expect(screen.getByText("new value")).toBeVisible();
  expect(screen.getByText("old value")).toBeVisible();
});

it("renders streaming Markdown immediately, retains safe links, and removes the cursor when finished", async () => {
  const content =
    '## Draft\n\nRead [guidance](https://example.com) and [unsafe](javascript:alert).\n\n<img src=x onerror=alert(1)>\n\n```json\n{"title": "Draft"}\n```';
  const view = render(<StreamingText content={content} streaming />);
  expect(screen.getByRole("heading", { name: "Draft" })).toBeVisible();
  expect(screen.getByRole("link", { name: "guidance" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  expect(
    screen.queryByRole("link", { name: "unsafe" }),
  ).not.toBeInTheDocument();
  expect(view.container.querySelector("img")).toBeNull();
  expect(
    await screen.findByRole("button", { name: "Copy json" }),
  ).toBeVisible();
  expect(
    view.container.querySelector("[data-streaming-cursor]"),
  ).not.toBeNull();
  view.rerender(<StreamingText content={content} />);
  expect(view.container.querySelector("[data-streaming-cursor]")).toBeNull();
  expect(screen.getByRole("heading", { name: "Draft" })).toBeVisible();
});

it("collapses completed thinking automatically while preserving a manual choice", () => {
  const view = render(
    <ThinkingState working done="Checked the draft">
      <span>Activity detail</span>
    </ThinkingState>,
  );
  expect(
    screen.getByRole("button", { name: /Working on your draft/ }),
  ).toHaveAttribute("aria-expanded", "true");
  view.rerender(
    <ThinkingState working={false} done="Checked the draft">
      <span>Activity detail</span>
    </ThinkingState>,
  );
  const trigger = screen.getByRole("button", { name: "Checked the draft" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  view.rerender(
    <ThinkingState working done="Checked the draft">
      <span>Activity detail</span>
    </ThinkingState>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Working on your draft/ }),
  );
  view.rerender(
    <ThinkingState working={false} done="Checked the draft">
      <span>Activity detail</span>
    </ThinkingState>,
  );
  expect(
    screen.getByRole("button", { name: "Checked the draft" }),
  ).toHaveAttribute("aria-expanded", "false");
});

it("keeps tool payloads redacted behind disclosure and task retries actionable", async () => {
  const retry = vi.fn();
  render(
    <>
      <ToolChips
        steps={[
          {
            id: "read",
            label: "Read document",
            chip: "form.pdf",
            status: "done",
            input: { token: "private-token", title: "Public title" },
          },
        ]}
      />
      <TaskRows
        rows={[
          {
            id: "extract",
            label: "Extract text",
            status: "error",
            detail: "Document extraction failed.",
            onRetry: retry,
          },
        ]}
      />
    </>,
  );
  expect(screen.queryByText(/Public title/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Read document/ }));
  expect(await screen.findByText(/Public title/)).toBeVisible();
  expect(screen.queryByText(/private-token/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Extract text/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry extract text" }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});
