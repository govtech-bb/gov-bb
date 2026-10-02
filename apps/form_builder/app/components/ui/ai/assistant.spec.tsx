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
import { getCatalog, type RecipeDraft } from "@govtech-bb/form-builder";
import { Assistant } from "./assistant";
import { useState } from "react";
import {
  GlobalAssistantProvider,
  useGlobalAssistant,
  WorkspaceAssistant,
} from "../../global-assistant";
import { prepareFormDraft } from "../../builder/form-assistant";
import { restoreTranscript, historyKey } from "./history";
import type { PreparedChange } from "./review";
import { readConversations, writeConversations } from "./history";
import { streamChat } from "./transport";
import { prepareServiceEdit } from "./service-tools";
import userEvent from "@testing-library/user-event";

vi.mock("./service-tools", () => ({
  prepareServiceEdit: vi.fn(),
  readService: vi.fn(),
  readPage: vi.fn(),
  readForm: vi.fn(),
}));
vi.mock("../../services/service-state", () => ({
  useServiceIndex: () => ({ entries: [] }),
}));

const harness = vi.hoisted(() => ({
  options: null as any,
  interrupts: [] as any[],
  messages: [] as any[],
  addToolResult: vi.fn(async () => {}),
  stop: vi.fn(),
  calls: 0,
}));
vi.mock("@tanstack/ai-react", () => ({
  useChat: (options: any) => {
    harness.options = options;
    return {
      messages: harness.messages,
      interrupts: harness.interrupts,
      addToolResult: harness.addToolResult,
      isLoading: false,
      resuming: false,
      stop: harness.stop,
      sendMessage: vi.fn(),
      reload: vi.fn(),
    };
  },
}));
vi.mock("./transport", () => ({
  streamChat: vi.fn(async () => new Response()),
  uploadDocument: vi.fn(),
  readDocument: vi.fn(),
}));

beforeEach(() => {
  harness.interrupts = [];
  harness.messages = [];
  harness.addToolResult.mockClear();
  harness.options = null;
  harness.stop.mockClear();
  vi.mocked(prepareServiceEdit).mockReset();
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

const props = {
  user: "alice",
  documentId: "one",
  kind: "form" as const,
  document: { title: "Current" },
  revisionSource: { title: "Current" },
};
const proposal = {
  summary: "Rename this form",
  recipe: { formId: "test", title: "Proposed", steps: [] },
};

async function propose() {
  await act(async () => {
    await harness.options.fetcher(
      { messages: [], threadId: "t", runId: "r" },
      { signal: new AbortController().signal },
    );
    harness.options.onChunk({ type: "TOOL_CALL_START", toolCallId: "call" });
  });
  const resolveInterrupt = vi.fn();
  harness.interrupts = [
    {
      kind: "tool-approval",
      id: "approval",
      toolCallId: "call",
      toolName: "apply_form_draft",
      originalArgs: proposal,
      canResolve: true,
      status: "pending",
      resolveInterrupt,
    },
  ];
  return resolveInterrupt;
}

it("requires a review and explicit approval before a client tool can change the draft", async () => {
  const apply = vi.fn();
  const prepare = vi.fn(
    async (): Promise<PreparedChange> => ({
      before: { title: "Current" },
      after: { title: "Proposed" },
      warnings: ["Unknown component: repair before saving"],
      apply,
    }),
  );
  const view = render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  const resolve = await propose();
  await act(async () => {
    view.rerender(<Assistant {...props} prepare={prepare} />);
  });
  const button = screen.getByRole("button", {
    name: "Apply with warnings",
  });
  expect(button).not.toBeDisabled();
  expect(apply).not.toHaveBeenCalled();
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
  fireEvent.click(button);
  expect(resolve).toHaveBeenCalledWith(true);
  expect(apply).not.toHaveBeenCalled();
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(true);
  expect(apply).toHaveBeenCalledTimes(1);
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
});

it("rechecks the current draft after async validation and after approval", async () => {
  let complete!: (value: PreparedChange) => void;
  const apply = vi.fn();
  const prepare = () =>
    new Promise<PreparedChange>((resolve) => {
      complete = resolve;
    });
  const view = render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  await propose();
  view.rerender(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(typeof complete).toBe("function"));
  view.rerender(
    <Assistant
      {...props}
      revisionSource={{ title: "Manual edit" }}
      prepare={prepare}
    />,
  );
  await act(async () =>
    complete({ before: {}, after: { title: "Proposed" }, warnings: [], apply }),
  );
  expect(screen.getByRole("button", { name: "Apply to draft" })).toBeDisabled();
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});

it("disables proposals when the editing claim becomes read-only", async () => {
  const apply = vi.fn();
  const prepare = async () => ({
    before: {},
    after: { title: "Proposed" },
    warnings: [],
    apply,
  });
  const view = render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  await propose();
  view.rerender(<Assistant {...props} prepare={prepare} />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Apply to draft" }),
    ).not.toBeDisabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply to draft" }));
  view.rerender(<Assistant {...props} readOnly prepare={prepare} />);
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});

it("keeps DB settings, credentials and opaque metadata while normalizing the reviewed draft", () => {
  const draft = {
    formId: "fixed",
    title: "Old",
    mdaContactId: "mda",
    meta: { visibility: "draft", opaque: "keep" },
    catchmentRouting: { marker: "keep" },
    processors: [
      { id: "p", type: "payment", config: { secret: "keep-secret" } },
    ],
    steps: [
      {
        stepId: "one",
        title: "One",
        fields: [],
        behaviours: [],
        nextSteps: [{ title: "Keep" }],
      },
    ],
  } as unknown as RecipeDraft;
  const result = prepareFormDraft(
    draft,
    {
      formId: "changed",
      title: "New",
      steps: [{ stepId: "one", title: "Changed", elements: [] }],
      processors: [],
    },
    getCatalog(),
    true,
  );
  expect(result.formId).toBe("fixed");
  expect(result.title).toBe("New");
  expect(result.processors).toEqual(draft.processors);
  expect(result.mdaContactId).toBe("mda");
  expect(result.meta).toEqual(draft.meta);
  expect(result.catchmentRouting).toEqual(draft.catchmentRouting);
  expect(result.steps.find((step) => step.stepId === "one")?.nextSteps).toEqual(
    draft.steps[0].nextSteps,
  );
  expect(
    result.steps.some((step) => step.stepId === "submission-confirmation"),
  ).toBe(true);
  expect(() =>
    prepareFormDraft(draft, { title: "Broken" }, getCatalog(), true),
  ).toThrow();
});

it("restores only inert transcript data and separates users and documents", () => {
  const result = restoreTranscript([
    {
      id: "assistant",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "call",
          name: "apply_form_draft",
          arguments: JSON.stringify(proposal),
          input: proposal,
          state: "approval-requested",
          approval: { id: "approval", needsApproval: true },
        },
      ],
    },
  ]);
  expect(result[0].parts.every((part) => part.type === "text")).toBe(true);
  expect(JSON.stringify(result)).not.toContain("approval-requested");
  expect(historyKey("alice", "form", "one")).not.toBe(
    historyKey("bob", "form", "one"),
  );
  expect(historyKey("alice", "form", "one")).not.toBe(
    historyKey("alice", "form", "two"),
  );
});

it("cancels and invalidates an approved edit when the assistant closes", async () => {
  const apply = vi.fn();
  const prepare = async () => ({
    before: {},
    after: { title: "Proposed" },
    warnings: [],
    apply,
  });
  const view = render(<Assistant {...props} open prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  await propose();
  view.rerender(<Assistant {...props} open prepare={prepare} />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Apply to draft" }),
    ).not.toBeDisabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply to draft" }));
  view.rerender(<Assistant {...props} open={false} prepare={prepare} />);
  expect(harness.stop).toHaveBeenCalled();
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});

it("resolves clarification questions through TanStack client-tool results with the custom answer", async () => {
  const prepare = vi.fn();
  const view = render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  await act(async () => {
    await harness.options.fetcher(
      { messages: [], threadId: "t", runId: "r" },
      { signal: new AbortController().signal },
    );
    harness.options.onChunk({
      type: "TOOL_CALL_START",
      toolCallId: "question",
    });
  });
  harness.messages = [
    {
      id: "m",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "question",
          name: "ask_questions",
          state: "input-complete",
          input: {
            questions: [
              {
                question: "Who is this for?",
                type: "radio",
                options: ["Residents", "Businesses"],
              },
            ],
          },
        },
      ],
    },
  ];
  view.rerender(<Assistant {...props} prepare={prepare} />);
  fireEvent.change(screen.getByLabelText("Custom answer"), {
    target: { value: "Registered charities" },
  });
  fireEvent.click(screen.getByText("Send answers"));
  await waitFor(() =>
    expect(harness.addToolResult).toHaveBeenCalledWith({
      toolCallId: "question",
      tool: "ask_questions",
      output: {
        status: "answered",
        answers: [
          {
            question: "Who is this for?",
            choices: [],
            custom: "Registered charities",
          },
        ],
      },
    }),
  );
  expect(prepare).not.toHaveBeenCalled();
});

it("keeps one workspace conversation across editors and rejects an approval from the previous document", async () => {
  const apply = vi.fn();
  const prepare = async () => ({
    before: {},
    after: { title: "Proposed" },
    warnings: [],
    apply,
  });
  function Editor() {
    const assistant = useGlobalAssistant();
    const [documentId, setDocumentId] = useState("one");
    return (
      <>
        <button onClick={() => assistant.setOpen(true)}>Ask AI</button>
        <button onClick={() => setDocumentId("two")}>Open guidance page</button>
        <WorkspaceAssistant
          key={documentId}
          {...props}
          documentId={documentId}
          document={{
            title: documentId === "one" ? "Application form" : "Guidance page",
          }}
          kind={documentId === "one" ? "form" : "content"}
          open={assistant.open}
          onOpenChange={assistant.setOpen}
          prepare={prepare}
        />
      </>
    );
  }
  const ui = () => (
    <GlobalAssistantProvider>
      <Editor />
    </GlobalAssistantProvider>
  );
  const view = render(ui());
  fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
  const input = await screen.findByRole("textbox", {
    name: "Message the assistant",
  });
  fireEvent.change(input, {
    target: { value: "Help me improve this service" },
  });
  const thread = harness.options.threadId;
  await propose();
  view.rerender(ui());
  const approve = await screen.findByRole("button", { name: "Apply to draft" });
  await waitFor(() => expect(approve).not.toBeDisabled());
  fireEvent.click(approve);
  fireEvent.click(screen.getByRole("button", { name: "Open guidance page" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Apply to draft" }),
    ).toBeDisabled(),
  );
  expect(
    screen.getByRole("dialog", { name: "Workspace assistant" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Message the assistant" })).toBe(
    input,
  );
  expect(input).toHaveValue("Help me improve this service");
  expect(harness.options.threadId).toBe(thread);
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});

it("reports a failed shared save and does not claim the AI edit was applied", async () => {
  let fail!: (reason: Error) => void;
  const apply = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  const prepare = async (): Promise<PreparedChange> => ({
    before: { title: "Current" },
    after: { title: "Proposed" },
    warnings: [],
    apply,
  });
  const view = render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  await propose();
  await act(async () => {
    view.rerender(<Assistant {...props} prepare={prepare} />);
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply to draft" }));
  let result!: Promise<{ applied: boolean }>;
  act(() => {
    result = harness.options.tools[0].execute(proposal, { toolCallId: "call" });
  });
  expect(apply).toHaveBeenCalledTimes(1);
  let finished = false;
  result.then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  await act(async () => {
    fail(new Error("A newer service revision exists"));
  });
  expect((await result).applied).toBe(false);
});

function autoConversation() {
  const scope = historyKey(props.user, props.kind, props.documentId);
  writeConversations(scope, [
    { id: `${scope}:auto`, title: "Automatic edits", permission: "auto" },
  ]);
}

function publishInterrupts(source = "live") {
  harness.options.onInterruptStateChange(
    { interrupts: harness.interrupts },
    { source },
  );
}

it("auto validates once, resolves once, and executes the exact candidate once with warnings", async () => {
  autoConversation();
  const apply = vi.fn();
  const prepare = vi.fn(async () => ({
    before: {},
    after: { title: "Proposed" },
    warnings: ["Repair this field"],
    apply,
  }));
  const view = render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  const resolve = await propose();
  await act(async () => {
    publishInterrupts();
    publishInterrupts();
  });
  view.rerender(<Assistant {...props} prepare={prepare} />);
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(resolve).toHaveBeenCalledExactlyOnceWith(true);
  expect(apply).not.toHaveBeenCalled();
  harness.messages = [
    {
      id: "response",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "call",
          name: "apply_form_draft",
          state: "approval-requested",
          input: proposal,
        },
      ],
    },
  ];
  view.rerender(<Assistant {...props} prepare={prepare} />);
  const validating = screen.getByRole("button", {
    name: /Checking the proposed draft/,
  });
  harness.interrupts = [];
  view.rerender(<Assistant {...props} prepare={prepare} />);
  expect(
    screen.getByRole("button", { name: /Checking the proposed draft/ }),
  ).toBe(validating);
  let output: any;
  await act(async () => {
    output = await harness.options.tools[0].execute(proposal, {
      toolCallId: "call",
    });
  });
  expect(output).toEqual({
    applied: true,
    message: expect.stringContaining("Repair this field"),
  });
  expect(apply).toHaveBeenCalledOnce();
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
  harness.interrupts = [];
  harness.messages = [
    {
      id: "response",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "call",
          name: "apply_form_draft",
          state: "output-available",
          input: proposal,
          output,
        },
      ],
    },
  ];
  view.rerender(<Assistant {...props} prepare={prepare} />);
  fireEvent.click(screen.getByRole("button", { name: /Applied to draft/ }));
  expect(screen.getByRole("button", { name: "title" })).toBeInTheDocument();
});

it("returns invalid Auto proposals to the model as failed edits", async () => {
  autoConversation();
  const prepare = vi.fn(async () => {
    throw new Error("The recipe needs steps");
  });
  render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  const resolve = await propose();
  await act(async () => publishInterrupts());
  expect(resolve).toHaveBeenCalledExactlyOnceWith(true);
  expect(
    await harness.options.tools[0].execute(proposal, { toolCallId: "call" }),
  ).toEqual({ applied: false, message: "The recipe needs steps" });
});

it("never auto-resolves restored interrupts or tools outside the draft-edit allowlist", async () => {
  autoConversation();
  const prepare = vi.fn();
  const view = render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  const resolve = await propose();
  await act(async () => publishInterrupts("hydrate"));
  expect(resolve).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  harness.interrupts[0].toolName = "delete_service";
  await act(async () => publishInterrupts());
  expect(resolve).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  view.rerender(<Assistant {...props} prepare={prepare} />);
  expect(
    screen.getByRole("region", { name: "Review proposed changes" }),
  ).toBeInTheDocument();
});

it("cancels Auto validation when stopped and never runs its apply handler", async () => {
  autoConversation();
  let complete!: (value: PreparedChange) => void;
  const apply = vi.fn();
  const prepare = () =>
    new Promise<PreparedChange>((resolve) => {
      complete = resolve;
    });
  render(<Assistant {...props} open prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  const resolve = await propose();
  act(() => publishInterrupts());
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  await act(async () =>
    complete({ before: {}, after: { title: "Proposed" }, warnings: [], apply }),
  );
  expect(resolve).not.toHaveBeenCalled();
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});

it("clears Auto approval if TanStack cannot resolve the interrupt", async () => {
  autoConversation();
  const apply = vi.fn();
  const prepare = async () => ({
    before: {},
    after: { title: "Proposed" },
    warnings: [],
    apply,
  });
  render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  const resolve = await propose();
  resolve.mockImplementation(() => {
    throw new Error("Run was reset");
  });
  await act(async () => publishInterrupts());
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});

it("persists permission per conversation and defaults new conversations to Ask", async () => {
  const user = userEvent.setup();
  render(<Assistant {...props} prepare={vi.fn()} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  const previous = harness.options.threadId;
  await user.click(screen.getByRole("button", { name: "Edit behavior: Ask" }));
  await user.click(
    await screen.findByRole("menuitemradio", { name: /Automatically edit/ }),
  );
  expect(
    screen.getByRole("button", { name: "Edit behavior: Auto" }),
  ).toBeInTheDocument();
  expect(
    readConversations(
      historyKey(props.user, props.kind, props.documentId),
    ).find((item) => item.id === previous)?.permission,
  ).toBe("auto");
  await user.click(screen.getByRole("button", { name: "New conversation" }));
  expect(
    screen.getByRole("button", { name: "Edit behavior: Ask" }),
  ).toBeInTheDocument();
  expect(harness.options.threadId).not.toBe(previous);
});

it("sends only the read-only capability to the server even for an Auto conversation", async () => {
  autoConversation();
  render(<Assistant {...props} readOnly prepare={vi.fn()} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  await propose();
  expect(vi.mocked(streamChat).mock.lastCall?.[1].mode).toBe("ask");
  expect(vi.mocked(streamChat).mock.lastCall?.[1]).not.toHaveProperty(
    "permission",
  );
  expect(
    screen.getByRole("button", { name: "Edit behavior: Ask" }),
  ).toBeDisabled();
});

it("expands and narrows the harness without remounting the composer", async () => {
  render(<Assistant {...props} prepare={vi.fn()} />);
  const input = await screen.findByRole("textbox", {
    name: "Message the assistant",
  });
  fireEvent.change(input, { target: { value: "Keep this prompt" } });
  fireEvent.click(screen.getByRole("button", { name: "Expand assistant" }));
  expect(
    screen.getByRole("combobox", { name: "Conversation" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("complementary", { name: "Preview and changes" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Message the assistant" })).toBe(
    input,
  );
  fireEvent.click(screen.getByRole("button", { name: "Narrow assistant" }));
  expect(
    screen.queryByRole("navigation", { name: "Conversations" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(input).toHaveValue("Keep this prompt");
});

it("keeps compact harnesses as a modal conversation without side panes", async () => {
  window.matchMedia = () =>
    ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  render(<Assistant {...props} harness prepare={vi.fn()} />);
  await screen.findByRole("textbox", { name: "Message the assistant" });
  expect(
    screen.queryByRole("navigation", { name: "Conversations" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: "Conversation" }),
  ).toBeInTheDocument();
});

it("routes an explicit open-document target through its editor", async () => {
  const prepare = vi.fn(async () => ({
    before: {},
    after: { title: "Proposed" },
    warnings: [],
    apply: vi.fn(),
  }));
  const target = { serviceId: "service-one" };
  const view = render(
    <Assistant {...props} target={target} prepare={prepare} />,
  );
  await waitFor(() => expect(harness.options).toBeTruthy());
  await propose();
  harness.interrupts[0].originalArgs = { ...proposal, target };
  view.rerender(<Assistant {...props} target={target} prepare={prepare} />);
  await waitFor(() => expect(prepare).toHaveBeenCalled());
  expect(prepareServiceEdit).not.toHaveBeenCalled();
});

it("uses the service revision for external edits while retaining a live run binding", async () => {
  const apply = vi.fn();
  vi.mocked(prepareServiceEdit).mockResolvedValue({
    before: {},
    after: { title: "Proposed" },
    warnings: [],
    external: true,
    apply,
  });
  const prepare = vi.fn();
  const target = { serviceId: "service-one" };
  const view = render(
    <Assistant {...props} target={target} prepare={prepare} />,
  );
  await waitFor(() => expect(harness.options).toBeTruthy());
  const resolve = await propose();
  harness.interrupts[0].originalArgs = {
    ...proposal,
    target: { serviceId: "service-two" },
  };
  view.rerender(
    <Assistant
      {...props}
      target={target}
      revisionSource="drift"
      prepare={prepare}
    />,
  );
  const button = await screen.findByRole("button", { name: "Apply to draft" });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  expect(resolve).toHaveBeenCalledWith(true);
  await act(async () =>
    expect(
      (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
        .applied,
    ).toBe(true),
  );
  expect(apply).toHaveBeenCalledOnce();
  expect(prepare).not.toHaveBeenCalled();
  harness.interrupts = [
    { ...harness.interrupts[0], id: "unbound", toolCallId: "unbound" },
  ];
  view.rerender(<Assistant {...props} target={target} prepare={prepare} />);
  expect(screen.getByRole("button", { name: "Apply to draft" })).toBeDisabled();
  expect(
    (
      await harness.options.tools[0].execute(proposal, {
        toolCallId: "unbound",
      })
    ).applied,
  ).toBe(false);
});

it("shows failed approval resumes as retryable errors and clears the approved edit", async () => {
  autoConversation();
  const apply = vi.fn();
  const prepare = async () => ({
    before: {},
    after: { title: "Proposed" },
    warnings: [],
    apply,
  });
  const view = render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  await propose();
  await act(async () => publishInterrupts());
  harness.interrupts[0].status = "error";
  await act(async () => publishInterrupts());
  view.rerender(<Assistant {...props} prepare={prepare} />);
  expect(
    screen.getByRole("button", { name: /Not applied/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  expect(
    (await harness.options.tools[0].execute(proposal, { toolCallId: "call" }))
      .applied,
  ).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});

it("hides the editor in harness mode without unmounting its registration", async () => {
  function Editor() {
    const { open, setOpen } = useGlobalAssistant();
    return (
      <div data-testid="editor">
        <button onClick={() => setOpen(true)}>Ask AI</button>
        <WorkspaceAssistant
          {...props}
          open={open}
          onOpenChange={setOpen}
          prepare={vi.fn()}
        />
      </div>
    );
  }
  render(
    <GlobalAssistantProvider>
      <Editor />
    </GlobalAssistantProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
  const editor = screen.getByTestId("editor");
  fireEvent.click(screen.getByRole("button", { name: "Expand assistant" }));
  expect(editor).toBeInTheDocument();
  expect(editor).not.toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "Conversation" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Narrow assistant" }));
  expect(editor).toBeVisible();
});

it("keeps other reviews enabled while one approval in the same batch is staged", async () => {
  const prepare = async () => ({
    before: {},
    after: { title: "Proposed" },
    warnings: [],
    apply: vi.fn(),
  });
  const view = render(<Assistant {...props} prepare={prepare} />);
  await waitFor(() => expect(harness.options).toBeTruthy());
  const first = await propose();
  harness.options.onChunk({ type: "TOOL_CALL_START", toolCallId: "second" });
  const second = vi.fn();
  harness.interrupts.push({
    ...harness.interrupts[0],
    id: "second",
    toolCallId: "second",
    resolveInterrupt: second,
  });
  view.rerender(<Assistant {...props} prepare={prepare} />);
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: "Apply to draft" })[1],
    ).not.toBeDisabled(),
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Apply to draft" })[0]);
  expect(first).toHaveBeenCalledWith(true);
  expect(
    screen.getAllByRole("button", { name: "Apply to draft" })[1],
  ).not.toBeDisabled();
  fireEvent.click(screen.getAllByRole("button", { name: "Apply to draft" })[1]);
  expect(second).toHaveBeenCalledWith(true);
});

it("opens changes for a new proposal, respects closing through validation, and reopens for the next proposal", async () => {
  let finish!: (change: PreparedChange) => void;
  const prepare = vi.fn(
    () =>
      new Promise<PreparedChange>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<Assistant {...props} harness prepare={prepare} />);
  const input = await screen.findByRole("textbox", {
    name: "Message the assistant",
  });
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  await propose();
  view.rerender(<Assistant {...props} harness prepare={prepare} />);
  expect(
    await screen.findByRole("complementary", { name: "Preview and changes" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Close preview and changes" }),
  );
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  await act(async () =>
    finish({
      before: { title: "Old" },
      after: { title: "New" },
      warnings: [],
      apply: vi.fn(),
    }),
  );
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply to draft" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: /^View changes/ }));
  expect(screen.getByRole("button", { name: "title" })).toBeVisible();
  act(() => {
    harness.options.onChunk({
      type: "TOOL_CALL_START",
      toolCallId: "next",
      toolName: "apply_form_draft",
    });
  });
  expect(
    screen.getByRole("complementary", { name: "Preview and changes" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Message the assistant" })).toBe(
    input,
  );
});
