// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef, useState } from "react";
import userEvent from "@testing-library/user-event";
import { AppliedCard } from "./applied-card";
import { PermissionMenu } from "./permission-menu";
import { ApprovalCard } from "./approval-card";
import { PromptBar } from "./prompt-bar";
import { diffLines } from "./code-block";
import { SelectionActions } from "./selection-actions";
import { AttachmentCard } from "./attachments";
import { attachmentMetadata, attachmentPart } from "./attachment-data";
import {
  readConversations,
  restoreTranscript,
  writeConversations,
  type Permission,
} from "./history";

const pdfMock = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: pdfMock.getDocument,
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/pdf.worker.mjs",
}));

it("keeps custom and multiple-choice answers when navigating, and submits the final answer once", async () => {
  const submit = vi.fn(async () => {});
  render(
    <ApprovalCard
      questions={[
        {
          question: "Who is this form for?",
          type: "radio",
          options: ["Residents", "Businesses"],
        },
        {
          question: "What should it collect?",
          type: "check",
          options: ["Email", "Phone"],
        },
      ]}
      onSubmit={submit}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Businesses" }));
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Continue"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Email" }));
  fireEvent.change(screen.getByLabelText("Custom answer"), {
    target: { value: "Registration number" },
  });
  fireEvent.click(screen.getByLabelText("Previous question"));
  expect(screen.getByRole("radio", { name: "Businesses" })).toBeChecked();
  fireEvent.click(screen.getByLabelText("Next question"));
  fireEvent.click(screen.getByText("Send answers"));
  fireEvent.click(screen.getByText("Sending…"));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(submit).toHaveBeenCalledWith({
    status: "answered",
    answers: [
      {
        question: "Who is this form for?",
        choices: ["Businesses"],
        custom: "",
      },
      {
        question: "What should it collect?",
        choices: ["Email"],
        custom: "Registration number",
      },
    ],
  });
});

it("skips without inventing an answer and allows retry after submission fails", async () => {
  const submit = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(undefined);
  render(
    <ApprovalCard
      questions={[
        {
          question: "Choose a service",
          type: "radio",
          options: ["One", "Two"],
        },
      ]}
      onSubmit={submit}
    />,
  );
  fireEvent.click(screen.getByText("Skip all questions"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Skip all questions"));
  await screen.findByText("Response sent");
  expect(submit).toHaveBeenLastCalledWith({ status: "skipped", answers: [] });
});

it("inserts keyboard-selected commands without sending, and accepts a pasted file", () => {
  const send = vi.fn(),
    attach = vi.fn();
  function Composer() {
    const [value, setValue] = useState("");
    return (
      <PromptBar
        value={value}
        onChange={setValue}
        permission="ask"
        onPermissionChange={() => {}}
        kind="form"
        busy={false}
        pending={false}
        onClearSelection={() => {}}
        onSend={send}
        onStop={() => {}}
        onAttach={attach}
        onAttachmentError={() => {}}
      />
    );
  }
  render(<Composer />);
  const input = screen.getByLabelText("Message the assistant");
  fireEvent.change(input, { target: { value: "/simpl" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveValue(
    "Make the wording easier to understand, preserving all facts and requirements. ",
  );
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(send).toHaveBeenCalledTimes(1);
  const file = new File(["image"], "scan.png", { type: "image/png" });
  fireEvent.paste(input, { clipboardData: { files: [file] } });
  expect(attach).toHaveBeenCalledWith(file);
});

it("selects the edit permission with radio semantics and closes after choosing", async () => {
  const user = userEvent.setup();
  function Menu() {
    const [permission, setPermission] = useState<Permission>("ask");
    return <PermissionMenu value={permission} onValueChange={setPermission} />;
  }
  render(<Menu />);
  await user.click(screen.getByRole("button", { name: "Edit behavior: Ask" }));
  expect(
    await screen.findByRole("menuitemradio", { name: /Ask before editing/ }),
  ).toHaveAttribute("aria-checked", "true");
  await user.click(
    await screen.findByRole("menuitemradio", { name: /Automatically edit/ }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Edit behavior: Auto" }));
  expect(
    await screen.findByRole("menuitemradio", { name: /Automatically edit/ }),
  ).toHaveAttribute("aria-checked", "true");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Edit behavior: Auto" }),
    ).toHaveFocus(),
  );
});

it("shows a disabled Ask permission and question prompt in a read-only composer", () => {
  render(
    <PromptBar
      value=""
      onChange={() => {}}
      permission="auto"
      onPermissionChange={() => {}}
      kind="form"
      readOnly
      busy={false}
      pending={false}
      onClearSelection={() => {}}
      onSend={() => {}}
      onStop={() => {}}
      onAttach={() => {}}
      onAttachmentError={() => {}}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Edit behavior: Ask" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("textbox", { name: "Message the assistant" }),
  ).toHaveAttribute("placeholder", "Ask a question…");
});

it("keeps an applied card stable across validation and reveals its warnings and diff", async () => {
  const summary = "Clarify the service title";
  const view = render(<AppliedCard summary={summary} state="validating" />);
  const trigger = screen.getByRole("button", {
    name: "Checking the proposed draft…",
  });
  view.rerender(
    <AppliedCard
      summary={summary}
      state="applied"
      change={{
        before: { title: "Old title" },
        after: { title: "New title" },
        warnings: ["Check the linked form"],
      }}
      message="Saved to the draft."
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Applied to draft · 1 section changed",
  );
  expect(screen.getByText("1 warning")).toBeVisible();
  expect(screen.getByRole("button", { name: /Applied to draft/ })).toBe(
    trigger,
  );
  expect(screen.queryByText(summary)).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(await screen.findByText(summary)).toBeVisible();
  expect(screen.getByText("Check the linked form")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "title" }));
  expect(await screen.findByText("Old title", { exact: false })).toBeVisible();
  expect(screen.getByText("New title", { exact: false })).toBeVisible();
  expect(screen.getByText("Saved to the draft.")).toBeVisible();
});

it("persists permission per conversation and normalizes missing or unknown permissions to Ask", () => {
  const key = "permission-test";
  writeConversations(key, [
    { id: "one", title: "First", permission: "auto" },
    { id: "two", title: "Second" },
  ]);
  expect(readConversations(key)).toEqual([
    { id: "one", title: "First", permission: "auto" },
    { id: "two", title: "Second", permission: "ask" },
  ]);
  localStorage.setItem(
    key,
    JSON.stringify([{ id: "legacy", title: "Earlier", permission: "edit" }]),
  );
  expect(readConversations(key)).toEqual([
    { id: "legacy", title: "Earlier", permission: "ask" },
  ]);
  localStorage.removeItem(key);
});

it("reconstructs both versions from the diff for additions, removals, and unchanged text", () => {
  for (const [before, after] of [
    ["", "new"],
    ["old", ""],
    ["same", "same"],
    ["a\nb\nc", "a\nx\ny\nc"],
    ["a\n", "a\nb\n"],
  ]) {
    const lines = diffLines(before, after);
    expect(
      lines
        .filter((line) => line.kind !== "add")
        .map((line) => line.text)
        .join("\n"),
    ).toBe(before);
    expect(
      lines
        .filter((line) => line.kind !== "remove")
        .map((line) => line.text)
        .join("\n"),
    ).toBe(after);
  }
});

it("hands real selected Markdown to the assistant without modifying the editor", () => {
  const action = vi.fn();
  function Editor() {
    const ref = useRef<HTMLDivElement>(null);
    return (
      <div ref={ref}>
        <textarea aria-label="Body" defaultValue="Clear selected words here." />
        <SelectionActions
          target={ref}
          value="Clear selected words here."
          onAction={action}
        />
      </div>
    );
  }
  render(<Editor />);
  const input = screen.getByLabelText("Body") as HTMLTextAreaElement;
  input.focus();
  input.setSelectionRange(6, 20);
  fireEvent.select(input);
  fireEvent.click(screen.getByRole("button", { name: "Show more actions" }));
  fireEvent.click(screen.getByText("Shorten"));
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({
      selection: "selected words",
      prompt: expect.stringContaining("Shorten"),
    }),
  );
  expect(input.value).toBe("Clear selected words here.");
});

it("keeps typed attachment parts on restore and revokes image preview URLs", async () => {
  const create = vi.fn((_blob: Blob) => "blob:preview"),
    revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    value: create,
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: revoke,
    configurable: true,
  });
  const metadata = {
    id: "file",
    name: "scan.png",
    type: "image/png" as const,
    size: 12,
  };
  const part = attachmentPart(
    metadata,
    "https://private-bucket.example/scan.png",
  );
  const restored = restoreTranscript([
    {
      id: "message",
      role: "user",
      parts: [{ type: "text", content: "Read this" }, part],
    },
  ]);
  expect(restored[0].parts[1]).toEqual(part);
  expect(attachmentMetadata(part)).toEqual(metadata);
  const file = new File(["image"], metadata.name, { type: metadata.type });
  const view = render(<AttachmentCard attachment={metadata} file={file} />);
  await screen.findByAltText("Preview of scan.png");
  expect(create.mock.calls[0][0]).not.toBe(file);
  expect(create.mock.calls[0][0].type).toBe("image/png");
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:preview");
});

it("detects a whole-block selection anchored on the editable element", () => {
  const action = vi.fn();
  function Editor() {
    const ref = useRef<HTMLDivElement>(null);
    return (
      <div ref={ref}>
        <div
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Visual body"
        >
          A complete paragraph.
        </div>
        <SelectionActions
          target={ref}
          value="A complete paragraph."
          onAction={action}
        />
      </div>
    );
  }
  render(<Editor />);
  const input = screen.getByLabelText("Visual body");
  act(() => {
    const range = document.createRange();
    range.selectNodeContents(input);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  fireEvent.click(screen.getByText("Improve"));
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({ selection: "A complete paragraph." }),
  );
});

it("shares the rendered PDF image while releasing each thumbnail's blob URL", async () => {
  const create = vi
    .fn()
    .mockReturnValueOnce("blob:first")
    .mockReturnValueOnce("blob:second");
  const revoke = vi.fn();
  Object.defineProperties(URL, {
    createObjectURL: { value: create, configurable: true },
    revokeObjectURL: { value: revoke, configurable: true },
  });
  const png = new Blob(["rendered pixels"], { type: "image/png" });
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback) => callback(png));
  const destroy = vi.fn(async () => {});
  pdfMock.getDocument.mockReturnValue({
    promise: Promise.resolve({
      getPage: async () => ({
        getViewport: () => ({ width: 100, height: 160 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
    destroy,
  });
  const file = new File(["pdf bytes"], "form.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(8),
  });
  const metadata = {
    id: "pdf",
    name: file.name,
    type: "application/pdf" as const,
    size: file.size,
  };
  const view = render(
    <>
      <AttachmentCard attachment={metadata} file={file} />
      <AttachmentCard attachment={metadata} file={file} />
    </>,
  );
  try {
    const previews = await screen.findAllByAltText("Preview of form.pdf");
    expect(previews.map((preview) => preview.getAttribute("src"))).toEqual([
      "blob:first",
      "blob:second",
    ]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(png);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(pdfMock.getDocument).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    toBlob.mockRestore();
  }
  expect(revoke.mock.calls).toEqual([["blob:first"], ["blob:second"]]);
});
