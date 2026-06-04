import type {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
} from "@aws-sdk/client-bedrock-runtime";

/**
 * Per-call provider options (`modelOptions` on `chat()`), mapped onto the
 * Converse `inferenceConfig`.
 */
export interface BedrockModelOptions extends Record<string, unknown> {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface BedrockTextAdapterConfig {
  region?: string;
  credentials?: BedrockRuntimeClientConfig["credentials"];
  /**
   * Pre-configured client. When supplied, `region` and `credentials` are
   * ignored. Intended for tests and for callers that need custom retry /
   * endpoint behaviour.
   */
  client?: BedrockRuntimeClient;
  /**
   * Emit a Converse cache point after the first system block so Bedrock caches
   * that (static) prefix and reuses it across requests. Only worthwhile when
   * the first block is a large constant prompt. Off by default — prompt caching
   * support varies by model and region, so verify cacheReadInputTokens before
   * relying on it.
   */
  cacheSystemPrompt?: boolean;
}
