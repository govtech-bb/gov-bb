import {
  EventType,
  type Modality,
  type ModelMessage,
  type RunFinishedEvent,
  type RunStartedEvent,
  type StreamChunk,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
  type TextOptions,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallStartEvent,
} from "@tanstack/ai";
import {
  BaseTextAdapter,
  type StructuredOutputResult,
} from "@tanstack/ai/adapters";

// A scripted stand-in for the Bedrock chat adapter, gated by env.LLM_MOCK. It
// is NOT a model: it derives the next action purely from the message history —
// the same tool-call/result parts the real model reads — and drives a complete
// collect-form loop deterministically:
//
//   getFormDefinition → (present → wait → set)* → summarise → submitForm → done
//
// Everything downstream is the REAL system: the agent loop, the server form
// tools (getFormDefinition/presentField/setField/submitForm against the real
// forms API), the shared validation/coercion engine, the approval gate, and the
// React widgets. Only the model's token/tool-call *decisions* are mocked, so an
// E2E exercises the actual app minus the LLM. The field ORDER is taken from the
// real getFormDefinition result, so the mock is form-agnostic (one scenario per
// formId, no hard-coded field lists).
//
// It emits the exact AG-UI event sequence the Bedrock adapter produces (see
// ai-bedrock/stream.ts), so the framework and client can't tell the difference.

interface MockModelOptions extends Record<string, unknown> {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

function parseJson(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function userText(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: "text"; content: string } => p.type === "text")
      .map((p) => p.content)
      .join("");
  }
  return "";
}

// Flatten every assistant tool call across the history.
function allCalls(messages: ReadonlyArray<ModelMessage>): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls) {
      for (const tc of m.toolCalls) {
        calls.push({
          id: tc.id,
          name: tc.function.name,
          args: parseJson(tc.function.arguments),
        });
      }
    }
  }
  return calls;
}

// The tool-result message for a given toolCallId, parsed.
function resultFor(
  messages: ReadonlyArray<ModelMessage>,
  id: string,
): Record<string, unknown> | undefined {
  for (const m of messages) {
    if (m.role === "tool" && m.toolCallId === id) return parseJson(m.content);
  }
  return undefined;
}

type AdapterModalities = ReadonlyArray<Modality>;

export class MockTextAdapter extends BaseTextAdapter<
  string,
  MockModelOptions,
  AdapterModalities,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors the Bedrock adapter; per-modality metadata is unused here
  any
> {
  readonly name = "mock" as const;
  private readonly formId: string;

  constructor(model: string, formId: string) {
    super({}, model);
    this.formId = formId;
  }

  // eslint-disable-next-line require-yield -- the mock never produces structured output
  async structuredOutput(): Promise<StructuredOutputResult<unknown>> {
    throw new Error("MockTextAdapter: structuredOutput is not supported");
  }

  async *chatStream(
    options: TextOptions<MockModelOptions>,
  ): AsyncIterable<StreamChunk> {
    const messages = options.messages as ReadonlyArray<ModelMessage>;
    if (process.env.LLM_MOCK_DEBUG) {
      const summary = messages.map((m) => {
        if (m.role === "assistant" && m.toolCalls?.length) {
          return `a:[${m.toolCalls.map((t) => t.function.name).join(",")}]`;
        }
        if (m.role === "tool") return `t:${String(m.toolCallId).slice(-6)}`;
        return m.role[0];
      });
      console.error(`[mock] in: ${summary.join(" ")}`);
    }
    const ctx: Ctx = {
      model: options.model || this.model,
      runId: options.runId ?? `mock-run-${counter()}`,
      threadId: options.threadId ?? `mock-thread-${counter()}`,
    };
    const formId = this.formId;

    const calls = allCalls(messages);
    const defCall = calls.find((c) => c.name === "getFormDefinition");
    const defResult = defCall ? resultFor(messages, defCall.id) : undefined;
    const requiredFields = (
      (defResult?.fields as
        | Array<{ fieldId: string; required?: boolean }>
        | undefined) ?? []
    )
      .filter((f) => f.required)
      .map((f) => f.fieldId);

    // Collected = setField calls whose result was ok; keep the raw value the
    // user gave (the same value submitForm will re-validate).
    const collected = new Map<string, string>();
    for (const c of calls) {
      if (c.name !== "setField") continue;
      const r = resultFor(messages, c.id);
      if (r?.ok) collected.set(String(c.args.fieldId), String(c.args.value));
    }
    const nextField = requiredFields.find((f) => !collected.has(f));

    const presentCalls = calls.filter((c) => c.name === "presentField");
    const presented = presentCalls.length
      ? String(presentCalls[presentCalls.length - 1]!.args.fieldId)
      : undefined;

    const submitCall = calls.find((c) => c.name === "submitForm");
    const submitResult = submitCall
      ? resultFor(messages, submitCall.id)
      : undefined;

    // 1. The submit has run (after approval) — close out with a final message.
    if (submitResult) {
      yield* textTurn(closingLine(submitResult), ctx);
      return;
    }

    const last = messages[messages.length - 1];
    const lastToolName =
      last?.role === "tool"
        ? calls.find((c) => c.id === last.toolCallId)?.name
        : undefined;

    // 2. React to the tool result that just came back this turn.
    if (lastToolName === "getFormDefinition") {
      if (requiredFields.length === 0) {
        yield* textTurn("There's nothing to collect for this form.", ctx);
        return;
      }
      yield* toolTurn(
        "presentField",
        { formId, fieldId: requiredFields[0] },
        ctx,
      );
      return;
    }
    if (lastToolName === "presentField") {
      // The widget is shown — end the turn and wait for the user to answer.
      // The terminal response MUST carry text: a real model emits something
      // here, and an empty assistant turn leaves the client in a pending-tool
      // state that auto-resumes the run (re-presenting the field). A brief line
      // both ends the turn cleanly and mirrors real model behaviour.
      yield* textTurn("Go ahead when you're ready.", ctx);
      return;
    }
    if (lastToolName === "setField") {
      const r = resultFor(messages, last!.toolCallId!);
      if (!r?.ok && presented) {
        yield* toolTurn("presentField", { formId, fieldId: presented }, ctx);
        return;
      }
      if (nextField) {
        yield* toolTurn("presentField", { formId, fieldId: nextField }, ctx);
        return;
      }
      yield* textTurn(summaryLine(collected), ctx);
      return;
    }

    // 3. The last message is from the user (initial ask, an answer, or "yes").
    if (!defCall) {
      yield* toolTurn("getFormDefinition", { formId }, ctx);
      return;
    }
    if (presented && !collected.has(presented)) {
      yield* toolTurn(
        "setField",
        { formId, fieldId: presented, value: userText(last!.content) },
        ctx,
      );
      return;
    }
    if (nextField) {
      yield* toolTurn("presentField", { formId, fieldId: nextField }, ctx);
      return;
    }
    // Everything required is collected and the user confirmed → submit.
    yield* toolTurn(
      "submitForm",
      { formId, values: Object.fromEntries(collected) },
      ctx,
    );
  }
}

export function mockTextAdapter(
  model: string,
  formId: string,
): MockTextAdapter {
  return new MockTextAdapter(model, formId);
}

// --- event emission (mirrors ai-bedrock/stream.ts exactly) ---

interface Ctx {
  model: string;
  runId: string;
  threadId: string;
}

let _seq = 0;
const counter = (): string => (_seq++).toString(36);
const uid = (prefix: string): string => `mock-${prefix}-${counter()}`;

function* textTurn(text: string, c: Ctx): Generator<StreamChunk> {
  const messageId = uid("msg");
  yield runStarted(c);
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    model: c.model,
    timestamp: Date.now(),
  } satisfies TextMessageStartEvent;
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: text,
    model: c.model,
    timestamp: Date.now(),
  } satisfies TextMessageContentEvent;
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    model: c.model,
    timestamp: Date.now(),
  } satisfies TextMessageEndEvent;
  yield runFinished(c, "stop");
}

function* toolTurn(
  name: string,
  args: Record<string, unknown>,
  c: Ctx,
): Generator<StreamChunk> {
  const toolCallId = uid("call");
  const messageId = uid("msg");
  yield runStarted(c);
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: name,
    toolName: name,
    parentMessageId: messageId,
    model: c.model,
    timestamp: Date.now(),
    index: 0,
  } satisfies ToolCallStartEvent;
  yield {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify(args),
    model: c.model,
    timestamp: Date.now(),
  } satisfies ToolCallArgsEvent;
  yield {
    type: EventType.TOOL_CALL_END,
    toolCallId,
    toolCallName: name,
    toolName: name,
    model: c.model,
    timestamp: Date.now(),
    input: args,
  } satisfies ToolCallEndEvent;
  yield runFinished(c, "tool_calls");
}

function runStarted(c: Ctx): RunStartedEvent {
  return {
    type: EventType.RUN_STARTED,
    runId: c.runId,
    threadId: c.threadId,
    model: c.model,
    timestamp: Date.now(),
  };
}

function runFinished(
  c: Ctx,
  finishReason: "stop" | "tool_calls",
): RunFinishedEvent {
  return {
    type: EventType.RUN_FINISHED,
    runId: c.runId,
    threadId: c.threadId,
    model: c.model,
    timestamp: Date.now(),
    finishReason,
  };
}

function humanise(fieldId: string): string {
  const s = fieldId.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function summaryLine(collected: Map<string, string>): string {
  const parts = [...collected].map(([k, v]) => `${humanise(k)}: ${v}`);
  return `Here's what I have — ${parts.join("; ")}. Shall I submit this? Reply "yes" to confirm.`;
}

function closingLine(result: Record<string, unknown>): string {
  if (result.dryRun) {
    return "That was a test run, so your answers were not actually submitted.";
  }
  if (result.ok) {
    return `Thanks — that's submitted. Your reference is ${String(result.reference ?? "")}.`;
  }
  return "Sorry, something went wrong submitting that.";
}
