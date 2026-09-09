// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { getCatalog, type RecipeDraft } from "@govtech-bb/form-builder";
import { Assistant } from "./assistant";
import { prepareFormDraft } from "./form-assistant";
import { restoreTranscript, historyKey } from "./history";
import type { PreparedChange } from "./review";

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
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  HTMLDialogElement.prototype.show = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.show;
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
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
  view.rerender(<Assistant {...props} prepare={prepare} />);
  const button = await screen.findByRole("button", {
    name: "Apply with warnings",
  });
  await waitFor(() => expect(button).not.toBeDisabled());
  expect(apply).not.toHaveBeenCalled();
  expect(
    harness.options.tools[0].execute(proposal, { toolCallId: "call" }).applied,
  ).toBe(false);
  fireEvent.click(button);
  expect(resolve).toHaveBeenCalledWith(true);
  expect(apply).not.toHaveBeenCalled();
  expect(
    harness.options.tools[0].execute(proposal, { toolCallId: "call" }).applied,
  ).toBe(true);
  expect(apply).toHaveBeenCalledTimes(1);
  expect(
    harness.options.tools[0].execute(proposal, { toolCallId: "call" }).applied,
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
    harness.options.tools[0].execute(proposal, { toolCallId: "call" }).applied,
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
    harness.options.tools[0].execute(proposal, { toolCallId: "call" }).applied,
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
    harness.options.tools[0].execute(proposal, { toolCallId: "call" }).applied,
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
