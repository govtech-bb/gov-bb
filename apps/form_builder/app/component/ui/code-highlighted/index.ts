// Components
export { ShikiProvider, normalizeLanguage } from "./provider";
export { CodeHighlighted } from "./code-highlighted";
// Hook
export { useShikiHighlighter } from "./use-shiki-highlighter";
// Constants
export { LANGUAGE_ALIASES } from "./types";
// Types
export type {
  ShikiProviderProps,
  CodeHighlightedProps,
  UseShikiHighlighterResult,
  ShikiEngine,
  BundledLanguage,
  LanguageAlias,
  LanguageInput,
} from "./types";
