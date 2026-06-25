export { BedrockTextAdapter, bedrockText } from "./adapter.js";
export type { BedrockTextAdapterConfig } from "./types.js";
export {
  BEDROCK_MODEL_ALIASES,
  BEDROCK_MODELS,
  resolveBedrockModelId,
  type BedrockModelAlias,
} from "./models.js";
export { emitTextTurn, type TextTurnIds } from "./static-text-turn.js";
