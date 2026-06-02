import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  ConverseStreamCommand,
  type ConverseStreamCommandInput,
  type ConverseStreamOutput,
} from "@aws-sdk/client-bedrock-runtime";
import type { Modality, StreamChunk, TextOptions } from "@tanstack/ai";
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from "@tanstack/ai/adapters";
import { BaseTextAdapter } from "@tanstack/ai/adapters";
import {
  jsonSchemaToBedrockStructuredTool,
  modelMessagesToBedrock,
  systemPromptsToBedrock,
  toolsToBedrockToolConfig,
} from "./messages.js";
import { resolveBedrockModelId } from "./models.js";
import {
  createTranslatorState,
  errorChunk,
  finalizeStream,
  translateBedrockStreamEvent,
  translateConverseOutput,
} from "./stream.js";
import type { BedrockTextAdapterConfig } from "./types.js";

const DEFAULT_REGION =
  process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "ca-central-1";

export class BedrockTextAdapter extends BaseTextAdapter<
  string,
  Record<string, unknown>,
  ReadonlyArray<Modality>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter does not narrow per-modality metadata
  any
> {
  readonly name = "bedrock" as const;
  private readonly client: BedrockRuntimeClient;
  private readonly resolvedModelId: string;
  private readonly cacheSystemPrompt: boolean;

  constructor(config: BedrockTextAdapterConfig, model: string) {
    super({}, model);
    this.resolvedModelId = resolveBedrockModelId(model);
    this.cacheSystemPrompt = config.cacheSystemPrompt ?? false;
    if (config.client) {
      this.client = config.client;
    } else {
      this.client = new BedrockRuntimeClient({
        region: config.region ?? DEFAULT_REGION,
        ...(config.credentials ? { credentials: config.credentials } : {}),
      });
    }
  }

  async *chatStream(
    options: TextOptions<Record<string, unknown>>,
  ): AsyncIterable<StreamChunk> {
    const {
      messages,
      tools,
      systemPrompts,
      temperature,
      topP,
      maxTokens,
      request,
      logger,
    } = options;

    const bedrockMessages = modelMessagesToBedrock(messages);
    const system = systemPromptsToBedrock(systemPrompts, {
      cacheFirstBlock: this.cacheSystemPrompt,
    });
    const toolConfig = toolsToBedrockToolConfig(tools);
    const inferenceConfig = buildInferenceConfig(temperature, topP, maxTokens);

    const baseInput: ConverseCommandInput = {
      modelId: this.resolvedModelId,
      messages: bedrockMessages,
      ...(system !== undefined && { system }),
      ...(inferenceConfig !== undefined && { inferenceConfig }),
      ...(toolConfig !== undefined && { toolConfig }),
    };

    const state = createTranslatorState({
      model: options.model || this.resolvedModelId,
      runId: options.runId ?? this.generateId(),
      threadId: options.threadId ?? this.generateId(),
      messageId: this.generateId(),
      parentRunId: options.parentRunId,
    });

    logger.request(
      `activity=chat provider=bedrock model=${state.model} messages=${bedrockMessages.length} tools=${tools?.length ?? 0} stream=true`,
      { provider: "bedrock", model: state.model },
    );

    try {
      const command = new ConverseStreamCommand(
        baseInput as ConverseStreamCommandInput,
      );
      const response = await this.client.send(command, {
        abortSignal: request?.signal ?? undefined,
      });

      const stream = response.stream as
        | AsyncIterable<ConverseStreamOutput>
        | undefined;
      if (!stream) {
        yield errorChunk(state, "No stream in Bedrock response");
        return;
      }

      for await (const event of stream) {
        logger.provider(`provider=bedrock event=${eventKind(event)}`, {
          chunk: event,
        });
        for (const chunk of translateBedrockStreamEvent(event, state)) {
          yield chunk;
        }
      }

      yield* finalizeStream(state);
    } catch (streamErr) {
      const isAbort = isAbortError(streamErr);
      if (isAbort) {
        logger.errors("bedrock.chatStream aborted", {
          source: "bedrock.chatStream",
        });
        yield errorChunk(
          state,
          (streamErr as Error).message || "Request aborted",
          "aborted",
        );
        return;
      }

      logger.errors(
        `bedrock.chatStream stream failed, falling back to Converse: ${describeError(streamErr)}`,
        { error: streamErr, source: "bedrock.chatStream" },
      );

      try {
        const converse = new ConverseCommand(baseInput);
        const converseResp = await this.client.send(converse, {
          abortSignal: request?.signal ?? undefined,
        });
        const message = converseResp.output?.message;
        const content = message?.content ?? [];
        for (const chunk of translateConverseOutput(
          state,
          content,
          converseResp.stopReason,
          converseResp.usage,
        )) {
          yield chunk;
        }
      } catch (converseErr) {
        logger.errors(
          `bedrock.converse fallback failed: ${describeError(converseErr)}`,
          {
            error: converseErr,
            source: "bedrock.chatStream",
          },
        );
        yield errorChunk(state, describeError(converseErr));
      }
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<Record<string, unknown>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options;
    const { logger } = chatOptions;
    const bedrockMessages = modelMessagesToBedrock(chatOptions.messages);
    const system = systemPromptsToBedrock(chatOptions.systemPrompts);
    const inferenceConfig = buildInferenceConfig(
      chatOptions.temperature,
      chatOptions.topP,
      chatOptions.maxTokens,
    );
    const { toolConfig, toolName } =
      jsonSchemaToBedrockStructuredTool(outputSchema);

    const input: ConverseCommandInput = {
      modelId: this.resolvedModelId,
      messages: bedrockMessages,
      ...(system !== undefined && { system }),
      ...(inferenceConfig !== undefined && { inferenceConfig }),
      toolConfig,
    };

    logger.request(
      `activity=chat provider=bedrock model=${this.resolvedModelId} structured=true`,
      { provider: "bedrock", model: this.resolvedModelId },
    );

    let response;
    try {
      response = await this.client.send(new ConverseCommand(input), {
        abortSignal: chatOptions.request?.signal ?? undefined,
      });
    } catch (err) {
      logger.errors(`bedrock.structuredOutput failed: ${describeError(err)}`, {
        error: err,
        source: "bedrock.structuredOutput",
      });
      throw new Error(
        `Structured output generation failed: ${describeError(err)}`,
        { cause: err },
      );
    }

    // We forced `toolChoice: { tool: { name } }`, so the model must call
    // exactly this tool. If it didn't, something is wrong with the request
    // — surface that instead of silently parsing text.
    const content = response.output?.message?.content ?? [];
    for (const block of content) {
      const tu = (block as { toolUse?: { name?: string; input?: unknown } })
        .toolUse;
      if (tu && tu.name === toolName) {
        const data = tu.input ?? {};
        const rawText =
          typeof tu.input === "string"
            ? tu.input
            : JSON.stringify(tu.input ?? {});
        return { data, rawText };
      }
    }
    throw new Error(
      `Bedrock structured output: model did not call forced tool "${toolName}" (stopReason=${response.stopReason ?? "unknown"}).`,
    );
  }
}

function buildInferenceConfig(
  temperature: number | undefined,
  topP: number | undefined,
  maxTokens: number | undefined,
): { temperature?: number; topP?: number; maxTokens?: number } | undefined {
  const out: { temperature?: number; topP?: number; maxTokens?: number } = {};
  if (temperature !== undefined) out.temperature = temperature;
  if (topP !== undefined) out.topP = topP;
  if (maxTokens !== undefined) out.maxTokens = maxTokens;
  return Object.keys(out).length ? out : undefined;
}

function eventKind(event: ConverseStreamOutput): string {
  if (event.messageStart) return "messageStart";
  if (event.contentBlockStart) return "contentBlockStart";
  if (event.contentBlockDelta) return "contentBlockDelta";
  if (event.contentBlockStop) return "contentBlockStop";
  if (event.messageStop) return "messageStop";
  if (event.metadata) return "metadata";
  if (event.internalServerException) return "internalServerException";
  if (event.modelStreamErrorException) return "modelStreamErrorException";
  if (event.validationException) return "validationException";
  if (event.throttlingException) return "throttlingException";
  if (event.serviceUnavailableException) return "serviceUnavailableException";
  return "unknown";
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  return e.name === "AbortError" || /aborted/i.test(e.message ?? "");
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function bedrockText(
  model: string,
  config: BedrockTextAdapterConfig = {},
): BedrockTextAdapter {
  return new BedrockTextAdapter(config, model);
}

export type { BedrockTextAdapterConfig } from "./types.js";
