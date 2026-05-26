// Bedrock model aliases. Real Bedrock model IDs are long and region-suffixed
// ("us.anthropic.claude-haiku-4-5-20251001-v1:0"), so callers usually want to
// pass the same short name they'd use with the Anthropic adapter and have us
// expand it.  Unknown values fall through unchanged, so callers can always
// pass a raw Bedrock model or inference-profile ID for regions / variants we
// haven't catalogued.

export const BEDROCK_MODEL_ALIASES = {
  "claude-haiku-4-5": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "claude-sonnet-4-5": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "claude-sonnet-4-6": "us.anthropic.claude-sonnet-4-6-20250929-v1:0",
  "claude-3-5-sonnet-v2": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
  "claude-3-5-haiku": "us.anthropic.claude-3-5-haiku-20241022-v1:0",
} as const satisfies Record<string, string>;

export type BedrockModelAlias = keyof typeof BEDROCK_MODEL_ALIASES;

export const BEDROCK_MODELS = Object.keys(
  BEDROCK_MODEL_ALIASES,
) as Array<BedrockModelAlias>;

export function resolveBedrockModelId(name: string): string {
  return name in BEDROCK_MODEL_ALIASES
    ? BEDROCK_MODEL_ALIASES[name as BedrockModelAlias]
    : name;
}
