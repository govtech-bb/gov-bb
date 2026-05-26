import type {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
} from "@aws-sdk/client-bedrock-runtime";

export interface BedrockTextAdapterConfig {
  region?: string;
  credentials?: BedrockRuntimeClientConfig["credentials"];
  /**
   * Pre-configured client. When supplied, `region` and `credentials` are
   * ignored. Intended for tests and for callers that need custom retry /
   * endpoint behaviour.
   */
  client?: BedrockRuntimeClient;
}
