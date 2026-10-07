import { createServerFn } from "@tanstack/react-start";
import { uiMessagesToWire } from "@tanstack/ai/client";
import type { ChatFetcherInput } from "@tanstack/ai-client";
import {
  aiContextSchema,
  askQuestionsTool,
  proposeContentTool,
  type AiContext,
} from "@govtech-bb/form-builder";
import { z } from "zod";

const demoChat = createServerFn({ method: "POST" })
  .inputValidator(z.object({ request: z.string().max(1_000_000) }))
  .handler(async ({ data }) => {
    if (process.env.NODE_ENV !== "development")
      throw new Error(
        "The assistant demo is available only in local development.",
      );
    const {
      chat,
      chatParamsFromRequestBody,
      toolDefinition,
      maxIterations,
      toServerSentEventsResponse,
      EventType,
    } = await import("@tanstack/ai");
    const params = await chatParamsFromRequestBody(JSON.parse(data.request));
    const context = aiContextSchema.parse(params.forwardedProps);
    if (context.kind !== "content" || params.messages.length > 100)
      throw new Error("Start a new page demo conversation.");

    // ponytail: deterministic demo scenarios; use the regular transport for real AI responses.
    const adapter: import("@tanstack/ai").AnyTextAdapter = {
      kind: "text",
      name: "scripted-demo",
      model: "scripted-demo",
      "~types": undefined as never,
      structuredOutput: async () => {
        throw new Error("The demo supports streaming text only.");
      },
      async *chatStream({ messages }) {
        const messageId = crypto.randomUUID();
        const lastUser = messages
          .map((message) => message.role)
          .lastIndexOf("user");
        const outcome = messages
          .slice(lastUser + 1)
          .reverse()
          .find((message) => message.role === "tool");
        const prompt = JSON.stringify(
          messages[lastUser]?.content ?? "",
        ).toLowerCase();
        const questions = /ask me questions/.test(prompt);
        const codeExample = /code example/.test(prompt);
        const warning = /warning|validation/.test(prompt);
        const checklist = /checklist|bring/.test(prompt);
        const body = String(context.document.body ?? "");
        const proposal = proposeContentTool.inputSchema.parse({
          operation: "update",
          summary: warning
            ? "Add opening hours that need confirmation"
            : checklist
              ? "Add a checklist of what to bring"
              : "Make the library card page easier to understand",
          patch: warning
            ? {
                body:
                  body + "\n\n## When to visit\n\n[Confirm the opening hours]",
              }
            : checklist
              ? {
                  body:
                    body +
                    "\n\n## What to bring\n\n- Photo ID\n- Proof of your address\n\nComplete the registration form at your local library.",
                }
              : {
                  title: "Get a library card",
                  description:
                    "Find out what to bring and how to join your local library.",
                  body: "## Join your local library\n\nVisit your nearest library to apply for a library card.\n\n### What to bring\n\n- Photo ID\n- Proof of your address\n\n### At the library\n\nComplete the registration form. Library staff will help you get your membership card.",
                },
        });
        let reply: string;
        if (outcome) {
          let result: { applied?: boolean } = {};
          try {
            result = JSON.parse(String(outcome.content));
          } catch {
            // Rejected approvals can be returned as plain text by the chat engine.
          }
          reply = questions
            ? "Thanks. I’ll use your answers to help improve this page. Your draft is unchanged."
            : result.applied
              ? "Updated the demo draft. You can see the changes in the page preview. Nothing has been saved or published."
              : "The demo draft was left unchanged. You can try another example when you are ready.";
        } else if (questions) {
          reply = "Before we change this page, I have two quick questions.";
        } else if (codeExample) {
          reply =
            "Here is the sample page’s content structure:\n\n```json\n" +
            JSON.stringify(
              {
                title: context.document.title,
                description: context.document.description,
                visibility: "draft",
              },
              null,
              2,
            ) +
            "\n```\n\nYou can copy the example. This has not changed the draft.";
        } else if (context.mode === "ask") {
          reply =
            "This sample page explains how to get a library card. I would use a shorter title, replace formal wording with plain language, and add a checklist of what to bring.\n\nThis draft is read-only, so these are suggestions only. Your draft is unchanged.";
        } else {
          reply = warning
            ? "This example deliberately includes an unconfirmed detail. Review the warning and choose whether to apply the draft."
            : "I have prepared a clearer version of this sample page. Review the preview and changes before applying it.";
        }

        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
        };
        for (const delta of reply.match(/.{1,36}/gs) ?? []) {
          yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta };
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        yield { type: EventType.TEXT_MESSAGE_END, messageId };
        const callTool =
          !outcome && !codeExample && (questions || context.mode === "edit");
        if (callTool) {
          const toolCallId = crypto.randomUUID();
          const toolName = questions
            ? askQuestionsTool.name
            : proposeContentTool.name;
          const args = JSON.stringify(
            questions
              ? {
                  questions: [
                    {
                      question: "Who is this page for?",
                      type: "radio",
                      options: [
                        "First-time library visitors",
                        "Existing library members",
                      ],
                    },
                    {
                      question: "What should we improve?",
                      type: "check",
                      options: [
                        "Plain language",
                        "What to bring",
                        "Page structure",
                      ],
                    },
                  ],
                }
              : proposal,
          );
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: toolName,
            toolName,
            parentMessageId: messageId,
          };
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId,
            delta: args.slice(0, Math.floor(args.length / 2)),
          };
          await new Promise((resolve) => setTimeout(resolve, 400));
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId,
            delta: args.slice(Math.floor(args.length / 2)),
          };
          yield { type: EventType.TOOL_CALL_END, toolCallId };
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: params.runId,
          threadId: params.threadId,
          finishReason: callTool ? "tool_calls" : "stop",
        };
      },
    };
    return toServerSentEventsResponse(
      chat({
        adapter,
        messages: params.messages,
        threadId: params.threadId,
        runId: params.runId,
        parentRunId: params.parentRunId,
        ...(params.resume ? { resume: params.resume } : {}),
        tools: [
          toolDefinition(askQuestionsTool),
          ...(context.mode === "edit"
            ? [toolDefinition(proposeContentTool)]
            : []),
        ],
        agentLoopStrategy: maxIterations(2),
        debug: false,
      }),
    );
  });

export function streamDemo(
  input: ChatFetcherInput,
  context: AiContext,
  signal: AbortSignal,
): Promise<Response> {
  signal.throwIfAborted();
  return demoChat({
    data: {
      request: JSON.stringify({
        ...input,
        messages: uiMessagesToWire(input.messages),
        tools: [],
        context: [],
        state: {},
        forwardedProps: context,
      }),
    },
    signal,
  });
}
